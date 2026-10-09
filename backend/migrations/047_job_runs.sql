-- When each scheduled job last ran (lib/scheduler.js). A job claims its turn
-- with one UPDATE, so two app processes, or a restart, never send the same
-- alerts twice.
-- Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS job_runs (
  job      VARCHAR(40) PRIMARY KEY,
  last_run TIMESTAMPTZ NOT NULL DEFAULT 'epoch'
);
INSERT INTO job_runs (job) VALUES ('alerts'), ('daily_summary') ON CONFLICT DO NOTHING;
