-- Migration 016: Create revoked_tokens table
-- Purpose: Blacklist for revoked user tokens and temporary session invalidation
-- Date: 2026-06-12
-- Fixes:
--   Fix #3: Temporary revoke support via revoked_until with automatic expiry
--   Fix #6: GDPR cascading deletes on user_id (ON DELETE CASCADE)
--   Fix #7: Explicit TIMESTAMP WITH TIME ZONE for UTC consistency

CREATE TABLE revoked_tokens (
  id SERIAL PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  revoked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  revoked_by UUID REFERENCES employees(id) ON DELETE CASCADE,
  reason VARCHAR(255),
  revoked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  COMMENT 'revoked_tokens: Blacklist of revoked users. revoked_until=NULL means permanent revoke; revoked_until=future_time means temporary revoke with auto-expiry'
);

-- Indexes for efficient queries
CREATE INDEX idx_revoked_tokens_user_id ON revoked_tokens(user_id);
COMMENT ON INDEX idx_revoked_tokens_user_id IS 'Fix #1: Fast lookup when validating token ownership';

CREATE INDEX idx_revoked_tokens_expiry ON revoked_tokens(revoked_until);
COMMENT ON INDEX idx_revoked_tokens_expiry IS 'Fix #8: Enable TTL cleanup queries (revoked_until < NOW())';

-- Table comment
COMMENT ON TABLE revoked_tokens IS 'Revoked tokens blacklist for session invalidation (logout, password change, admin force-revoke). Supports temporary revoke (revoked_until) or permanent (revoked_until=NULL). CASCADE deletes ensure GDPR compliance.';
COMMENT ON COLUMN revoked_tokens.user_id IS 'Employee UUID being revoked. UNIQUE ensures one revocation record per user.';
COMMENT ON COLUMN revoked_tokens.revoked_at IS 'When the revocation was issued (Fix #7: TIMESTAMP WITH TIME ZONE).';
COMMENT ON COLUMN revoked_tokens.revoked_by IS 'Admin/manager who revoked (NULL if system-triggered).';
COMMENT ON COLUMN revoked_tokens.reason IS 'Reason for revocation (e.g., "password_change", "admin_force_logout", "suspicious_activity").';
COMMENT ON COLUMN revoked_tokens.revoked_until IS 'Optional expiry time for temporary revoke (NULL = permanent). After this, token is auto-reactivated (Fix #3).';
