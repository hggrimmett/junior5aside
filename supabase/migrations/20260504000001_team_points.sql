-- Add points and total_runs columns to teams for leaderboard
ALTER TABLE teams ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS total_runs INT NOT NULL DEFAULT 0;
