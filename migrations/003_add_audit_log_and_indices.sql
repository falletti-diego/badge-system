-- Migration 003: Add audit_log table and indices for checkins table
-- Created: 2026-06-01
-- Purpose: Enable audit trail for check-in corrections, improve query performance

-- =====================================================
-- 1. Create audit_log table
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('checkin_created', 'checkin_corrected')),
  entity_type VARCHAR(50) NOT NULL DEFAULT 'checkin',
  entity_id UUID NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,
  user_id VARCHAR(255) DEFAULT 'system',
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_audit_client_id FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- =====================================================
-- 2. Create indices on audit_log
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_audit_log_client_id ON audit_log(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON audit_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_client_action ON audit_log(client_id, action);

-- =====================================================
-- 3. Enhance indices on checkins table
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_checkins_client_site_timestamp
  ON checkins(client_id, site_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_checkins_employee_id
  ON checkins(employee_id);

CREATE INDEX IF NOT EXISTS idx_checkins_created_at
  ON checkins(created_at);

CREATE INDEX IF NOT EXISTS idx_checkins_client_timestamp
  ON checkins(client_id, timestamp DESC);

-- =====================================================
-- 4. Add missing columns to checkins (if not exist)
-- =====================================================

ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS modified_by VARCHAR(255);

-- =====================================================
-- 5. Add constraint to prevent future modifications beyond 15 minutes
-- =====================================================

ALTER TABLE checkins
  ADD CONSTRAINT check_modified_within_15min
    CHECK (modified_at IS NULL OR modified_at <= timestamp + INTERVAL '15 minutes')
    NOT VALID;

-- Validate constraint (required for existing data)
ALTER TABLE checkins VALIDATE CONSTRAINT check_modified_within_15min;

-- =====================================================
-- 6. Verify schema
-- =====================================================

-- Run these SELECT statements to verify:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'audit_log' ORDER BY ordinal_position;
--
-- \d audit_log  (in psql: show table structure)
-- \d checkins   (verify modified_at, modified_by added)
