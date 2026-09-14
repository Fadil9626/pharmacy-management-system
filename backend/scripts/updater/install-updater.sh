#!/usr/bin/env bash
# =============================================================================
#  Install the Remedy (Pharmacy PMS) update applier on this server
# =============================================================================
#
#   sudo bash backend/scripts/updater/install-updater.sh
#
# Run it from the repository root. Everything here needs root, which is the
# design: the application can ask for an update, and only this separately-owned
# process can perform one.
#
# It detects rather than assumes. The demo box runs Postgres in Docker and has
# pm2 in /usr/bin; PHC runs Postgres natively and has pm2 in /usr/local/bin.
# Hardcoding either is how backup-db.sh came to fail with "docker: command not
# found" on the server that had no Docker, in the middle of being used.
#
# Idempotent: running it twice changes nothing the second time.
#
# It does NOT edit backend/.env. That file holds this install's identity — its
# Control Center address and its copy of the signing key — and a script that
# rewrites it is a script that can quietly repoint an install somewhere else.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/var/www/remedy}"
CONF="/etc/banoyah-updater-remedy.conf"
SPOOL="/var/lib/banoyah-updater-remedy"
UNIT="/etc/systemd/system/banoyah-updater-remedy.service"
TIMER="/etc/systemd/system/banoyah-updater-remedy.timer"
ENV_FILE="$REPO_DIR/backend/.env"

die()  { echo "  STOPPED: $*" >&2; exit 1; }
ok()   { echo "  ok    $*"; }
step() { echo; echo "[$1] $2"; }

[ "$(id -u)" -eq 0 ] || die "run this with sudo"
[ -d "$REPO_DIR" ]   || die "no repository at $REPO_DIR (set REPO_DIR= to override)"
[ -f "$ENV_FILE" ]   || die "no $ENV_FILE"

# ── 0. Find the tools, wherever this box keeps them ──────────────────────────
step 0 "Locating the tools"
find_bin() { for p in "$@"; do [ -x "$p" ] && { echo "$p"; return; }; done; command -v "$(basename "$1")" 2>/dev/null || true; }
NODE="$(find_bin /usr/bin/node /usr/local/bin/node)"
NPM="$(find_bin /usr/bin/npm /usr/local/bin/npm)"
PM2="$(find_bin /usr/local/bin/pm2 /usr/bin/pm2)"
GIT="$(find_bin /usr/bin/git /usr/local/bin/git)"
[ -n "$NODE" ] || die "node not found"
[ -n "$NPM" ]  || die "npm not found"
[ -n "$PM2" ]  || die "pm2 not found — this applier restarts a pm2 process"
ok "node $NODE"
ok "npm  $NPM"
ok "pm2  $PM2"

# ── 1. Where is the database, and how do we dump it? ─────────────────────────
# The same fork backup-db.sh now makes. Docker on the demo box, native on PHC.
step 1 "Working out how to back up the database"
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "pharmacy_db"; then
  BACKUP_CMD='["/usr/bin/docker","exec","pharmacy_db","pg_dump","-U","pharmacy_user","-d","pharmacy_db","--no-owner"]'
  ok "Docker container pharmacy_db"
else
  PGDUMP="$(find_bin /usr/bin/pg_dump /usr/local/bin/pg_dump)"
  RUNUSER="$(find_bin /usr/sbin/runuser /usr/bin/runuser)"
  [ -n "$PGDUMP" ]  || die "no pharmacy_db container and no pg_dump — nothing can take a backup"
  [ -n "$RUNUSER" ] || die "runuser not found; needed to dump as the postgres user"
  # The database name lives in .env. Read it here rather than making the
  # operator find it — but never echo DATABASE_URL, which carries the password.
  DB="$(grep -oE '^DB_NAME=.*' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
  if [ -z "$DB" ]; then
    DB="$(grep -oE '^DATABASE_URL=.*' "$ENV_FILE" 2>/dev/null | head -1 \
          | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#' | tr -d '"'"'"' ' || true)"
  fi
  [ -n "$DB" ] || die "could not read the database name from $ENV_FILE"
  BACKUP_CMD="[\"$RUNUSER\",\"-u\",\"postgres\",\"--\",\"$PGDUMP\",\"-d\",\"$DB\",\"--no-owner\"]"
  ok "local postgres, database '$DB' (dumped as the postgres user)"
fi

# ── 2. This install's own trust anchor ───────────────────────────────────────
# The applier keeps its OWN copy of the public key rather than believing the
# request. Read from .env, which is where this install already holds it.
# The API port. Remedy defaults to 5190, but an install sharing a box may have
# been moved — and a health check against the wrong port fails every update on
# a release that was fine.
HEALTH_PORT="$(grep -oE '^PORT=.*' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
HEALTH_PORT="${HEALTH_PORT:-5190}"
ok "health will be checked on port $HEALTH_PORT"

step 2 "Reading the signing key this install trusts"
PUBKEY="$(grep -E '^UPDATE_ED25519_PUBLIC_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')" || true
REPO_URL="$(grep -E '^UPDATE_REPO=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')" || true
REPO_URL="${REPO_URL:-https://github.com/Fadil9626/pharmacy-management-system.git}"
[ -n "$PUBKEY" ] || die "UPDATE_ED25519_PUBLIC_KEY is not in $ENV_FILE — configure the install for updates first"
ok "public key present"
ok "repository pinned to $REPO_URL"

# ── 3. The applier's configuration ───────────────────────────────────────────
# Mode 600: it holds the trust anchor and the repository pin. An application
# that could rewrite its own trust anchor would not have one.

# The app writes install requests to UPDATER_SPOOL_DIR; the applier reads this
# SPOOL. They have to be the same directory, and the app's built-in default is
# already product-specific — but an install that inherited an .env from
# elsewhere may have ELIMS's path in it, which would silently never install.
CURRENT_SPOOL="$(grep -oE '^UPDATER_SPOOL_DIR=.*' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
if [ -n "$CURRENT_SPOOL" ] && [ "$CURRENT_SPOOL" != "$SPOOL" ]; then
  die "UPDATER_SPOOL_DIR in $ENV_FILE is '$CURRENT_SPOOL' but this applier reads $SPOOL.
           Point them at the same directory, or remove the line to use the default."
fi

step 3 "Writing $CONF"
umask 077
cat > "$CONF" <<EOF
{
  "product":   "remedy",
  "repo":      "$REPO_URL",
  "publicKey": "$PUBKEY",
  "repoDir":   "$REPO_DIR",
  "spoolDir":  "$SPOOL",
  "backupDir": "/var/backups/remedy",

  "backupCommand": $BACKUP_CMD,

  "installSteps": [
    { "cmd": ["$NPM","install","--omit=dev","--omit=optional","--silent"], "cwd": "backend" },
    { "cmd": ["$NPM","install","--silent"], "cwd": "frontend" },
    { "cmd": ["$NPM","run","build"], "cwd": "frontend" }
  ],

  "restart":   ["/usr/bin/env","PM2_HOME=/root/.pm2","$PM2","restart","remedy","--update-env"],
  "healthUrl": "http://127.0.0.1:$HEALTH_PORT/api/health",
  "healthTimeoutMs": 180000
}
EOF
chown root:root "$CONF"; chmod 600 "$CONF"
ok "written, root-owned, mode 600"
echo "        the API serves frontend/dist itself (express.static), so the build"
echo "        in installSteps IS the publish — there is nothing to copy, and the"
echo "        restart is what starts serving it."

# ── 4. The spool ─────────────────────────────────────────────────────────────
step 4 "Creating $SPOOL"
mkdir -p "$SPOOL/requests" "$SPOOL/results"
ok "requests/ and results/ ready"

# ── 5. Let root operate a checkout it may not own ────────────────────────────
# --system, not --global: a oneshot unit has no HOME, so a --global exception is
# invisible to it. Testing under interactive sudo, which DOES set HOME=/root,
# looks like it works and proves nothing.
step 5 "Allowing root to use $REPO_DIR"
"$GIT" config --system --add safe.directory "$REPO_DIR" 2>/dev/null || true
"$GIT" config --system --get-all safe.directory | grep -qx "$REPO_DIR" \
  && ok "safe.directory set system-wide" || die "could not set safe.directory"

# ── 6. The unit and its timer ────────────────────────────────────────────────
step 6 "Installing the service and timer"
cat > "$UNIT" <<EOF
[Unit]
Description=Banoyah update applier (Remedy)
After=network-online.target

[Service]
Type=oneshot
# systemd sets no HOME. git needs one to read the safe.directory exception
# above, and npm wants somewhere for its cache.
Environment=HOME=/root
ExecStart=$NODE $REPO_DIR/backend/scripts/updater/run.js --once
# Exit codes: 0 nothing to do or applied cleanly, 1 an apply failed (and was
# reverted), 2 the applier refused to start at all.
EOF

cat > "$TIMER" <<EOF
[Unit]
Description=Check for pending Remedy updates

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

chmod 644 "$UNIT" "$TIMER"
systemctl daemon-reload
systemctl enable --now banoyah-updater-remedy.timer >/dev/null
ok "banoyah-updater-remedy.timer enabled"

# ── 7. Rehearse before trusting it ───────────────────────────────────────────
step 7 "Done — rehearse it before the first real release"
cat <<EOF
  1. Nothing queued; it should say so and stop:
       systemctl start banoyah-updater-remedy.service
       journalctl -u banoyah-updater-remedy.service -n 20 --no-pager

  2. Then queue the version already installed from the Software Updates panel.
     It should report "already on this commit" and touch nothing.

  3. Only then a genuine release.

  A rehearsal on a quiet afternoon is a different thing from reading this for
  the first time while a lab waits.
EOF
systemctl list-timers banoyah-updater-remedy.timer --no-pager || true
