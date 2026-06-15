-- Migration 012: Add employee consent tracking (GDPR Art. 7)
-- Purpose: Track explicit consent for GPS data collection
-- Date: 2026-06-11

-- Add gps_consent_given to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS gps_consent_given BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS gps_consent_given_at TIMESTAMP WITH TIME ZONE;

-- Create consent log table for audit trail
CREATE TABLE IF NOT EXISTS employee_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  consent_type VARCHAR(50) NOT NULL, -- 'gps', 'biometric', etc.
  consent_given BOOLEAN NOT NULL, -- true = accepted, false = declined/revoked
  dpa_version VARCHAR(10) DEFAULT '2.0', -- DPA version at time of consent
  privacy_policy_version VARCHAR(10) DEFAULT '2.0', -- Privacy Policy version at time of consent
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  user_agent TEXT, -- Device/app info (for mobile: app version, OS version)
  ip_address INET, -- IP from where consent was given (anonymize last octet)
  notes TEXT, -- Optional notes (e.g., "revoked by manager", "auto-accepted via legal requirement")
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_employee_consent_log_employee_id ON employee_consent_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_consent_log_client_id ON employee_consent_log(client_id);
CREATE INDEX IF NOT EXISTS idx_employee_consent_log_consent_type ON employee_consent_log(consent_type, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_consent_log_accepted_at ON employee_consent_log(accepted_at DESC);

-- Comments for documentation
COMMENT ON COLUMN employees.gps_consent_given IS 'GDPR Art. 7: true = explicit consent given for GPS data collection; false = no consent or revoked';
COMMENT ON COLUMN employees.gps_consent_given_at IS 'Timestamp when employee explicitly accepted GPS consent (from mobile dialog)';
COMMENT ON TABLE employee_consent_log IS 'Audit trail of all consent decisions for GDPR Art. 7 compliance; required for investigations and data subject requests';
