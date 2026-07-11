-- Finals placeholders exist before we know which teams will be finalists,
-- so team_a_id and team_b_id must be allowed NULL. Render sites display
-- "TBD" when either is null.

ALTER TABLE matches
  ALTER COLUMN team_a_id DROP NOT NULL,
  ALTER COLUMN team_b_id DROP NOT NULL;
