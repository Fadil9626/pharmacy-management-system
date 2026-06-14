-- ============================================================
-- Remedy — local cache of subscription plan pricing pushed from
-- the Control Center (so the instance knows its own tier pricing).
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  plan_key       VARCHAR(40) PRIMARY KEY,
  price          NUMERIC(12,2),
  original_price NUMERIC(12,2),
  currency       VARCHAR(10),
  billing_period VARCHAR(20),
  description    TEXT,
  max_users      INTEGER,
  modules        TEXT[],
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
