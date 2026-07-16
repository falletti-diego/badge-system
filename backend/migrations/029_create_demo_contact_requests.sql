-- Migration 029: Create demo_contact_requests table
-- Purpose: Capture "contact us" messages submitted from within a self-service
-- demo tenant (Ambiente Demo Self-Service). Cascades on client delete so the
-- request is cleaned up automatically when the demo tenant is torn down.
-- Idempotent (IF NOT EXISTS) so it applies cleanly over any partial state.
-- Date: 2026-07-13

CREATE TABLE IF NOT EXISTS demo_contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_contact_requests_client_id ON demo_contact_requests(client_id);
