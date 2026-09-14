#!/usr/bin/env node
/**
 * The update applier. Runs as root, on a timer. Not part of the web
 * application and never called by it.
 *
 *   node scripts/updater/run.js --once
 *
 * The web app can drop a REQUEST in the spool directory; it cannot perform an
 * update. This process reads the request, throws away everything it says about
 * whether it should be trusted, and decides from its own root-owned config.
 * That is the whole reason the two are separate: without it, any injection bug
 * in the hospital's web tier becomes root on the box holding patient records.
 *
 * Layout:
 *   /etc/banoyah-updater.conf          root-owned config (0600) — the public
 *                                      key and the repo pin live HERE, not in
 *                                      the application's .env, so compromising
 *                                      the app does not change what it will
 *                                      accept as genuine
 *   <spool>/requests/*.json            { manifest, signature } written by the app
 *   <spool>/results/<id>.json          written here, read by the app
 *   <spool>/updater.lock               one apply at a time, ever
 */
const fs   = require("fs");
const path = require("path");
const { applyUpdate } = require("../../lib/applyUpdate");

const CONFIG_PATH = process.env.UPDATER_CONFIG || "/etc/banoyah-updater.conf";
const ONCE = process.argv.includes("--once");

const log = (...a) => console.log(`[updater ${new Date().toISOString()}]`, ...a);

// Set when an apply fails or is refused, so the exit code carries it.
let failed = false;

function loadConfig() {
  let raw;
  try {
    raw = fs.readFileSync(CONFIG_PATH, "utf8");
  } catch (err) {
    throw new Error(`cannot read ${CONFIG_PATH} — ${err.message}`);
  }

  // A config the application could edit would defeat the point of separating
  // them, so refuse to run from one that is group- or world-writable.
  try {
    const mode = fs.statSync(CONFIG_PATH).mode & 0o077;
    if (mode && process.platform !== "win32") {
      throw new Error(`${CONFIG_PATH} is accessible to other users (mode ${(fs.statSync(CONFIG_PATH).mode & 0o777).toString(8)}) — chmod 600 it`);
    }
  } catch (err) {
    if (/accessible to other users/.test(err.message)) throw err;
  }

  const cfg = JSON.parse(raw);
  for (const key of ["product", "repo", "publicKey", "repoDir", "restart", "healthUrl", "spoolDir"]) {
    if (!cfg[key]) throw new Error(`${CONFIG_PATH} is missing "${key}"`);
  }
  if (!Array.isArray(cfg.restart)) throw new Error(`"restart" must be an argument array, e.g. ["pm2","restart","remedy-backend"]`);

  // publicKey may be one key or several. During a key rollover the successor is
  // added as "publicKeyNext" (or publicKey becomes an array), so this applier
  // accepts a release signed with either while the change is rolled out. A
  // signing key that cannot be replaced without hand-editing this file on every
  // server is a key you cannot afford to lose.
  const keys = [
    ...(Array.isArray(cfg.publicKey) ? cfg.publicKey : [cfg.publicKey]),
    cfg.publicKeyNext,
  ].filter(Boolean);
  if (!keys.length) throw new Error(`${CONFIG_PATH} has no usable "publicKey"`);
  cfg.publicKey = keys;

  return cfg;
}

const dirs = (cfg) => ({
  requests: path.join(cfg.spoolDir, "requests"),
  results:  path.join(cfg.spoolDir, "results"),
  lock:     path.join(cfg.spoolDir, "updater.lock"),
});

/** Exclusive, and stale-tolerant: a crashed apply must not wedge the box forever. */
function takeLock(lockPath) {
  try {
    fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    try {
      const age = Date.now() - fs.statSync(lockPath).mtimeMs;
      if (age > 2 * 60 * 60 * 1000) {
        log(`clearing a lock ${Math.round(age / 60000)} minutes old`);
        fs.unlinkSync(lockPath);
        fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
        return true;
      }
    } catch { /* someone else won the race */ }
    return false;
  }
}

async function processOne(cfg) {
  const d = dirs(cfg);
  for (const dir of [d.requests, d.results]) fs.mkdirSync(dir, { recursive: true });

  const pending = fs.readdirSync(d.requests).filter((f) => f.endsWith(".json")).sort();
  if (!pending.length) return false;

  const file = path.join(d.requests, pending[0]);
  const id   = path.basename(pending[0], ".json");
  let request;
  try {
    request = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    // Unparseable requests are recorded and removed rather than retried
    // forever — a malformed file must not block every later one.
    // Say so. This branch returns before the logging below, so a malformed
    // request used to be recorded to a file and print nothing at all — the
    // operator saw an empty console and no way to tell whether anything ran.
    log(`✗ request ${id} is unreadable — ${err.message}`);
    const bad = { id, ok: false, reason: `unreadable request — ${err.message}`, at: new Date().toISOString() };
    fs.writeFileSync(path.join(d.results, `${id}.json`), JSON.stringify(bad, null, 2));
    fs.unlinkSync(file);
    return bad;
  }

  log(`applying request ${id}: ${request?.manifest?.product} ${request?.manifest?.version}`);
  const started = new Date().toISOString();
  let result;
  try {
    result = await applyUpdate(request, cfg, {
      onStep: (s) => log(`  ${s.name}${s.reason ? `: ${s.reason}` : ""}`),
    });
  } catch (err) {
    result = { ok: false, reason: `applier crashed — ${err.message}` };
  }

  fs.writeFileSync(path.join(d.results, `${id}.json`),
    JSON.stringify({ id, started, finished: new Date().toISOString(), ...result }, null, 2));
  fs.unlinkSync(file);

  log(result.ok ? `✓ ${result.noop ? "already current" : `now on ${result.version}`}` : `✗ ${result.reason}`);
  return result;
}

(async () => {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    console.error(`[updater] refusing to run — ${err.message}`);
    process.exit(2);
  }

  const { lock } = dirs(cfg);
  fs.mkdirSync(cfg.spoolDir, { recursive: true });
  if (!takeLock(lock)) {
    log("another apply is in progress — nothing to do");
    return;
  }

  try {
    const result = await processOne(cfg);
    if (!result) { log("no pending requests"); return; }
    // A failed apply must not look like a quiet success to whatever runs this.
    // The detail is in the result file either way, but an operator reading
    // `systemctl status` should not have to go and find it.
    if (!result.ok) failed = true;
  } finally {
    try { fs.unlinkSync(lock); } catch { /* already gone */ }
  }

  if (!ONCE) log("run with --once from a timer; this process does not loop");
})()
  .then(() => { process.exitCode = failed ? 1 : 0; })
  .catch((err) => {
    console.error(`[updater] ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    // Exit by letting the loop drain, not by calling process.exit(): the health
    // check leaves fetch handles behind, and tearing them down mid-flight
    // produced a libuv assertion and an exit code of 127 — which a timer would
    // read as a crash rather than as the clean failure it actually was.
    // The unref'd timer is the backstop for anything that refuses to drain.
    setTimeout(() => process.exit(process.exitCode ?? 0), 10_000).unref();
  });
