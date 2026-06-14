-- ============================================================
-- Remedy — market pricing as a licensable module
-- The module flag (not a setting) is the switch: OFF = fixed pricing
-- (default), ON = open-market pricing. Control Center licenses it per tenant.
-- ============================================================
INSERT INTO app_modules (module_key, display_name, is_enabled, is_core, sort_order) VALUES
  ('market_pricing', 'Market Pricing', false, false, 35)
ON CONFLICT (module_key) DO NOTHING;
