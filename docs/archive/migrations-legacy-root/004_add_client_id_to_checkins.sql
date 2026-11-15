-- Migration 004: Add client_id column to checkins table
-- Created: 2026-06-01
-- Reason: Required for multi-tenant filtering in check-in API

ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

-- Backfill client_id from employees.client_id
UPDATE checkins c
SET client_id = e.client_id
FROM employees e
WHERE c.employee_id = e.id AND c.client_id IS NULL;

-- Make client_id NOT NULL
ALTER TABLE checkins
  ALTER COLUMN client_id SET NOT NULL;

-- Create index for multi-tenant filtering
CREATE INDEX IF NOT EXISTS idx_checkins_client_id ON checkins(client_id);

-- Verify
SELECT COUNT(*) as total_checkins, COUNT(DISTINCT client_id) as clients
FROM checkins;
