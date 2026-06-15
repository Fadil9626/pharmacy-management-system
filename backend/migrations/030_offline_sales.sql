-- ============================================================
-- Remedy — offline POS support. Each sale carries the client-generated UUID of
-- the till transaction so replaying a queued offline sale can't double-charge:
-- createSale returns the existing row when the UUID is already on file.
-- ============================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_uuid VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_uuid ON sales (client_uuid) WHERE client_uuid IS NOT NULL;
