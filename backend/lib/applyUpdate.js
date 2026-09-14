// ── Applying an update ────────────────────────────────────────────────────────
//
// This is the only code that can change what is installed, and it is written to
// be run by a small root-owned process — NOT by the web application. The web
// app can request an update; it cannot perform one. That separation is the
// point: without it, any injection bug in a hospital's web tier becomes root on
// the box holding patient records.
//
// Everything here assumes it was handed the request by something untrustworthy,
// so it re-verifies from its own configuration rather than believing the
// caller. It re-checks the signature with its own copy of the public key and
// re-checks the repository against its own pin.
//
// The order of operations is the safety property:
//
//   verify → back up → fetch → build → migrate → restart → confirm
//                 ↑                                            │
//                 └──────────── revert on failure ─────────────┘
//
// A migration is the one step that cannot be undone by reverting code. Once
// ALTER TABLE has run, putting the old commit back does not put the old schema
// back. So a backup is not "recommended" before a migration — the apply refuses
// to start without one, and refuses to trust a backup it has not confirmed
// exists and is non-empty.
const { execFile, spawn } = require("child_process");
const fs   = require("fs");
const path = require("path");
const M    = require("./updateManifest");

const SHA_RE = /^[0-9a-f]{40}$/;

/**
 * Run a command with an argument ARRAY and no shell.
 *
 * No manifest value is ever interpolated into a command string anywhere in this
 * file. `commit` is the only field that reaches a command line at all and it is
 * checked against SHA_RE first, so even a signed manifest cannot smuggle a
 * shell fragment through.
 */
const run = (file, args, opts = {}) => new Promise((resolve) => {
  execFile(file, args, { maxBuffer: 10 * 1024 * 1024, timeout: opts.timeoutMs || 15 * 60 * 1000, cwd: opts.cwd },
    (err, stdout, stderr) => resolve({
      ok: !err,
      code: err ? (err.code ?? 1) : 0,
      stdout: String(stdout || "").trim(),
      stderr: String(stderr || "").trim(),
      error: err ? err.message : null,
    }));
});

/**
 * A build step, as either a bare argument array or { cmd, cwd }.
 *
 * The cwd matters: on a real deployment the backend dependencies, the
 * migrations and the frontend build do not all run in the same directory.
 * Running them all at the repository root silently builds nothing.
 */
const stepOf = (step, repoDir) => Array.isArray(step)
  ? { argv: step, cwd: repoDir, label: step.join(" ") }
  : { argv: step.cmd, cwd: path.resolve(repoDir, step.cwd || "."),
      label: `${step.cmd.join(" ")}${step.cwd ? ` (in ${step.cwd})` : ""}` };

/**
 * Record which commit the next boot will be serving.
 *
 * The app reads this file once at startup and reports it on /api/health; that
 * is what the confirmation step compares against. The deploy script writes it,
 * and the applier did not — so the process came back reporting the commit it
 * had before, the check failed, and a perfectly good update reverted every
 * time. Written BEFORE the restart, because it is read at boot.
 */
const stampPathFor = (cfg) =>
  cfg.stampFile === null ? null : path.resolve(cfg.repoDir, cfg.stampFile || "backend/.deployed-sha");

function writeStamp(cfg, sha) {
  const file = stampPathFor(cfg);
  if (!file) return null;
  fs.writeFileSync(file, `${sha}
`);
  return file;
}

/** Steps are recorded as they happen, so a failure leaves a trail, not a guess. */
class Journal {
  constructor(onStep) { this.steps = []; this.onStep = onStep || (() => {}); }
  add(name, detail = {}) {
    const entry = { name, at: new Date().toISOString(), ...detail };
    this.steps.push(entry);
    this.onStep(entry);
    return entry;
  }
}

/**
 * Decide whether this request may proceed at all. Runs before anything is
 * touched, and answers only from the applier's own configuration.
 */
function gate(manifest, signature, cfg) {
  if (!cfg.publicKey) return "no update key configured for the applier";
  if (!cfg.repo)      return "no repository pinned for the applier";

  try { M.validate(manifest); }
  catch (err) { return `malformed manifest — ${err.message}`; }

  if (!M.verifySignature(manifest, signature, cfg.publicKey)) return "signature does not verify";
  if (Date.parse(manifest.expires_at) <= Date.now()) return `manifest expired at ${manifest.expires_at}`;
  if (manifest.product !== cfg.product) return `manifest is for '${manifest.product}', this install is '${cfg.product}'`;
  if (manifest.repo !== cfg.repo) return `manifest points at ${manifest.repo}, this install is pinned to ${cfg.repo}`;

  // A step of the wrong shape must be caught here, before a backup is taken and
  // a commit checked out — not thrown from the middle of an apply. A config
  // written for a newer applier than the one installed did exactly that: it
  // crashed after the checkout, and a crash is the one path that did not revert.
  const badStep = [...(cfg.installSteps || []), ...(cfg.migrate ? [cfg.migrate] : [])]
    .find((step) => !(Array.isArray(step)
      ? step.every((a) => typeof a === "string")
      : step && Array.isArray(step.cmd) && step.cmd.every((a) => typeof a === "string")));
  if (badStep) return `a configured step is not an argument array or { cmd, cwd }: ${JSON.stringify(badStep)}`;

  // Belt and braces. validate() already enforces this, but it is the rule that
  // protects a database that cannot be rolled back, so it is checked twice.
  if (!SHA_RE.test(manifest.commit)) return "commit is not a 40-character sha";
  if (manifest.has_migrations && !manifest.backup_required) {
    return "manifest changes the database but does not require a backup";
  }
  return null;
}

/**
 * Apply an update.
 *
 * `deps` exists so the failure paths can be tested: a build that fails, a
 * migration that fails, a process that never comes back. Those are exactly the
 * paths that must not be discovered for the first time on a hospital's server.
 */
async function applyUpdate({ manifest, signature }, cfg, deps = {}) {
  const exec    = deps.run     || run;
  const backup  = deps.backup  || defaultBackup;
  const health  = deps.health  || defaultHealth;
  const journal = new Journal(deps.onStep);

  const fail = (reason, extra = {}) => {
    journal.add("failed", { reason, ...extra });
    return { ok: false, reason, steps: journal.steps, ...extra };
  };

  // ── 1. May this proceed? ──────────────────────────────────────────────────
  const refusal = gate(manifest, signature, cfg);
  if (refusal) {
    journal.add("refused", { reason: refusal });
    return { ok: false, refused: true, reason: refusal, steps: journal.steps };
  }
  journal.add("verified", { version: manifest.version, commit: manifest.commit });

  // ── 2. What are we on now? Needed to revert. ──────────────────────────────
  const before = await exec("git", ["rev-parse", "HEAD"], { cwd: cfg.repoDir });
  if (!before.ok || !SHA_RE.test(before.stdout)) {
    return fail(`could not determine the current commit — ${before.stderr || before.error}`);
  }
  const previous = before.stdout;
  journal.add("current_commit", { commit: previous });

  if (previous === manifest.commit) {
    journal.add("already_current", { commit: previous });
    return { ok: true, noop: true, reason: "already on this commit", steps: journal.steps };
  }

  // ── 3. Back up. No reference, no apply. ───────────────────────────────────
  let backupRef = null;
  if (manifest.backup_required) {
    journal.add("backup_started");
    const b = await backup(cfg);
    // A backup that reports success but produced nothing is worse than none at
    // all, because it licenses the migration that follows.
    if (!b || !b.ok || !b.ref) return fail(`backup failed — ${b?.error || "no reference returned"}`);
    if (b.bytes != null && b.bytes <= 0) return fail("backup produced an empty file");
    backupRef = b.ref;
    journal.add("backup_done", { ref: b.ref, bytes: b.bytes ?? null });
  } else {
    journal.add("backup_skipped", { reason: "manifest does not require one" });
  }

  // ── 4. Fetch and check out the exact commit ───────────────────────────────
  const fetched = await exec("git", ["fetch", "--prune", "origin"], { cwd: cfg.repoDir });
  if (!fetched.ok) return fail(`git fetch failed — ${fetched.stderr || fetched.error}`, { backupRef });

  // Checkout by SHA, never by branch name: the signature covers the commit, and
  // a branch could have moved since the manifest was signed.
  const checkedOut = await exec("git", ["checkout", "--force", manifest.commit], { cwd: cfg.repoDir });
  if (!checkedOut.ok) return fail(`could not check out ${manifest.commit} — ${checkedOut.stderr || checkedOut.error}`, { backupRef });
  journal.add("checked_out", { commit: manifest.commit });

  const revert = async (why) => {
    journal.add("reverting", { to: previous, why });
    await exec("git", ["checkout", "--force", previous], { cwd: cfg.repoDir });
    // Put the stamp back too, or the reverted process advertises a commit it is
    // not running and the drift is simply inverted.
    try { writeStamp(cfg, previous); } catch (e) { journal.add("stamp_restore_failed", { reason: e.message }); }
    for (const step of cfg.installSteps || []) {
      const s = stepOf(step, cfg.repoDir);
      await exec(s.argv[0], s.argv.slice(1), { cwd: s.cwd });
    }
    await exec(cfg.restart[0], cfg.restart.slice(1));
    const back = await health(cfg);
    journal.add("reverted", { to: previous, healthy: !!back.ok, serving: back.commit || null });
    return back;
  };

  // Everything from here on has moved the checkout, so every exit must either
  // succeed or put it back. The handled failures below each revert explicitly;
  // this try/catch is for the unhandled ones. A crash used to be the single
  // path that left a box with new files and the old process still serving —
  // which is precisely the drift this whole design exists to prevent.
  try {
    // ── 5. Install and build ──────────────────────────────────────────────────
    for (const step of cfg.installSteps || []) {
      const s = stepOf(step, cfg.repoDir);
      const r = await exec(s.argv[0], s.argv.slice(1), { cwd: s.cwd, timeoutMs: 20 * 60 * 1000 });
      journal.add("install_step", { step: s.label, ok: r.ok });
      if (!r.ok) {
        await revert(`install step failed: ${s.label}`);
        return fail(`install step failed: ${s.label} — ${r.stderr || r.error}`, { backupRef, reverted: true });
      }
    }

    // ── 6. Migrate ────────────────────────────────────────────────────────────
    if (manifest.has_migrations && cfg.migrate) {
      const mig = stepOf(cfg.migrate, cfg.repoDir);
      const m = await exec(mig.argv[0], mig.argv.slice(1), { cwd: mig.cwd, timeoutMs: 30 * 60 * 1000 });
      journal.add("migrated", { ok: m.ok });
      if (!m.ok) {
        // Code goes back. The schema may not, which is exactly why the backup
        // above is mandatory and why its reference is carried into this result.
        await revert("migration failed");
        return fail(`migration failed — ${m.stderr || m.error}`, {
          backupRef, reverted: true,
          warning: "The database may be partly migrated. Restore from the backup reference before retrying.",
        });
      }
    }

    // ── 7. Stamp, restart, then insist on proof ───────────────────────────────
    try {
      const stamped = writeStamp(cfg, manifest.commit);
      journal.add("stamped", { file: stamped, commit: manifest.commit });
    } catch (err) {
      await revert(`could not record the commit stamp: ${err.message}`);
      return fail(`could not write the commit stamp — ${err.message}`, { backupRef, reverted: true });
    }

    const restarted = await exec(cfg.restart[0], cfg.restart.slice(1));
    journal.add("restarted", { ok: restarted.ok });
    if (!restarted.ok) {
      await revert("restart command failed");
      return fail(`restart failed — ${restarted.stderr || restarted.error}`, { backupRef, reverted: true });
    }

    // The deploy is not finished because a command exited zero. It is finished
    // when the running process says it is serving the new commit. A deploy that
    // updates files but leaves the old process holding the port is the failure
    // this catches.
    const after = await health(cfg);
    journal.add("health_checked", { ok: !!after.ok, serving: after.commit || null });

    if (!after.ok || after.commit !== manifest.commit) {
      const back = await revert(
        after.ok ? `health reports ${after.commit}, expected ${manifest.commit}` : "health check did not respond"
      );
      return fail(
        after.ok ? `after restart the service reported ${after.commit}, not ${manifest.commit}`
                 : "the service did not come back after restarting",
        { backupRef, reverted: true, revertHealthy: !!back.ok }
      );
    }

    journal.add("succeeded", { version: manifest.version, commit: manifest.commit });
    return { ok: true, version: manifest.version, commit: manifest.commit, previous, backupRef, steps: journal.steps };
  } catch (err) {
    await revert(`the applier crashed: ${err.message}`);
    return fail(`applier crashed after checkout — ${err.message}`, { backupRef, reverted: true });
  }
}

// ── Defaults ─────────────────────────────────────────────────────────────────

/**
 * Dump the database to a timestamped file, then confirm the file is really
 * there and not empty.
 *
 * The dump is STREAMED to disk rather than buffered. Collecting it in memory
 * first works on a test database and then fails on a real one, and it fails as
 * "maxBuffer exceeded" — which reads like a bug in the applier rather than a
 * backup that did not happen.
 *
 * `backupCommand` exists because the database is not always where the applier
 * is. On the demo box ELIMS runs under pm2 while its Postgres lives in a
 * container, so the reliable dump is `docker exec pharmacy_db pg_dump ...` — the
 * container's own client always matches its server. Falling back to the host's
 * pg_dump works only while the two versions happen to line up, and when they
 * stop lining up every update stops with it.
 */
function defaultBackup(cfg) {
  return new Promise((resolve) => {
    if (!cfg.backupDir) return resolve({ ok: false, error: "backupDir is not configured" });
    if (!cfg.backupCommand && !cfg.databaseUrl) {
      return resolve({ ok: false, error: "neither backupCommand nor databaseUrl is configured" });
    }
    try { fs.mkdirSync(cfg.backupDir, { recursive: true }); } catch { /* already there */ }

    const ref = path.join(cfg.backupDir, `pre-update-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
    // Either form writes the dump to stdout; we own the file.
    const argv = cfg.backupCommand || [cfg.pgDump || "pg_dump", "--no-owner", cfg.databaseUrl];

    const out = fs.createWriteStream(ref);
    const child = spawn(argv[0], argv.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let settled = false;
    const done = (result) => { if (!settled) { settled = true; resolve(result); } };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ ok: false, error: "backup timed out" });
    }, cfg.backupTimeoutMs || 30 * 60 * 1000);

    child.stdout.pipe(out);
    child.stderr.on("data", (d) => { stderr += d.toString().slice(0, 4000); });
    child.on("error", (err) => { clearTimeout(timer); done({ ok: false, error: err.message }); });

    child.on("close", (code) => {
      clearTimeout(timer);
      out.end(() => {
        if (code !== 0) return done({ ok: false, error: stderr.trim() || `dump exited ${code}` });
        let bytes = 0;
        try { bytes = fs.statSync(ref).size; }
        catch { return done({ ok: false, error: "backup file was not created" }); }
        // A dump that exits zero having written nothing is worse than no backup
        // at all, because it licenses the migration that follows.
        if (bytes <= 0) return done({ ok: false, error: "backup file is empty" });
        done({ ok: true, ref, bytes });
      });
    });
  });
}

/** Ask the running service what commit it is serving. */
async function defaultHealth(cfg) {
  const deadline = Date.now() + (cfg.healthTimeoutMs || 120000);
  while (Date.now() < deadline) {
    try {
      const res = await fetch(cfg.healthUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const body = await res.json();
        if (body.commit) return { ok: true, commit: String(body.commit).slice(0, 40) };
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { ok: false, commit: null };
}

module.exports = { applyUpdate, gate, defaultBackup, defaultHealth, Journal, SHA_RE };
