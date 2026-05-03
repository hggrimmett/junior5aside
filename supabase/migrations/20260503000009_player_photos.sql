-- Add avatar_url to players for photo uploads
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create storage bucket for player photos (run via dashboard or CLI)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('player-photos', 'player-photos', true);

-- Storage policies for player-photos bucket
-- Parents can upload photos for their own children
-- Anyone can view photos (public bucket)
