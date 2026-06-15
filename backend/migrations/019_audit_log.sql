-- ============================================================
-- Remedy — append-only audit log of sensitive actions.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER,
  user_name  VARCHAR(160),
  action     VARCHAR(60) NOT NULL,
  entity     VARCHAR(40),
  entity_id  VARCHAR(40),
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log (action);
