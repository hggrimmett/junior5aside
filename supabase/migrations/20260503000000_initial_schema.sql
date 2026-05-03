-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'parent', 'mentor');
CREATE TYPE age_group AS ENUM ('Blue', 'Green', 'Red');

-- Profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role user_role NOT NULL,
  full_name TEXT NOT NULL,
  mobile_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tournaments
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  age_group_category age_group NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tournament_id UUID NOT NULL REFERENCES tournaments ON DELETE CASCADE,
  mentor_id UUID REFERENCES profiles ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  name TEXT NOT NULL,
  age_group age_group NOT NULL,
  team_id UUID REFERENCES teams ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Matches
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments ON DELETE CASCADE,
  team_a_id UUID NOT NULL REFERENCES teams ON DELETE CASCADE,
  team_b_id UUID NOT NULL REFERENCES teams ON DELETE CASCADE,
  score_a INT DEFAULT 0,
  score_b INT DEFAULT 0,
  wickets_a INT DEFAULT 0,
  wickets_b INT DEFAULT 0,
  status BOOLEAN NOT NULL DEFAULT false,
  scheduled_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Helper: check if the current user has a given role
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams       ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES policies
-- ============================================================

-- Admins: full access
CREATE POLICY "admin_full_access_profiles" ON profiles
  FOR ALL USING (public.user_role() = 'admin');

-- Parents: own row only
CREATE POLICY "parent_select_own_profile" ON profiles
  FOR SELECT USING (auth.uid() = id AND public.user_role() = 'parent');

CREATE POLICY "parent_insert_own_profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role = 'parent');

CREATE POLICY "parent_update_own_profile" ON profiles
  FOR UPDATE USING (auth.uid() = id AND public.user_role() = 'parent')
             WITH CHECK (auth.uid() = id);

-- ============================================================
-- PLAYERS policies
-- ============================================================

-- Admins: full access
CREATE POLICY "admin_full_access_players" ON players
  FOR ALL USING (public.user_role() = 'admin');

-- Parents: own players only
CREATE POLICY "parent_select_own_players" ON players
  FOR SELECT USING (parent_id = auth.uid() AND public.user_role() = 'parent');

CREATE POLICY "parent_insert_own_players" ON players
  FOR INSERT WITH CHECK (parent_id = auth.uid() AND public.user_role() = 'parent');

CREATE POLICY "parent_update_own_players" ON players
  FOR UPDATE USING (parent_id = auth.uid() AND public.user_role() = 'parent')
             WITH CHECK (parent_id = auth.uid());

-- ============================================================
-- TOURNAMENTS policies
-- ============================================================

-- Admins: full access
CREATE POLICY "admin_full_access_tournaments" ON tournaments
  FOR ALL USING (public.user_role() = 'admin');

-- Authenticated users can view tournaments
CREATE POLICY "authenticated_select_tournaments" ON tournaments
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- TEAMS policies
-- ============================================================

-- Admins: full access
CREATE POLICY "admin_full_access_teams" ON teams
  FOR ALL USING (public.user_role() = 'admin');

-- Public: read team names (anon + authenticated)
CREATE POLICY "public_select_teams" ON teams
  FOR SELECT USING (true);

-- ============================================================
-- MATCHES policies
-- ============================================================

-- Admins: full access
CREATE POLICY "admin_full_access_matches" ON matches
  FOR ALL USING (public.user_role() = 'admin');

-- Public: read match scores and status (anon + authenticated)
CREATE POLICY "public_select_matches" ON matches
  FOR SELECT USING (true);
