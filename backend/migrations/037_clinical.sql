-- ============================================================
-- Remedy — clinical safety: customer allergies + drug-interaction warnings
-- surfaced at the till and when dispensing.
-- ============================================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS allergies JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS drug_interactions (
  id         SERIAL PRIMARY KEY,
  term_a     VARCHAR(80) NOT NULL,
  term_b     VARCHAR(80) NOT NULL,
  severity   VARCHAR(12) NOT NULL DEFAULT 'moderate', -- minor | moderate | severe
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a starter set of well-known interactions (only when the table is empty).
INSERT INTO drug_interactions (term_a, term_b, severity, note)
SELECT v.a, v.b, v.s, v.n FROM (VALUES
  ('warfarin','aspirin','severe','Markedly increased bleeding risk'),
  ('warfarin','ibuprofen','severe','Increased bleeding risk (NSAID)'),
  ('warfarin','naproxen','severe','Increased bleeding risk (NSAID)'),
  ('warfarin','diclofenac','severe','Increased bleeding risk (NSAID)'),
  ('aspirin','ibuprofen','moderate','Reduced antiplatelet effect; GI risk'),
  ('methotrexate','ibuprofen','severe','NSAID raises methotrexate toxicity'),
  ('simvastatin','clarithromycin','severe','Myopathy / rhabdomyolysis risk'),
  ('simvastatin','erythromycin','severe','Myopathy risk'),
  ('lisinopril','potassium','moderate','Hyperkalaemia risk'),
  ('lisinopril','spironolactone','moderate','Hyperkalaemia risk'),
  ('tramadol','sertraline','severe','Serotonin syndrome risk'),
  ('tramadol','fluoxetine','severe','Serotonin syndrome risk'),
  ('ciprofloxacin','tizanidine','severe','Excessive sedation / hypotension'),
  ('digoxin','furosemide','moderate','Hypokalaemia increases digoxin toxicity'),
  ('clopidogrel','omeprazole','moderate','Reduced clopidogrel effectiveness'),
  ('metronidazole','alcohol','severe','Disulfiram-like reaction')
) AS v(a,b,s,n)
WHERE NOT EXISTS (SELECT 1 FROM drug_interactions);
