-- Migration 005: Fix created_by and modified_by column types
-- Created: 2026-06-01
-- Reason: These should be VARCHAR(255) for usernames, not UUID

-- Drop foreign key constraints if they exist
ALTER TABLE checkins
  DROP CONSTRAINT IF EXISTS checkins_created_by_fkey CASCADE;
ALTER TABLE checkins
  DROP CONSTRAINT IF EXISTS checkins_modified_by_fkey CASCADE;

-- Change created_by from UUID to VARCHAR(255)
ALTER TABLE checkins
  ALTER COLUMN created_by DROP DEFAULT,
  ALTER COLUMN created_by TYPE VARCHAR(255) USING created_by::text;

-- Change modified_by from UUID to VARCHAR(255) (allow NULL)
ALTER TABLE checkins
  ALTER COLUMN modified_by TYPE VARCHAR(255) USING modified_by::text;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'checkins' AND column_name IN ('created_by', 'modified_by')
ORDER BY ordinal_position;
