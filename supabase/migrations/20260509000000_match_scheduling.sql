-- Per-tournament start-time override. If NULL, fixture generator uses the
-- global competition_start_time setting.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;

-- Global schedule config, stored alongside registration_deadline.
-- Defaults: 2026-07-12 09:00 BST (start), 12:00 BST (lunch).
INSERT INTO settings (key, value) VALUES
  ('competition_start_time',  '2026-07-12T08:00:00Z'),
  ('competition_lunch_start', '2026-07-12T11:00:00Z')
ON CONFLICT (key) DO NOTHING;
