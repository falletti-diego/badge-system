-- Migration 013: Create schema_migrations tracking table
-- Purpose: Track which migrations have been applied (idempotency)
-- Date: 2026-06-12

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  execution_time_ms INT,
  checksum VARCHAR(64) -- SHA256 of migration content (optional, for integrity)
);

CREATE INDEX idx_schema_migrations_filename ON schema_migrations(filename);
