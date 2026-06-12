-- Migration 018: Add jti_hash column to audit_log
-- Purpose: Hash JWT IDs in audit trail to prevent plaintext token exposure
-- Date: 2026-06-12
-- Fixes:
--   Fix #4: SHA256 hash prevents plaintext jti in audit logs (security best practice)

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS jti_hash VARCHAR(64);

COMMENT ON COLUMN audit_log.jti_hash IS 'SHA256 hash of JWT ID (Fix #4). Stores only hash, never plaintext jti. Enables token audit trail without exposing secrets.';
