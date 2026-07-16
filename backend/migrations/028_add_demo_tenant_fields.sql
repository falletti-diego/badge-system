-- Migration 028: Add demo tenant fields to clients
-- Purpose: Support self-service demo/trial tenants (Ambiente Demo Self-Service).
-- `is_demo` flags a client as an ephemeral demo tenant; `demo_expires_at` marks
-- when it should be cleaned up; `demo_contact_email` records who requested it,
-- used to reach out for follow-up/conversion.
-- Idempotent (IF NOT EXISTS) so it applies cleanly over any partial state.
-- Also adds a partial composite index on (is_demo, demo_expires_at): Task 3's
-- active-demo-cap check and Task 6's daily cleanup job both hot-path this
-- pair, and is_demo=true is expected to stay a small minority of rows once
-- real customers exist, so a partial index keeps it cheap to maintain.
-- Date: 2026-07-13

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS demo_contact_email VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS idx_clients_demo_expiry ON clients(is_demo, demo_expires_at) WHERE is_demo = true;
