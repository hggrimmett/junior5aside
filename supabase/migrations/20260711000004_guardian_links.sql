-- Guardian links: symmetric junction table so two profiles can share
-- visibility of each other's linked kids. We always insert BOTH (a,b)
-- and (b,a) so the read query stays simple.

CREATE TABLE IF NOT EXISTS guardian_links (
  a UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  b UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (a, b),
  CHECK (a <> b)
);

ALTER TABLE guardian_links ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read links (needed for the visibility check
-- on players and for the admin UI). Rows themselves are not sensitive.
CREATE POLICY "authenticated_read_guardian_links" ON guardian_links
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only superadmin can write links.
CREATE POLICY "superadmin_write_guardian_links" ON guardian_links
  FOR ALL USING (public.user_role() = 'superadmin');

-- Extend the guardian_select_own_players policy to also allow reading
-- players whose parent_id is a linked guardian of the caller.
DROP POLICY IF EXISTS "guardian_select_own_players" ON players;
CREATE POLICY "guardian_select_own_players" ON players
  FOR SELECT USING (
    parent_id = auth.uid()
    OR parent_id IN (SELECT b FROM guardian_links WHERE a = auth.uid())
  );
