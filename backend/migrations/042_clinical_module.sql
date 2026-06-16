-- ============================================================
-- Remedy — clinical safety & dosing as a licensable module.
-- OFF (default) = no dosage calculator / interaction-allergy-condition checks.
-- ON = the full clinical aid suite. Licensed per tenant via the Control Center.
-- ============================================================
INSERT INTO app_modules (module_key, display_name, is_enabled, is_core, sort_order) VALUES
  ('clinical', 'Clinical Safety & Dosing', false, false, 75)
ON CONFLICT (module_key) DO NOTHING;
