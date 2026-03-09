-- Add is_event column to appointments for birthdays and similar all-day events
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS is_event BOOLEAN NOT NULL DEFAULT FALSE;
