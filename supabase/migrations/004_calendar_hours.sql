-- Add calendar display hour settings to families
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS calendar_start_hour SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calendar_end_hour   SMALLINT NOT NULL DEFAULT 24;
