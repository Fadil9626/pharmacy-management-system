-- ============================================================
-- Remedy — market pricing engine + single-currency ledger
-- ------------------------------------------------------------
-- Retail prices can float on the prevailing OPEN-MARKET exchange rate to
-- protect margins during currency swings, while every financial record is
-- still written in the pharmacy's single ledger currency (e.g. Leone) with
-- the rate snapshot stamped on it for clean tax auditing.
-- ============================================================

-- Rate history — quote_currency units per 1 base_currency unit
-- (e.g. base USD, quote SLE, rate 22.5 → 1 USD = 22.5 Leone).
CREATE TABLE IF NOT EXISTS exchange_rates (
  id             SERIAL PRIMARY KEY,
  base_currency  VARCHAR(10) NOT NULL,
  quote_currency VARCHAR(10) NOT NULL,
  rate           NUMERIC(16,6) NOT NULL CHECK (rate > 0),
  source         VARCHAR(20) NOT NULL DEFAULT 'market',  -- market | official
  note           TEXT,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rates_lookup
  ON exchange_rates (base_currency, quote_currency, source, created_at DESC);

-- Pricing controls live on settings. ledger/local currency = existing currency_code.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS base_currency VARCHAR(10) NOT NULL DEFAULT 'USD';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pricing_mode  VARCHAR(10) NOT NULL DEFAULT 'fixed'; -- fixed | market

-- A product's anchor selling price, denominated in the BASE currency.
-- Used to derive the live local retail price in market mode.
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price NUMERIC(14,4);

-- FX provenance on each sale (ledger amounts stay in local/ledger currency).
ALTER TABLE sales ADD COLUMN IF NOT EXISTS fx_rate      NUMERIC(16,6);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS fx_base      VARCHAR(10);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(10);
