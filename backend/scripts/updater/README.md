# The update applier

Applies a signed release to this install. Runs as **root, on a timer** — never
as part of the web application.

That separation is the whole design. The web app may drop a *request* in the
spool; it cannot perform an update, and it holds no credential that would let
it. Without this split, any injection bug in the web tier becomes root on a box
holding patient records.

```
web app ──writes──▶ spool/requests/*.json ──read by──▶ updater (root)
                                                          │
   spool/results/*.json ◀────────writes────────────────────┘
```

## What it refuses

Before anything is touched, and answering only from its own root-owned config:

- a manifest whose signature does not verify against **the applier's** key
- a manifest that has expired — the replay/downgrade control
- a manifest for a different product
- a manifest naming a repository other than the pinned one
- a commit that is not exactly 40 hex characters
- a manifest that changes the database but does not require a backup

No manifest value is ever interpolated into a command string. Commands are run
with argument arrays and no shell.

## Order of operations

```
verify → back up → fetch → checkout → install → migrate → restart → confirm
              ↑                                                        │
              └──────────────── revert on any failure ─────────────────┘
```

Two properties matter more than the rest:

**A backup gates every migration.** A migration cannot be undone by reverting
code — once `ALTER TABLE` has run, putting the old commit back does not put the
old schema back. So the apply refuses to start without a backup, and refuses to
trust one it has not confirmed exists and is non-empty. If a migration then
fails, the result carries the backup reference and says the schema may be
partly migrated.

**A zero exit code is not proof.** The apply is finished when the running
process reports it is serving the new commit on `/api/health`, not when the
restart command returns. A deploy that updates files but leaves the old process
holding the port is the exact failure this catches — and it reverts.

## Install

**1. Config** — `/etc/banoyah-updater.conf`, root-owned, mode `0600`. The
applier refuses to run from a config other users can write, because a config the
application could edit would defeat the separation.

The public key and the repo pin live **here**, not in the application's `.env`,
so compromising the app does not change what it will accept as genuine.

```json
{
  "product":      "elims",
  "repo":         "https://github.com/Fadil9626/ELIMS.git",
  "publicKey":    "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  "repoDir":      "/var/www/elims",
  "spoolDir":     "/var/lib/banoyah-updater",
  "backupDir":    "/var/backups/elims",

  "backupCommand": ["/usr/bin/docker","exec","elims_db","pg_dump","-U","postgres","-d","postgres","--no-owner"],

  "installSteps": [
    { "cmd": ["/usr/bin/npm","install","--omit=dev","--omit=optional","--silent"], "cwd": "backend" },
    { "cmd": ["/usr/bin/npm","install","--silent"], "cwd": "frontend" },
    { "cmd": ["/usr/bin/npm","run","build"], "cwd": "frontend" }
  ],
  "migrate": { "cmd": ["/usr/bin/npm","run","migrate"], "cwd": "backend" },

  "restart":   ["/usr/bin/env","PM2_HOME=/root/.pm2","/usr/bin/pm2","restart","elims-backend"],
  "healthUrl": "http://127.0.0.1:5000/api/health",
  "healthTimeoutMs": 180000
}
```

Four things in there are not obvious, and each cost a failed run on the demo box
to learn:

**`backupCommand`** — the database is not always where the applier is. Here
ELIMS runs under pm2 while its Postgres is in a container, so the container's
own `pg_dump` is used: its client always matches its server. The host binary
happens to work today (16.14 against 16.13) and stops the day one is upgraded
and the other is not, taking every update with it — a failed backup correctly
blocks the migration behind it.

**Per-step `cwd`** — a real deployment does not run everything at the repository
root. Backend dependencies and migrations run in `backend`, the build in
`frontend`. Run at the root, npm finds the wrong `package.json` and the step
exits having built nothing, which looks like success.

**Absolute paths and `PM2_HOME`** — systemd gives a bare environment. `pm2`
here is root's daemon, and without `PM2_HOME` it would look for one that does
not exist and restart nothing.

**`stampFile`** — defaults to `backend/.deployed-sha`, and normally needs no
entry. The app reads it once at boot and reports it on `/api/health`, which is
what the confirmation step compares against, so the applier writes it before
restarting. Set it to `null` only for a product that reports its commit some
other way.

```bash
sudo install -m 600 -o root -g root updater.conf /etc/banoyah-updater.conf
sudo mkdir -p /var/lib/banoyah-updater/requests /var/lib/banoyah-updater/results
# the app user needs to write requests and read results, nothing more
sudo chgrp -R elims /var/lib/banoyah-updater
sudo chmod 730 /var/lib/banoyah-updater/requests
sudo chmod 750 /var/lib/banoyah-updater/results
```

**1b. Let root use the repository, and give the service a HOME.** Two things
bite here, and both cost a failed install on the demo box before they were
understood.

The applier runs as root while the checkout is owned by the service account, and
git refuses to operate on a repository owned by another user. And a systemd
`oneshot` service has **no `HOME` at all** — so `git config --global`, which
writes to `$HOME/.gitconfig`, is invisible to it. Setting the exception with
`--global` and then testing it under interactive `sudo` (which *does* set
`HOME=/root`) looks like it works and changes nothing for the service.

Use the system config, which git reads whatever `HOME` is:

```bash
sudo git config --system --add safe.directory /var/www/elims
```

and give the unit a `HOME`, which `npm` also needs for its cache:

```ini
[Service]
Type=oneshot
Environment=HOME=/root
```

Without the first, every apply dies at the first command with *"detected dubious
ownership"*. It fails safely — before the backup and before any checkout — but
it fails every time.

**2. Timer** — `/etc/systemd/system/banoyah-updater.service`:

```ini
[Unit]
Description=Banoyah update applier
After=network-online.target

[Service]
Type=oneshot
# systemd sets no HOME. git and npm both need one; without it the
# safe.directory exception above is unreadable and npm's cache has nowhere
# to go.
Environment=HOME=/root
ExecStart=/usr/bin/node /var/www/elims/backend/scripts/updater/run.js --once
# Exit codes: 0 nothing to do or applied cleanly, 1 an apply failed
# (and was reverted), 2 the applier refused to start at all.
```

`/etc/systemd/system/banoyah-updater.timer`:

```ini
[Unit]
Description=Check for pending updates

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now banoyah-updater.timer
```

## Updating the applier itself

The applier is part of the same repository it deploys, so an update can change
the code that is performing it. On the demo box that produced a real failure:
the configuration used a step form the *installed* applier did not understand,
and it threw halfway through — after the checkout, before the restart.

Two rules follow.

**Change the applier and the config in separate releases**, applier first. A
config written for a version that is not installed yet fails at the worst
moment; the gate now refuses that up front, but the ordering is what makes it a
non-event.

**Prefer deploying the applier itself by hand** — `deploy.sh` — rather than
through the applier. Nothing forbids self-update and the crash path now reverts
cleanly, but a process rewriting its own code mid-run is a class of problem
worth not having on a hospital's server.

## Running it by hand

```bash
sudo node /var/www/elims/backend/scripts/updater/run.js --once
```

Only one apply runs at a time. A lock older than two hours is treated as stale
and cleared, so a crashed apply cannot wedge the box permanently.

## Testing it

`node test/applyUpdate.test.js` covers every failure path with the command
runner, backup and health check injected: a build that fails, a migration that
fails, a service that never comes back, and a restart that exits zero while the
old process keeps serving. Those are the paths that must not be met for the
first time on a hospital's server.
