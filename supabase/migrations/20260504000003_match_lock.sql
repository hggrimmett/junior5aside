-- Match scoring lock: first-come-first-serve
-- When someone starts scoring, they lock the match
ALTER TABLE matches ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES auth.users ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS locked_by_name TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
