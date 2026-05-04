-- Add email to profiles so we can match mentors by email in CSV import
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Populate existing profiles with their auth email
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;
