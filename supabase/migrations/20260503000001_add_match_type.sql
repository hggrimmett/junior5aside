-- Add match_type to distinguish league, final, and plate-final matches
CREATE TYPE match_type AS ENUM ('league', 'final', 'plate_final');

ALTER TABLE matches
  ADD COLUMN match_type match_type NOT NULL DEFAULT 'league';
