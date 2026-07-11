-- Persist finals-scheduling preferences per tournament so the fixture
-- generator can factor them in without depending on transient UI state.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS schedule_grand_final BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS schedule_plate_final BOOLEAN NOT NULL DEFAULT TRUE;
