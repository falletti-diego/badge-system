-- Migration 011: Add DPA acknowledgements table
-- Purpose: Track when clients accept the Data Processing Agreement (GDPR Art. 28)
-- Date: 2026-06-11

CREATE TABLE IF NOT EXISTS dpa_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  dpa_version VARCHAR(10) NOT NULL DEFAULT '2.0',
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  accepted_by TEXT NOT NULL, -- Name/title of signatory
  dpa_signature TEXT, -- Base64-encoded digital signature (optional, phase 2)
  notes TEXT, -- Any special notes or modifications
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES employees(id) ON DELETE SET NULL
);

-- Index for fast lookups by client
CREATE INDEX IF NOT EXISTS idx_dpa_acknowledgements_client_id ON dpa_acknowledgements(client_id);
CREATE INDEX IF NOT EXISTS idx_dpa_acknowledgements_accepted_at ON dpa_acknowledgements(accepted_at DESC);

-- Audit log entry for this table
-- (audit.js will handle insertions automatically via trigger or manual logAudit calls)
