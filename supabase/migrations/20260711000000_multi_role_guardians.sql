-- Guardianship is defined by a data relationship (players.parent_id),
-- not by a profile role. This lets mentors, coaches, and superadmins
-- who also have registered kids access those kids the same way a
-- role=parent user does.

DROP POLICY IF EXISTS "parent_select_own_players" ON players;
CREATE POLICY "guardian_select_own_players" ON players
  FOR SELECT USING (parent_id = auth.uid());

DROP POLICY IF EXISTS "parent_insert_own_players" ON players;
CREATE POLICY "guardian_insert_own_players" ON players
  FOR INSERT WITH CHECK (parent_id = auth.uid());

DROP POLICY IF EXISTS "parent_update_own_players" ON players;
CREATE POLICY "guardian_update_own_players" ON players
  FOR UPDATE USING (parent_id = auth.uid())
             WITH CHECK (parent_id = auth.uid());
