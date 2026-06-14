-- ============================================================
-- Remedy — core schema (branch-aware, modular SaaS)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS branches (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  code       VARCHAR(20),
  is_main    BOOLEAN NOT NULL DEFAULT false,
  address    TEXT,
  phone      VARCHAR(40),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The module registry — single source of truth for what's switched on.
-- Mirrors the pattern used across the Banoyah product line; the Control
-- Center toggles these per subscriber for SaaS licensing.
CREATE TABLE IF NOT EXISTS app_modules (
  module_key   VARCHAR(40) PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  is_enabled   BOOLEAN NOT NULL DEFAULT false,
  is_core      BOOLEAN NOT NULL DEFAULT false,
  sort_order   INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  branch_id     INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  full_name     VARCHAR(160) NOT NULL,
  email         VARCHAR(160) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(30) NOT NULL DEFAULT 'cashier', -- owner|manager|pharmacist|cashier
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(160) NOT NULL,
  phone      VARCHAR(40),
  email      VARCHAR(160),
  address    TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shared product catalogue (branch-agnostic). Stock lives per branch in batches.
CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  generic_name  VARCHAR(200),
  category      VARCHAR(80),
  dosage_form   VARCHAR(60),
  strength      VARCHAR(60),
  unit          VARCHAR(40) NOT NULL DEFAULT 'unit',
  barcode       VARCHAR(80),
  is_controlled BOOLEAN NOT NULL DEFAULT false,
  reorder_level INTEGER NOT NULL DEFAULT 10,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products (lower(name));
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode);

-- Stock by batch, per branch (FEFO via expiry_date).
CREATE TABLE IF NOT EXISTS product_batches (
  id            SERIAL PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id     INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  supplier_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  batch_no      VARCHAR(60),
  expiry_date   DATE,
  quantity      INTEGER NOT NULL DEFAULT 0,
  cost_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches (product_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry  ON product_batches (expiry_date);

CREATE TABLE IF NOT EXISTS sales (
  id             SERIAL PRIMARY KEY,
  branch_id      INTEGER NOT NULL REFERENCES branches(id),
  user_id        INTEGER REFERENCES users(id),
  receipt_no     VARCHAR(30),
  customer_name  VARCHAR(160),
  subtotal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales (created_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id),
  batch_id    INTEGER REFERENCES product_batches(id),
  name        VARCHAR(200),
  qty         INTEGER NOT NULL,
  unit_price  NUMERIC(12,2) NOT NULL,
  line_total  NUMERIC(12,2) NOT NULL
);
