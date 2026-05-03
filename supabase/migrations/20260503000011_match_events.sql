-- Ball-by-ball scoring events table
CREATE TABLE match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams ON DELETE CASCADE,
  over_number INT NOT NULL DEFAULT 1,
  ball_number INT NOT NULL DEFAULT 1,
  runs INT NOT NULL DEFAULT 0,
  is_wicket BOOLEAN NOT NULL DEFAULT false,
  extra_type TEXT, -- 'wide', 'no_ball', 'bye', 'leg_bye', or null
  batter_id UUID REFERENCES players ON DELETE SET NULL,
  bowler_id UUID REFERENCES players ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast match timeline queries
CREATE INDEX idx_match_events_match ON match_events (match_id, created_at);
CREATE INDEX idx_match_events_team ON match_events (match_id, team_id, over_number, ball_number);

-- Add max_team_size to tournaments for team balancer
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS max_team_size INT NOT NULL DEFAULT 5;

-- RLS
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

-- Anyone can read events (live scoring for parents)
CREATE POLICY "public_read_events" ON match_events
  FOR SELECT USING (true);

-- Superadmin and coach can insert/update/delete
CREATE POLICY "admin_manage_events" ON match_events
  FOR ALL USING (public.user_role() IN ('superadmin', 'coach'));

-- Enable realtime on match_events
ALTER PUBLICATION supabase_realtime ADD TABLE match_events;
