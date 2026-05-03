-- Expand roles: add superadmin and coach
-- Coach also covers umpiring duties

-- Add new enum values (must be in separate transaction from usage)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'superadmin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'coach';
