-- Migration 006: Add users and refresh_tokens tables for Auth0 integration
-- Created: 2026-06-01
-- Reason: Support user authentication via Auth0 and JWT-based sessions

-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  auth0_sub VARCHAR(255) NOT NULL UNIQUE, -- Auth0 subject identifier
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'employee', -- employee | manager | admin
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create refresh_tokens table for token rotation
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP, -- NULL if active, set when revoked
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indices for performance
CREATE INDEX idx_users_client_id ON users(client_id);
CREATE INDEX idx_users_auth0_sub ON users(auth0_sub);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Verify
SELECT COUNT(*) as users_count FROM users;
SELECT COUNT(*) as refresh_tokens_count FROM refresh_tokens;
