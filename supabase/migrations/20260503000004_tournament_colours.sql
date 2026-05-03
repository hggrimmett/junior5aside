-- Tournaments use colour names, not school years
-- Green = Y3/Y4, Red = Y5/Y6, Blue = Y7/Y8

CREATE TYPE tournament_colour AS ENUM ('Green', 'Red', 'Blue');

-- Replace school_year column on tournaments with colour
ALTER TABLE tournaments DROP COLUMN age_group_category;
ALTER TABLE tournaments ADD COLUMN colour tournament_colour NOT NULL DEFAULT 'Green';

-- Add a registration deadline to tournaments (or globally)
-- We'll add it as a site-wide setting for simplicity
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('registration_deadline', '2026-06-01T23:59:00Z')
ON CONFLICT (key) DO NOTHING;

-- RLS for settings: anyone can read, only admins can write
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_settings" ON settings
  FOR SELECT USING (true);

CREATE POLICY "admin_write_settings" ON settings
  FOR ALL USING (public.user_role() = 'admin');
