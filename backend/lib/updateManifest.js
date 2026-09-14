// ── Update manifests, install side: verify only ───────────────────────────────
//
// This is deliberately NOT a copy of Control Center's manifest module. An
// install must never be able to build or sign a manifest — it only holds the
// public key, and its entire job is to decide whether something it was handed
// is genuine. Keeping the signing half out of this file means there is nothing
// here to misuse if the box is compromised.
//
// The validation rules mirror the signer's exactly. They have to: a rule that
// is stricter here rejects legitimate releases, and a rule that is looser here
// is a hole the signer thought it had closed.
const crypto = require("crypto");

// Field order defines the canonical bytes that were signed. It must match the
// signer byte for byte or every signature fails.
const FIELDS = [
  "schema", "product", "version", "commit", "repo", "branch",
  "severity", "min_from_version", "has_migrations", "backup_required",
  "est_downtime_sec", "issued_at", "expires_at", "nonce",
  // Optional, and new. See accept() for what it is for and why it arrived in
  // two stages rather than one.
  "notes_sha256",
];

const SCHEMA     = 1;
const SEVERITY   = new Set(["feature", "fix", "security"]);
const SHA1_RE    = /^[0-9a-f]{40}$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const REPO_RE    = /^https:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+$/;
const BRANCH_RE  = /^[A-Za-z0-9._\/-]{1,120}$/;

/** A PEM as stored in .env (literal backslash-n), restored to a real one. */
const pem = (value) => String(value || "").replace(/\\n/g, "\n").trim();

function validate(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) throw new Error("manifest must be an object");

  // Nothing outside FIELDS is allowed through. A manifest carries data, never
  // an instruction — no script paths, no shell, no URLs to execute — and an
  // exhaustive field list is what makes that structural rather than a promise.
  const unknown = Object.keys(m).filter((k) => !FIELDS.includes(k));
  if (unknown.length) throw new Error(`unknown field(s): ${unknown.join(", ")}`);

  if (m.schema !== SCHEMA) throw new Error(`unsupported schema ${m.schema}`);
  if (typeof m.product !== "string" || !m.product) throw new Error("product is required");
  if (!VERSION_RE.test(m.version || "")) throw new Error(`version is not semver: ${m.version}`);

  // The commit decides what code runs and is the only field that would ever
  // reach a command line. Forty hex characters, nothing else, ever.
  if (!SHA1_RE.test(m.commit || "")) throw new Error("commit must be a full 40-character sha");

  if (!REPO_RE.test(m.repo || "")) throw new Error("repo must be an https URL");
  if (!BRANCH_RE.test(m.branch || "")) throw new Error("branch has illegal characters");
  if (!SEVERITY.has(m.severity)) throw new Error(`severity must be one of ${[...SEVERITY].join(", ")}`);

  if (m.min_from_version != null && !VERSION_RE.test(m.min_from_version))
    throw new Error("min_from_version is not semver");
  if (typeof m.has_migrations !== "boolean") throw new Error("has_migrations must be boolean");
  if (typeof m.backup_required !== "boolean") throw new Error("backup_required must be boolean");
  if (m.has_migrations && !m.backup_required) throw new Error("has_migrations requires backup_required");

  if (m.est_downtime_sec != null && (!Number.isInteger(m.est_downtime_sec) || m.est_downtime_sec < 0))
    throw new Error("est_downtime_sec must be a non-negative integer");

  const issued = Date.parse(m.issued_at);
  const expires = Date.parse(m.expires_at);
  if (Number.isNaN(issued)) throw new Error("issued_at is not a valid timestamp");
  if (Number.isNaN(expires)) throw new Error("expires_at is not a valid timestamp");
  if (expires <= issued) throw new Error("expires_at must be after issued_at");

  if (!/^[0-9a-f]{16,64}$/.test(m.nonce || "")) throw new Error("nonce must be hex");
  if (m.notes_sha256 != null && !/^[0-9a-f]{64}$/.test(m.notes_sha256))
    throw new Error("notes_sha256 must be 64 hex characters");
  return m;
}

function canonical(m) {
  const ordered = {};
  for (const f of FIELDS) if (m[f] !== undefined && m[f] !== null) ordered[f] = m[f];
  return Buffer.from(JSON.stringify(ordered), "utf8");
}

/**
 * Verify against ONE key.
 */
function verifyWithKey(manifest, signature, publicKeyPem) {
  try {
    return crypto.verify(
      null, canonical(manifest),
      { key: pem(publicKeyPem), format: "pem", type: "spki" },
      Buffer.from(signature || "", "base64")
    );
  } catch {
    return false;
  }
}

/**
 * Verify against any key this install trusts, and say which one matched.
 *
 * More than one, because a signing key with no way to be replaced is a key you
 * cannot afford to lose. With a single key, a leak means editing
 * /etc/banoyah-updater.conf by hand on every server — during an incident, under
 * pressure, with no way to tell an install to stop trusting the old one. That is
 * not a plan; it is the absence of one.
 *
 * Two keys make a rollover ordinary: publish the next key alongside the current
 * one, let every install pick it up, then start signing with it, then retire the
 * old. At no point is any install unable to take an update — which is what makes
 * it something you would actually do before you had to.
 *
 * Returns the index that matched, or -1. The index matters: an operator watching
 * a rollover needs to know whether a site is still on the old key.
 */
function verifyWhich(manifest, signature, publicKey) {
  const keys = (Array.isArray(publicKey) ? publicKey : [publicKey]).filter(Boolean);
  for (let i = 0; i < keys.length; i++) {
    if (verifyWithKey(manifest, signature, keys[i])) return i;
  }
  return -1;
}

function verifySignature(manifest, signature, publicKey) {
  return verifyWhich(manifest, signature, publicKey) !== -1;
}

/** Semver compare, enough for x.y.z with an optional pre-release suffix. */
function compareVersions(a, b) {
  const part = (v) => String(v).split("-")[0].split(".").map(Number);
  const [x, y] = [part(a), part(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  }
  // A release build outranks a pre-release of the same numbers.
  const pre = (v) => String(v).includes("-");
  if (pre(a) !== pre(b)) return pre(a) ? -1 : 1;
  return 0;
}

/**
 * Everything an install checks before it will even DISPLAY an update, let alone
 * act on one. Returns { ok } or { ok: false, reason }.
 *
 * `expectedRepo` is the pinning control and the reason a stolen signing key is
 * survivable: an install only ever accepts commits from the repository it was
 * configured with, so forging a manifest is not enough — an attacker would also
 * need write access to that repository.
 */
function accept(manifest, signature, { publicKey, product, currentVersion, currentCommit, expectedRepo, notes, now = Date.now() }) {
  if (!publicKey) return { ok: false, reason: "no update key configured on this install" };

  try {
    validate(manifest);
  } catch (err) {
    return { ok: false, reason: `malformed manifest — ${err.message}` };
  }

  const keyIndex = verifyWhich(manifest, signature, publicKey);
  if (keyIndex === -1) {
    return { ok: false, reason: "signature does not verify" };
  }

  // ── The words you read, not just the code you get ──────────────────────────
  //
  // The version, the commit and the severity are all signed. The release notes
  // were not: they travel beside the manifest as display text. So a compromised
  // Control Center could never change a byte of what gets installed, but it
  // could change what an admin reads while deciding to install it — "urgent
  // security fix for patient data" over an ordinary release is a cheap way to
  // hurry somebody past their own judgement.
  //
  // When the manifest carries notes_sha256, the notes must hash to it.
  //
  // Optional, deliberately. The field cannot simply be added to signed
  // manifests: validate() refuses unknown fields — which is precisely what
  // makes a manifest safe — so an install that has not learned this field yet
  // would reject every release carrying it. Installs learn to accept it first;
  // only once they have does the signer start including it. Until then the
  // absence is normal and notes stay unverified, exactly as before.
  if (manifest.notes_sha256) {
    const given = typeof notes === "string" ? notes : "";
    const digest = crypto.createHash("sha256").update(given, "utf8").digest("hex");
    if (digest !== manifest.notes_sha256) {
      return { ok: false, reason: "the release notes do not match what was signed" };
    }
  }

  // A good signature on a stale manifest is how a downgrade is replayed: the
  // attacker re-serves a genuine old release to walk the site back onto a
  // version with a known bug.
  if (Date.parse(manifest.expires_at) <= now) {
    return { ok: false, reason: `manifest expired at ${manifest.expires_at}` };
  }

  if (manifest.product !== product) {
    return { ok: false, reason: `manifest is for '${manifest.product}', this install is '${product}'` };
  }

  if (expectedRepo && manifest.repo !== expectedRepo) {
    return { ok: false, reason: `manifest points at ${manifest.repo}, this install is pinned to ${expectedRepo}` };
  }

  // The commit decides, not the label. A release's version string is whatever
  // the person signing it typed; package.json is whatever was committed. If
  // those drift — and they did — comparing versions alone means an install that
  // is ALREADY RUNNING the offered commit keeps being offered it, for ever.
  // `current: true` marks a verdict that is NOT a refusal. Being already up to
  // date is an ordinary state; reporting it the same way as a bad signature
  // would put a red warning on every healthy system.
  if (currentCommit && manifest.commit === currentCommit) {
    return { ok: false, current: true, reason: `already running ${manifest.commit.slice(0, 9)}` };
  }

  if (currentVersion && compareVersions(manifest.version, currentVersion) <= 0) {
    return { ok: false, current: true, reason: `offered ${manifest.version}, already on ${currentVersion}` };
  }

  if (manifest.min_from_version && currentVersion &&
      compareVersions(currentVersion, manifest.min_from_version) < 0) {
    return { ok: false, reason: `requires at least ${manifest.min_from_version}, this install is on ${currentVersion}` };
  }

  // keyIndex 0 is the current key; anything above it is a successor this install
  // has been told to trust. Surfaced so a rollover can be watched rather than
  // assumed complete.
  return { ok: true, notesVerified: !!manifest.notes_sha256, keyIndex };
}

module.exports = {
  verifyWhich, FIELDS, validate, canonical, verifySignature, compareVersions, accept, pem };
