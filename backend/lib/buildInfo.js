// ─────────────────────────────────────────────────────────────────────────────
// Which commit is THIS PROCESS running?
//
// Read once, at startup, from a file the deploy script writes before it
// restarts anything. Deliberately not recomputed per request and deliberately
// not read from git: the question is what code this process loaded, not what
// happens to be checked out on disk now.
//
// That distinction is the whole point. A deploy that updates the files but
// fails to restart — the wrong pm2 daemon, a Docker step that never ran, a
// crash-looping duplicate holding the port — leaves the old process serving
// the old code while `git log` on the server shows the new commit. Reporting
// the boot commit makes that visible instead of silent, and lets the deploy
// script refuse to claim success.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

function readDeployedSha() {
  // backend/.deployed-sha first, then the repo root — either is fine, the
  // script writes one of them.
  const candidates = [
    path.join(__dirname, "..", ".deployed-sha"),
    path.join(__dirname, "..", "..", ".deployed-sha"),
  ];
  for (const file of candidates) {
    try {
      const sha = fs.readFileSync(file, "utf8").trim();
      if (sha) return sha.slice(0, 40);
    } catch {
      // Absent on a developer machine, which is normal — nothing deployed it.
    }
  }
  return null;
}

const COMMIT = readDeployedSha();
const STARTED_AT = new Date().toISOString();

module.exports = { COMMIT, STARTED_AT };
