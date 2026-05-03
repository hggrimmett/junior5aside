-- Only superadmin can see contact details (full_name, mobile_number) of other users.
-- Other roles can only read their own profile row.

-- Drop existing parent/mentor select policies
DROP POLICY IF EXISTS "parent_select_own_profile" ON profiles;

-- Everyone can read their own profile
CREATE POLICY "select_own_profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Coaches can see player names (via players table) but NOT profiles/contact details
-- The superadmin_full_access_profiles policy already grants superadmin full read
