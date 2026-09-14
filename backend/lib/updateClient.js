// ── Asking Control Center what this install should be running ─────────────────
//
// The install pulls; Control Center never pushes. Two reasons. A site behind
// NAT, or on a connection whose address rotates, cannot be reached inbound at
// all — this lab's own link is exactly that. And the check doubles as the
// report: Control Center learns what each site is running because each site
// says so, rather than by inference.
//
// Nothing here applies anything. This phase only answers "is there an update,
// and is it genuine". The applying half is deliberately absent — there is no
// code in this process that can change what is installed.
const fs   = require("fs");
const path = require("path");
const pool = require("../config/db");
const buildInfo = require("./buildInfo");
const M    = require("./updateManifest");

// Control Center registers this product as "remedy" (see its
// migrations/010_products.sql). The manifest's product field is checked
// against this, so a release signed for another product is refused even
// with a valid signature.
const PRODUCT = "remedy";

const readVersion = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version || null;
  } catch { return null; }
};

const VERSION = readVersion();

// Last result, held in memory. The Settings panel reads this rather than
// triggering a call of its own, so opening the page cannot hammer the vendor.
let state = {
  checked_at:    null,
  ok:            null,       // did the last check reach Control Center
  error:         null,
  update:        null,       // { version, severity, notes, has_migrations, … }
  rejected:      null,       // an offer that arrived but failed verification
  current: { version: VERSION, commit: buildInfo.COMMIT },
};

/**
 * A setting, from system_settings if it is there, otherwise the environment.
 * Anything an operator may need to change lives in Settings, not only in a file
 * they cannot reach.
 */
let settingWarned = false;
async function setting(key, envName) {
  try {
    const { rows } = await pool.query("SELECT value FROM system_settings WHERE key = $1", [key]);
    if (rows[0]?.value) return rows[0].value;
  } catch (err) {
    // Falling back to the environment is right; doing it silently is not — a
    // broken lookup would look exactly like "no setting configured", forever.
    if (!settingWarned) {
      settingWarned = true;
      console.warn(`[updates] could not read setting '${key}', using the environment — ${err.message}`);
    }
  }
  return process.env[envName] || "";
}

/**
 * The address is operational config and belongs in Settings. The update key and
 * the repo pin are NOT: they are the two things that decide whether an update is
 * genuine, and a lab administrator must not be able to edit them from a web
 * form — that would put the answer to "is this authentic" inside the system
 * being attacked. Environment only, deliberately.
 */
async function config() {
  return {
    url:       (await setting("control_center_url", "CONTROL_CENTER_URL")).replace(/\/+$/, ""),
    key:        process.env.ADMIN_API_KEY || "",
    // Current key first, then any successor this install has been told to
    // trust. Both are accepted during a rollover so no install is ever unable
    // to take an update while the key is being changed — see verifyWhich().
    publicKey:  [
      process.env.UPDATE_ED25519_PUBLIC_KEY,
      process.env.UPDATE_ED25519_PUBLIC_KEY_NEXT,
    ].filter(Boolean),
    repo:       process.env.UPDATE_REPO || "",
  };
}

async function checkNow() {
  const cfg = await config();
  const at  = new Date().toISOString();

  if (!cfg.url || !cfg.key) {
    state = { ...state, checked_at: at, ok: false, update: null, rejected: null,
              error: "The Control Center address or ADMIN_API_KEY is not set" };
    return state;
  }

  try {
    const res = await fetch(`${cfg.url}/api/instance/update-check`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": cfg.key },
      body:    JSON.stringify({ version: VERSION, commit: buildInfo.COMMIT }),
      signal:  AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      state = { ...state, checked_at: at, ok: false, update: null, rejected: null,
                error: body.message || `Control Center returned ${res.status}` };
      return state;
    }

    const data = await res.json();
    if (!data.update) {
      state = { ...state, checked_at: at, ok: true, error: null, update: null, rejected: null };
      return state;
    }

    // Everything below here treats the response as hostile. A reply from
    // Control Center is not trusted because of where it came from; it is
    // trusted because it carries a signature this install can check itself.
    const { manifest, signature, display } = data.update;
    const verdict = M.accept(manifest, signature, {
      publicKey:      cfg.publicKey,
      product:        PRODUCT,
      currentVersion: VERSION,
      currentCommit:  buildInfo.COMMIT,
      expectedRepo:   cfg.repo,
      // The notes arrive beside the manifest, not inside it. Handing them to
      // accept() lets it check them against notes_sha256 when a manifest
      // carries one — see updateManifest.accept for why that is optional.
      notes:          display?.notes,
    });

    // Already up to date is not a refusal — report it as the ordinary state it
    // is, rather than raising an alarm on a perfectly healthy system.
    if (!verdict.ok && verdict.current) {
      state = { ...state, checked_at: at, ok: true, error: null, update: null, rejected: null };
      return state;
    }

    if (!verdict.ok) {
      // Kept and surfaced rather than silently dropped: an offer that fails
      // verification is either a misconfiguration or an attack, and both are
      // things somebody needs to see.
      state = { ...state, checked_at: at, ok: true, error: null, update: null,
                rejected: { version: manifest?.version || null, reason: verdict.reason } };
      console.warn(`[updates] refused an offered update — ${verdict.reason}`);
      return state;
    }

    state = {
      ...state, checked_at: at, ok: true, error: null, rejected: null,
      // Kept so an install request queues precisely what was verified here,
      // rather than anything a later caller might supply.
      verifiedManifest:  manifest,
      verifiedSignature: signature,
      update: {
        version:          manifest.version,
        commit:           manifest.commit,
        severity:         manifest.severity,
        notes:            display?.notes || null,
        // Whether those notes were vouched for by the signature, or are just
        // text Control Center sent along. The screen should not present the
        // two the same way.
        notes_verified:   !!verdict.notesVerified,
        // 0 = the current key, 1 = its successor. Worth knowing during a
        // rollover: an install still verifying with the old key has not
        // picked up the new one yet.
        signed_by_key:    verdict.keyIndex ?? 0,
        has_migrations:   manifest.has_migrations,
        backup_required:  manifest.backup_required,
        est_downtime_sec: manifest.est_downtime_sec ?? null,
        min_from_version: manifest.min_from_version || null,
        expires_at:       manifest.expires_at,
      },
    };
    await notifyOfUpdate(state.update);
    return state;
  } catch (err) {
    const reason = err.name === "TimeoutError" ? "Control Center did not respond within 15s" : err.message;
    state = { ...state, checked_at: at, ok: false, update: null, rejected: null, error: reason };
    return state;
  }
}

// ── Telling somebody a release exists ─────────────────────────────────────────
//
// A version sitting on a settings page nobody opens is not a notification. When
// a release first becomes available this raises one through the notifications
// the system already has — the bell, and a live push to anyone signed in.
//
// Two rules make it bearable rather than nagging:
//
//   · once per release, keyed on the COMMIT and remembered in the database, so
//     a restart or a six-hourly re-check does not raise it again;
//   · administrators only. A release is not news to a phlebotomist, and it is
//     not something they can act on.
const NOTIFY_ROLES = ["super admin", "admin", "administrator (legacy)", "it administrator"];

// server.js hands this over at startup so the client can push to open sessions.
let io = null;  // unused here — see setIo below
// No socket.io in this product; kept as a no-op so the export list and the
// server wiring stay identical across products.
const setIo = () => {};

/**
 * ELIMS raises an in-app notification for each admin when a release first
 * appears. That does not port: this product's `notifications` table is a
 * delivery outbox — channel, recipient, subject — for stock and refill alerts
 * going out by email or SMS, not a per-user feed with a link to click. Writing
 * an update notice into it would either send a pharmacist an email about a
 * software release or sit in an outbox that nothing renders.
 *
 * So the offer is recorded and surfaced in Settings, and the last commit
 * announced is still remembered — so that when there is somewhere to put a
 * notification, it will not replay every release the install has ever seen.
 */
async function notifyOfUpdate(update) {
  if (!update?.commit) return;
  try {
    const { rows } = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'updates_last_notified_commit'"
    );
    if (rows[0]?.value === update.commit) return;

    console.log(`[updates] ${update.version} is available (${String(update.commit).slice(0, 9)})`);

    await pool.query(
      `INSERT INTO system_settings (key, value) VALUES ('updates_last_notified_commit', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [update.commit]
    );
  } catch (err) {
    // Never fatal: failing to announce an update must not stop the check that
    // found it from being reported on the Settings page.
    console.warn(`[updates] could not record the announcement — ${err.message}`);
  }
}

// ── Asking for an update to be installed ──────────────────────────────────────
//
// This writes a REQUEST. It does not install anything, and nothing in this
// process can: a separate root-owned applier reads the spool on a timer, checks
// the signature again with its own key, takes a backup and does the work.
//
// The manifest queued here is the one THIS PROCESS already verified — never one
// supplied by the browser. A caller cannot hand us a manifest to install, only
// ask us to proceed with the one we are already showing them.
// Product-specific by default. The shared "/var/lib/banoyah-updater" belongs to
// ELIMS, and a box running both would have each product collecting the other's
// requests and refusing them on the product check — nothing installs, and the
// logs blame the manifest rather than the path.
const spoolDir = async () => await setting("updater_spool_dir", "UPDATER_SPOOL_DIR")
  || "/var/lib/banoyah-updater-remedy";

async function requestInstall(requestedBy) {
  if (!state.update) return { ok: false, reason: "there is no verified update to install" };

  const dir = path.join(await spoolDir(), "requests");
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch (err) {
    return { ok: false, reason: `cannot reach the update spool — ${err.message}` };
  }

  // One at a time. Queuing a second request while one is pending would have the
  // applier run them back to back, restarting the service twice for no reason.
  const pending = (await fs.promises.readdir(dir)).filter((f) => f.endsWith(".json"));
  if (pending.length) return { ok: false, reason: "an update is already queued", pending: pending[0] };

  const id   = `${Date.now()}-${state.update.commit.slice(0, 7)}`;
  const body = JSON.stringify({
    manifest:  state.verifiedManifest,
    signature: state.verifiedSignature,
    requested_by: requestedBy || null,
    requested_at: new Date().toISOString(),
  }, null, 2);

  // Write, then rename. The applier polls this directory, and a half-written
  // file that happened to be read mid-write would be recorded as unreadable and
  // thrown away.
  const tmp = path.join(dir, `.${id}.tmp`);
  try {
    await fs.promises.writeFile(tmp, body, { mode: 0o640 });
    await fs.promises.rename(tmp, path.join(dir, `${id}.json`));
  } catch (err) {
    await fs.promises.unlink(tmp).catch(() => {});
    return { ok: false, reason: `could not queue the request — ${err.message}` };
  }

  console.log(`[updates] queued ${state.update.version} (${state.update.commit.slice(0, 9)}) for the applier`);
  return { ok: true, id, version: state.update.version, commit: state.update.commit };
}

/**
 * Whether something is queued, whether it is running right now, and how the
 * last attempt ended.
 *
 * "Running" is the applier's lock file. The applier takes it before it touches
 * anything and releases it in a finally block, so its presence is the one
 * honest answer to "is a machine changing this system underneath me". A queued
 * request is NOT the same thing: the applier runs on a timer, so a request can
 * sit for minutes before any work begins, and telling everyone to down tools
 * for that wait would cost more clinical time than the update does.
 */
async function installStatus() {
  const base = await spoolDir();
  const out  = { pending: null, running: false, applying: null, last: null };
  try {
    await fs.promises.stat(path.join(base, "updater.lock"));
    out.running = true;
  } catch { /* not running */ }
  try {
    const q = (await fs.promises.readdir(path.join(base, "requests"))).filter((f) => f.endsWith(".json")).sort();
    if (q.length) {
      const name = q[q.length - 1];
      out.pending = name.replace(/\.json$/, "");
      // What is being applied, so people can be told the version rather than
      // just "something". Unreadable is not fatal — the lock is what matters.
      try {
        const req = JSON.parse(await fs.promises.readFile(path.join(base, "requests", name), "utf8"));
        out.applying = {
          version:        req.manifest?.version || null,
          has_migrations: !!req.manifest?.has_migrations,
        };
      } catch { /* the applier may be mid-read; the lock still stands */ }
    }
  } catch { /* no spool yet */ }
  try {
    const dir = path.join(base, "results");
    const r = (await fs.promises.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
    if (r.length) {
      const raw = JSON.parse(await fs.promises.readFile(path.join(dir, r[r.length - 1]), "utf8"));
      // Only what the page needs. The full journal stays on the server.
      out.last = {
        id: raw.id, ok: !!raw.ok, reason: raw.reason || null,
        version: raw.version || null, reverted: !!raw.reverted,
        finished: raw.finished || raw.at || null,
      };
    }
  } catch { /* nothing has run yet */ }
  return out;
}

const getState = () => ({ ...state, current: { version: VERSION, commit: buildInfo.COMMIT } });

/**
 * Check on a timer. The interval is loose on purpose: this is not urgent
 * traffic, and every install hitting Control Center on the same schedule is
 * worth avoiding, so the first check is jittered.
 */
async function startUpdateChecks({ intervalMinutes = 360 } = {}) {
  const cfg = await config();
  if (!cfg.url || !cfg.key) {
    console.log("[updates] not configured — set the Control Center address and ADMIN_API_KEY to enable update checks");
    return null;
  }
  const jitter = Math.floor(Math.random() * 5 * 60 * 1000);
  setTimeout(() => {
    checkNow().catch(() => {});
    setInterval(() => checkNow().catch(() => {}), intervalMinutes * 60 * 1000);
  }, 30_000 + jitter);
  console.log(`[updates] checking Control Center every ${intervalMinutes} minutes`);
  return true;
}

// ── Telling everyone the machine is being worked on ───────────────────────────
//
// The applier is a separate root process and cannot reach the socket server, so
// this process watches for it instead and does the announcing. What it watches
// is the lock file, not the queue: see installStatus above for why the wait
// before an apply must not count as downtime.
//
// The END of an update is deliberately NOT announced from here. The last thing
// an apply does is restart this service, so this process is usually dead at the
// moment it would need to speak. The browser learns it is over by reconnecting
// and finding a different build — which is also the only version of "it is
// over" that is true from where the browser sits.
let maintenance = { active: false, version: null, has_migrations: false, since: null };
const getMaintenance = () => maintenance;

function announce(next) {
  maintenance = next;
  try {
    io?.emit("system_maintenance", next);
  } catch { /* nobody connected, or no socket server; the poll below still covers it */ }
}

async function startMaintenanceWatch({ everyMs = 5000 } = {}) {
  const base = await spoolDir();
  try {
    await fs.promises.mkdir(base, { recursive: true });
  } catch {
    // Not being able to see the spool is not fatal here. It means updates are
    // not set up on this box, and there is nothing to watch.
    console.log("[updates] no update spool — not watching for maintenance");
    return null;
  }

  const tick = async () => {
    let s;
    try { s = await installStatus(); } catch { return; }

    if (s.running && !maintenance.active) {
      announce({
        active: true,
        version: s.applying?.version || null,
        has_migrations: !!s.applying?.has_migrations,
        since: new Date().toISOString(),
      });
      console.log(`[updates] applier is running${s.applying?.version ? ` (${s.applying.version})` : ""} — told everyone`);
    } else if (!s.running && maintenance.active) {
      // Reached only when an apply ended WITHOUT restarting us — a revert, or a
      // failure before the restart step. The people we stopped are still
      // sitting there waiting, so let them go.
      announce({ active: false, version: null, has_migrations: false, since: null });
      console.log("[updates] applier finished without restarting this process — released");
    }
  };

  // Did we just come back from an update? If so, ask Control Center straight
  // away rather than waiting out the jittered check. Otherwise the panel the
  // admin is watching sits blank for up to five minutes immediately after the
  // one moment they are certain to be looking at it. Normal restarts keep the
  // jitter: the point of that is to stop every site checking in at once, and a
  // site that has just updated is not part of a herd.
  //
  // Asked about a moment AFTER boot, not at boot. The applier restarts this
  // service and only then writes its result file, so at startup the results
  // directory still describes the previous attempt — reading it here found a
  // stale answer and the immediate check-in never happened. Installing 2.2.11
  // restarted at 08:59:02, the result landed at 08:59:05, and the check-in
  // waited out the full jitter to 09:01.
  //
  // Ten seconds is comfortably longer than the gap and still far inside the
  // window where somebody is watching the page they just pressed Install on.
  setTimeout(async () => {
    try {
      const s0 = await installStatus();
      const done = s0.last?.finished ? Date.parse(s0.last.finished) : 0;
      if (s0.last?.ok && Date.now() - done < 15 * 60 * 1000) {
        console.log("[updates] just applied an update — checking in now rather than on the timer");
        checkNow().catch(() => {});
      }
    } catch { /* no spool history; nothing to infer */ }
  }, 10_000).unref?.();

  setInterval(tick, everyMs).unref?.();
  tick().catch(() => {});
  console.log(`[updates] watching the update spool every ${everyMs >= 1000 ? `${Math.round(everyMs / 1000)}s` : `${everyMs}ms`}`);
  return true;
}

module.exports = { checkNow, getState, startUpdateChecks, requestInstall, installStatus,
                   startMaintenanceWatch, getMaintenance, setIo, PRODUCT, VERSION };
