-- Replace Blue/Green/Red age groups with school years Y3-Y8

-- Create new enum
CREATE TYPE school_year AS ENUM ('Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8');

-- Migrate players.age_group
ALTER TABLE players ALTER COLUMN age_group DROP DEFAULT;
ALTER TABLE players ALTER COLUMN age_group TYPE school_year USING 'Y3'::school_year;

-- Migrate tournaments.age_group_category
ALTER TABLE tournaments ALTER COLUMN age_group_category TYPE school_year USING 'Y3'::school_year;

-- Drop old enum
DROP TYPE age_group;
