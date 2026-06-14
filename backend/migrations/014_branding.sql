-- ============================================================
-- Remedy — white-label branding: uploaded logo + colour theme.
-- logo is stored as a (resized) data URL so there's no file storage to manage.
-- ============================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo  TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS theme VARCHAR(20) NOT NULL DEFAULT 'emerald';
