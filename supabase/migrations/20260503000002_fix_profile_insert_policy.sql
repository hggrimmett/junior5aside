-- Drop the old restrictive insert policy
DROP POLICY IF EXISTS "parent_insert_own_profile" ON profiles;

-- Allow any authenticated user to insert their own profile row (parent or mentor)
CREATE POLICY "insert_own_profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role IN ('parent', 'mentor'));
