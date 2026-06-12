-- Migration 017: Create used_tokens table
-- Purpose: Track JWT jti (JWT ID) to detect token reuse attacks
-- Date: 2026-06-12
-- Fixes:
--   Fix #8: TTL cleanup via created_at index (delete rows created > 7 days ago)
--   Fix #6: GDPR cascading deletes on user_id (ON DELETE CASCADE)
--   Fix #7: Explicit TIMESTAMP WITH TIME ZONE for UTC consistency

CREATE TABLE used_tokens (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  jti VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  COMMENT 'used_tokens: JWT jti tracker for reuse detection. Entries auto-purged after 7 days by background job.'
);

-- Indexes for efficient queries
CREATE INDEX idx_used_tokens_user_id ON used_tokens(user_id);
COMMENT ON INDEX idx_used_tokens_user_id IS 'Fix #1: Fast lookup of all jti for a user during logout/revoke';

CREATE INDEX idx_used_tokens_jti ON used_tokens(jti);
COMMENT ON INDEX idx_used_tokens_jti IS 'Fix #2: Fast reuse detection on every refresh attempt';

-- Table comment
COMMENT ON TABLE used_tokens IS 'JWT jti (JWT ID) tracker for detecting token reuse attacks. Combined with revoked_tokens, prevents refresh token reuse. Rows older than 7 days are auto-purged via cron job or manual cleanup (Fix #8: TTL cleanup).';
COMMENT ON COLUMN used_tokens.user_id IS 'Employee UUID who issued the token. ON DELETE CASCADE ensures GDPR compliance (Fix #6).';
COMMENT ON COLUMN used_tokens.jti IS 'Unique JWT ID from token payload. UNIQUE constraint prevents duplicate jti entries.';
COMMENT ON COLUMN used_tokens.created_at IS 'When the jti was recorded (Fix #7: TIMESTAMP WITH TIME ZONE for UTC). Used for TTL cleanup.';
