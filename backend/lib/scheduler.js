const pool = require("../config/db");

/**
 * The jobs Remedy runs by itself, as set in Settings → Notifications:
 *
 *   • alerts — low stock, near expiry, refill reminders and overdue accounts,
 *     every `schedule.alerts_every_hours` hours (0 = only when someone presses
 *     "Run alerts now");
 *   • daily summary — the day's sales summary email, once a day from
 *     `schedule.summary_hour` (server time), when switched on.
 *
 * These used to need someone to press a button, or a cron job nobody set up.
 * Checked every few minutes; each job claims its turn in job_runs with a single
 * UPDATE, so a second process or a restart can't run it twice.
 */
const TICK_MS = 5 * 60 * 1000;

// Claim a job if its last run is older than `hours`. True = it's ours to run.
async function claim(job, hours) {
  const { rowCount } = await pool.query(
    "UPDATE job_runs SET last_run = NOW() WHERE job = $1 AND last_run < NOW() - ($2 || ' hours')::interval",
    [job, String(hours)]
  );
  return rowCount === 1;
}

async function tick() {
  const notes = require("../controllers/notificationsController");
  const cfg = notes.withDefaults(await require("./notify").getConfig());

  const every = Number(cfg.schedule.alerts_every_hours) || 0;
  if (every > 0 && (await claim("alerts", every - 0.05))) {
    const r = await notes.runAlertsNow();
    if (r.sent) console.log(`[scheduler] alerts sent: ${JSON.stringify(r)}`);
  }

  if (cfg.events.daily_summary && new Date().getHours() >= Number(cfg.schedule.summary_hour)) {
    // Once per calendar day: claimable when the last run was before today.
    const { rowCount } = await pool.query(
      "UPDATE job_runs SET last_run = NOW() WHERE job = 'daily_summary' AND last_run < date_trunc('day', NOW())"
    );
    if (rowCount === 1) {
      try {
        const r = await require("../controllers/reportsController").sendSummary({ period: "today" });
        console.log(`[scheduler] daily summary sent to ${r.sent}`);
      } catch (e) {
        console.warn(`[scheduler] daily summary: ${e.message}`);
      }
    }
  }
}

function startScheduler() {
  const run = () => tick().catch((e) => console.warn(`[scheduler] ${e.message}`));
  setTimeout(run, 60 * 1000).unref?.();         // a minute after start
  setInterval(run, TICK_MS).unref?.();
}

module.exports = { startScheduler, tick };
