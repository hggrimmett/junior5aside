-- Now that enum values exist, migrate data and update policies

-- Rename existing admin users to superadmin
UPDATE profiles SET role = 'superadmin' WHERE role = 'admin';

-- Replace admin RLS policies with superadmin
DROP POLICY IF EXISTS "admin_full_access_profiles" ON profiles;
CREATE POLICY "superadmin_full_access_profiles" ON profiles
  FOR ALL USING (public.user_role() = 'superadmin');

DROP POLICY IF EXISTS "admin_full_access_players" ON players;
CREATE POLICY "superadmin_full_access_players" ON players
  FOR ALL USING (public.user_role() = 'superadmin');

DROP POLICY IF EXISTS "admin_full_access_tournaments" ON tournaments;
CREATE POLICY "superadmin_full_access_tournaments" ON tournaments
  FOR ALL USING (public.user_role() = 'superadmin');

DROP POLICY IF EXISTS "admin_full_access_teams" ON teams;
CREATE POLICY "superadmin_full_access_teams" ON teams
  FOR ALL USING (public.user_role() = 'superadmin');

DROP POLICY IF EXISTS "admin_full_access_matches" ON matches;
CREATE POLICY "superadmin_full_access_matches" ON matches
  FOR ALL USING (public.user_role() = 'superadmin');

-- Coach policies: manage players, teams, matches
CREATE POLICY "coach_read_players" ON players
  FOR SELECT USING (public.user_role() = 'coach');

CREATE POLICY "coach_update_players" ON players
  FOR UPDATE USING (public.user_role() = 'coach');

CREATE POLICY "coach_full_teams" ON teams
  FOR ALL USING (public.user_role() = 'coach');

CREATE POLICY "coach_full_matches" ON matches
  FOR ALL USING (public.user_role() = 'coach');

CREATE POLICY "coach_read_tournaments" ON tournaments
  FOR SELECT USING (public.user_role() = 'coach');

-- Update profile insert policy to include coach
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role IN ('parent', 'mentor', 'coach'));

-- Settings: superadmin only for writes
DROP POLICY IF EXISTS "admin_write_settings" ON settings;
CREATE POLICY "superadmin_write_settings" ON settings
  FOR ALL USING (public.user_role() = 'superadmin');
