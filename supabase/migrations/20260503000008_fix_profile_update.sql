-- Replace parent-only update with a policy that lets any user update their own profile
DROP POLICY IF EXISTS "parent_update_own_profile" ON profiles;

CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
