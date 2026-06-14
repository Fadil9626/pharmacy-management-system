-- ── Default branch ──────────────────────────────────────────
INSERT INTO branches (name, code, is_main)
SELECT 'Main Branch', 'MAIN', true
WHERE NOT EXISTS (SELECT 1 FROM branches);

-- ── Module registry (core = always on; others licensable) ───
INSERT INTO app_modules (module_key, display_name, is_enabled, is_core, sort_order) VALUES
  ('inventory',        'Inventory & Catalog',  true,  false, 10),
  ('pos',              'Point of Sale',        true,  false, 20),
  ('purchasing',       'Purchasing',           true,  false, 30),
  ('reports',          'Reports & Analytics',  true,  false, 40),
  ('prescriptions',    'Prescriptions',        false, false, 50),
  ('customers',        'Customers',            false, false, 60),
  ('controlled_drugs', 'Controlled Drugs',     false, false, 70),
  ('finance',          'Finance',              false, false, 80),
  ('branches',         'Branches',             false, false, 90)
ON CONFLICT (module_key) DO NOTHING;

-- ── Sample data (first run only) ────────────────────────────
INSERT INTO suppliers (name, phone)
SELECT 'MediSupply Ltd', '+232 76 000 000'
WHERE NOT EXISTS (SELECT 1 FROM suppliers);

INSERT INTO products (name, generic_name, category, dosage_form, strength, unit, reorder_level, is_controlled)
SELECT v.* FROM (VALUES
  ('Paracetamol 500mg',   'Paracetamol',   'Analgesic',     'Tablet',  '500mg', 'pack', 20, false),
  ('Amoxicillin 250mg',   'Amoxicillin',   'Antibiotic',    'Capsule', '250mg', 'pack', 15, false),
  ('Ibuprofen 400mg',     'Ibuprofen',     'Analgesic',     'Tablet',  '400mg', 'pack', 20, false),
  ('ORS Sachets',         'Oral Rehydration Salts', 'Electrolyte', 'Sachet', '-', 'sachet', 30, false),
  ('Metformin 500mg',     'Metformin',     'Antidiabetic',  'Tablet',  '500mg', 'pack', 15, false),
  ('Amlodipine 5mg',      'Amlodipine',    'Antihypertensive', 'Tablet', '5mg', 'pack', 15, false),
  ('Cough Syrup 100ml',   'Guaifenesin',   'Cough & Cold',  'Syrup',   '100ml', 'bottle', 12, false),
  ('Vitamin C 1000mg',    'Ascorbic Acid', 'Supplement',    'Tablet',  '1000mg','pack', 18, false),
  ('Diazepam 5mg',        'Diazepam',      'Sedative',      'Tablet',  '5mg',   'pack', 10, true),
  ('Multivitamin',        'Multivitamin',  'Supplement',    'Tablet',  '-',     'pack', 15, false)
) AS v(name, generic_name, category, dosage_form, strength, unit, reorder_level, is_controlled)
WHERE NOT EXISTS (SELECT 1 FROM products);

-- One opening stock batch per product into the main branch, with varied
-- quantity and expiry so the dashboard has something to show.
INSERT INTO product_batches (product_id, branch_id, supplier_id, batch_no, expiry_date, quantity, cost_price, selling_price)
SELECT
  p.id,
  (SELECT id FROM branches WHERE is_main LIMIT 1),
  (SELECT id FROM suppliers LIMIT 1),
  'B' || p.id || '-001',
  CURRENT_DATE + ((2 + (p.id * 5) % 22) || ' months')::interval,
  CASE WHEN p.id % 4 = 0 THEN 6 ELSE 60 + (p.id * 13) % 90 END,
  (5 + (p.id * 7) % 20)::numeric,
  (9 + (p.id * 11) % 35)::numeric
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_batches);
