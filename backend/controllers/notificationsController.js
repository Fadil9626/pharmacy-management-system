const pool = require("../config/db");
const { logAudit } = require("../lib/audit");
const { notify, getConfig, recentlyNotified } = require("../lib/notify");

const DEFAULTS = {
  email: { enabled: false, api_url: "", api_key: "", from: "", smtp_host: "", smtp_port: 587, smtp_user: "", smtp_pass: "", smtp_secure: false },
  sms: { enabled: false, api_url: "", api_key: "", sender: "" },
  events: {
    low_stock: true, near_expiry: true, refill_due: true,
    // Sent as they happen, to the alert recipients:
    till_variance: true,     // a till closed over or short by at least thresholds.till_variance
    large_refund: true,      // a refund of at least thresholds.large_refund
    overdue_accounts: true,  // customers owing with no payment for thresholds.overdue_days (with the scheduled alerts)
    daily_summary: false,    // the day's sales summary at schedule.summary_hour
  },
  recipients: { emails: [], phones: [] },
  dedupe_hours: 12,
  // Amounts are in the pharmacy's currency.
  thresholds: { till_variance: 100, large_refund: 1000, overdue_days: 30 },
  // alerts_every_hours: how often low stock / expiry / refills / overdue accounts
  // are checked without anyone pressing a button (0 = only when asked).
  schedule: { alerts_every_hours: 6, summary_hour: 20 },
};

const merge = (base, over) => ({ ...base, ...(over || {}) });
function withDefaults(cfg) {
  const c = cfg || {};
  return {
    email: merge(DEFAULTS.email, c.email),
    sms: merge(DEFAULTS.sms, c.sms),
    events: merge(DEFAULTS.events, c.events),
    recipients: merge(DEFAULTS.recipients, c.recipients),
    dedupe_hours: c.dedupe_hours != null ? c.dedupe_hours : DEFAULTS.dedupe_hours,
    thresholds: merge(DEFAULTS.thresholds, c.thresholds),
    schedule: merge(DEFAULTS.schedule, c.schedule),
  };
}
exports.withDefaults = withDefaults;

const nonNeg = (v, d) => (v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);

// Never leak provider secrets to the client — return a "*_key_set" flag instead.
exports.getConfig = async (_req, res) => {
  try {
    const cfg = withDefaults(await getConfig());
    res.json({
      email: { enabled: cfg.email.enabled, api_url: cfg.email.api_url, from: cfg.email.from, api_key_set: !!cfg.email.api_key,
               smtp_host: cfg.email.smtp_host, smtp_port: cfg.email.smtp_port, smtp_user: cfg.email.smtp_user, smtp_secure: !!cfg.email.smtp_secure, smtp_pass_set: !!cfg.email.smtp_pass },
      sms: { enabled: cfg.sms.enabled, api_url: cfg.sms.api_url, sender: cfg.sms.sender, api_key_set: !!cfg.sms.api_key },
      events: cfg.events,
      recipients: cfg.recipients,
      dedupe_hours: cfg.dedupe_hours,
      thresholds: cfg.thresholds,
      schedule: cfg.schedule,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Save config. A blank api_key keeps the stored one (so the masked form doesn't
// wipe secrets on every save).
exports.saveConfig = async (req, res) => {
  try {
    const cur = withDefaults(await getConfig());
    const b = req.body || {};
    const next = withDefaults({
      email: {
        enabled: !!b.email?.enabled,
        api_url: b.email?.api_url ?? cur.email.api_url,
        from: b.email?.from ?? cur.email.from,
        api_key: b.email?.api_key ? b.email.api_key : cur.email.api_key,
        smtp_host: b.email?.smtp_host ?? cur.email.smtp_host,
        smtp_port: b.email?.smtp_port != null ? Number(b.email.smtp_port) : cur.email.smtp_port,
        smtp_user: b.email?.smtp_user ?? cur.email.smtp_user,
        smtp_pass: b.email?.smtp_pass ? b.email.smtp_pass : cur.email.smtp_pass,
        smtp_secure: b.email?.smtp_secure != null ? !!b.email.smtp_secure : cur.email.smtp_secure,
      },
      sms: {
        enabled: !!b.sms?.enabled,
        api_url: b.sms?.api_url ?? cur.sms.api_url,
        sender: b.sms?.sender ?? cur.sms.sender,
        api_key: b.sms?.api_key ? b.sms.api_key : cur.sms.api_key,
      },
      events: { ...cur.events, ...(b.events || {}) },
      recipients: {
        emails: Array.isArray(b.recipients?.emails) ? b.recipients.emails.filter(Boolean) : cur.recipients.emails,
        phones: Array.isArray(b.recipients?.phones) ? b.recipients.phones.filter(Boolean) : cur.recipients.phones,
      },
      dedupe_hours: b.dedupe_hours != null ? Number(b.dedupe_hours) : cur.dedupe_hours,
      thresholds: {
        till_variance: nonNeg(b.thresholds?.till_variance, cur.thresholds.till_variance),
        large_refund: nonNeg(b.thresholds?.large_refund, cur.thresholds.large_refund),
        overdue_days: Math.max(1, Math.round(nonNeg(b.thresholds?.overdue_days, cur.thresholds.overdue_days))),
      },
      schedule: {
        alerts_every_hours: Math.min(168, Math.round(nonNeg(b.schedule?.alerts_every_hours, cur.schedule.alerts_every_hours))),
        summary_hour: Math.min(23, Math.round(nonNeg(b.schedule?.summary_hour, cur.schedule.summary_hour))),
      },
    });
    await pool.query("UPDATE settings SET notify_config = $1::jsonb, updated_at = NOW() WHERE id = 1", [JSON.stringify(next)]);
    logAudit(req, "notify_config_update", "settings", 1, { email: next.email.enabled, sms: next.sms.enabled });
    exports.getConfig(req, res);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.list = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, channel, recipient, type, subject, status, error, created_at
       FROM notifications ORDER BY created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Send a one-off test message to confirm a channel is wired up.
exports.test = async (req, res) => {
  const { channel, to } = req.body || {};
  if (!["email", "sms"].includes(channel)) return res.status(400).json({ message: "channel must be email or sms" });
  if (!to) return res.status(400).json({ message: "Enter a recipient to test" });
  try {
    const row = await notify({
      channel, to, type: "test",
      subject: "Remedy test notification",
      body: "This is a test notification from Remedy. If you received it, your channel is configured correctly.",
    });
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Recipients for ops alerts — configured list, else fall back to the pharmacy's
// own email/phone so alerts are demoable out of the box.
async function opsRecipients(cfg) {
  const s = await pool.query("SELECT email, phone FROM settings WHERE id = 1");
  const emails = cfg.recipients.emails.length ? cfg.recipients.emails : [s.rows[0]?.email].filter(Boolean);
  const phones = cfg.recipients.phones.length ? cfg.recipients.phones : [s.rows[0]?.phone].filter(Boolean);
  return { emails, phones };
}

async function fanout(cfg, { type, subject, body, ref_id }) {
  const { emails, phones } = await opsRecipients(cfg);
  const sent = [];
  if (cfg.email.enabled || emails.length) for (const to of emails) sent.push(await notify({ channel: "email", to, type, subject, body, ref_id }, cfg));
  if (cfg.sms.enabled || phones.length) for (const to of phones) sent.push(await notify({ channel: "sms", to, type, subject, body, ref_id }, cfg));
  return sent.length;
}

// Scan for alert conditions and emit (deduped) notifications. Call manually from
// the UI, or schedule via cron, e.g. hourly:
//   curl -s -XPOST http://127.0.0.1:5190/api/notifications/run-alerts -H "Authorization: Bearer <svc-token>"
exports.runAlerts = async (req, res) => {
  try {
    const result = await runAlertsNow();
    logAudit(req, "notify_run_alerts", "notifications", null, result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/**
 * Check everything that alerts and send what is due (deduplicated). Run by the
 * "Run alerts now" button and, on the schedule in Settings → Notifications, by
 * lib/scheduler.js.
 */
async function runAlertsNow() {
  {
    const cfg = withDefaults(await getConfig());
    const dh = cfg.dedupe_hours;
    const settings = (await pool.query("SELECT near_expiry_months FROM settings WHERE id = 1")).rows[0] || {};
    const months = Number(settings.near_expiry_months) || 3;
    const result = { low_stock: 0, near_expiry: 0, refill_due: 0, overdue_accounts: 0, sent: 0 };

    // 1) Low stock — products at/below reorder level (non-expired stock, all branches).
    if (cfg.events.low_stock && !(await recentlyNotified("low_stock", null, dh))) {
      const low = await pool.query(
        `SELECT p.name, p.reorder_level,
                COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE), 0)::int AS stock
         FROM products p LEFT JOIN product_batches b ON b.product_id = p.id
         WHERE p.is_active = true
         GROUP BY p.id, p.name, p.reorder_level
         HAVING COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE), 0) <= p.reorder_level
         ORDER BY stock ASC LIMIT 50`
      );
      if (low.rows.length) {
        result.low_stock = low.rows.length;
        const body = `Low / out of stock (${low.rows.length}):\n` +
          low.rows.map((r) => `• ${r.name}: ${r.stock} on hand (reorder at ${r.reorder_level})`).join("\n");
        result.sent += await fanout(cfg, { type: "low_stock", subject: `Low stock: ${low.rows.length} item(s)`, body });
      }
    }

    // 2) Near expiry — batches expiring within the configured window.
    if (cfg.events.near_expiry && !(await recentlyNotified("near_expiry", null, dh))) {
      const exp = await pool.query(
        `SELECT p.name, b.batch_no, b.quantity, b.expiry_date
         FROM product_batches b JOIN products p ON b.product_id = p.id
         WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL
           AND b.expiry_date <= (CURRENT_DATE + ($1 || ' months')::interval)
         ORDER BY b.expiry_date ASC LIMIT 50`,
        [String(months)]
      );
      if (exp.rows.length) {
        result.near_expiry = exp.rows.length;
        const body = `Expiring within ${months} month(s) (${exp.rows.length} batch(es)):\n` +
          exp.rows.map((r) => `• ${r.name}${r.batch_no ? ` [${r.batch_no}]` : ""}: ${r.quantity} units, exp ${new Date(r.expiry_date).toISOString().slice(0, 10)}`).join("\n");
        result.sent += await fanout(cfg, { type: "near_expiry", subject: `Expiry alert: ${exp.rows.length} batch(es)`, body });
      }
    }

    // 3) Refill due — repeat prescriptions with refills left, last dispensed 30+
    // days ago, and a customer we can reach. Notifies the customer directly.
    if (cfg.events.refill_due) {
      const rx = await pool.query(
        `SELECT pr.id, pr.rx_number, pr.patient_name, pr.refills_allowed, pr.refills_used,
                c.name AS customer, c.email, c.phone
         FROM prescriptions pr JOIN customers c ON pr.customer_id = c.id
         WHERE pr.status = 'dispensed' AND pr.refills_allowed > pr.refills_used
           AND pr.dispensed_at IS NOT NULL AND pr.dispensed_at <= NOW() - INTERVAL '30 days'
           AND (c.email IS NOT NULL OR c.phone IS NOT NULL)
         ORDER BY pr.dispensed_at ASC LIMIT 100`
      ).catch(() => ({ rows: [] }));
      for (const r of rx.rows) {
        if (await recentlyNotified("refill_due", r.id, 24 * 20)) continue; // ~once per 20 days per Rx
        const subject = `Prescription refill reminder (${r.rx_number})`;
        const body = `Hello ${r.customer || r.patient_name || "there"}, your prescription ${r.rx_number} is due for a refill (${r.refills_allowed - r.refills_used} refill(s) remaining). Please visit the pharmacy.`;
        if (cfg.email.enabled || r.email) if (r.email) { await notify({ channel: "email", to: r.email, type: "refill_due", subject, body, ref_type: "prescription", ref_id: r.id }, cfg); result.sent++; }
        if (cfg.sms.enabled || r.phone) if (r.phone) { await notify({ channel: "sms", to: r.phone, type: "refill_due", subject, body, ref_type: "prescription", ref_id: r.id }, cfg); result.sent++; }
        result.refill_due++;
      }
    }

    // 4) Customers who owe and haven't paid anything for a while.
    if (cfg.events.overdue_accounts && !(await recentlyNotified("overdue_accounts", null, dh))) {
      const days = cfg.thresholds.overdue_days;
      const od = await pool.query(
        `SELECT c.name, c.phone, c.balance::float AS balance,
                GREATEST(MAX(cp.created_at), MAX(s.created_at)) AS last_activity
           FROM customers c
           LEFT JOIN customer_payments cp ON cp.customer_id = c.id
           LEFT JOIN sales s ON s.customer_id = c.id
          WHERE c.is_active AND c.balance > 0
          GROUP BY c.id
         HAVING COALESCE(MAX(cp.created_at), 'epoch') < NOW() - ($1 || ' days')::interval
          ORDER BY c.balance DESC LIMIT 50`,
        [String(days)]
      );
      if (od.rows.length) {
        result.overdue_accounts = od.rows.length;
        const total = od.rows.reduce((s, r) => s + r.balance, 0);
        const body = `Customers owing with no payment in ${days} days (${od.rows.length}, ${total.toFixed(2)} in all):\n` +
          od.rows.map((r) => `• ${r.name}${r.phone ? ` (${r.phone})` : ""}: owes ${r.balance.toFixed(2)}`).join("\n");
        result.sent += await fanout(cfg, { type: "overdue_accounts", subject: `Overdue accounts: ${od.rows.length}`, body });
      }
    }

    return result;
  }
}
exports.runAlertsNow = runAlertsNow;

/**
 * Tell the alert recipients about something that just happened — a till that
 * didn't balance, a large refund — if that event is switched on. Never throws:
 * the sale or the till close it reports on has already happened.
 */
async function alertOps(event, { subject, body, ref_id }) {
  try {
    const cfg = withDefaults(await getConfig());
    if (!cfg.events[event]) return 0;
    return await fanout(cfg, { type: event, subject, body, ref_id });
  } catch (e) {
    console.warn(`[alerts] ${event}: ${e.message}`);
    return 0;
  }
}
exports.alertOps = alertOps;

exports.thresholds = async () => withDefaults(await getConfig()).thresholds;
