-- Migration 021: Create illnesses table (Malattia)
-- Source: src/db/schema.sql (illnesses was added there but never in the runner's
-- migrations/ dir, so prod RDS never got it → illness routes 500'd).
-- Idempotent so it applies cleanly over any partial state.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS illnesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  num_days INT NOT NULL,

  reason VARCHAR(500),
  certificate_url VARCHAR(500),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,

  -- cancelled_by has no FK on purpose: an admin (not an employee) may cancel.
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancelled_by UUID,
  cancellation_reason VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_illnesses_employee_id ON illnesses(employee_id);
CREATE INDEX IF NOT EXISTS idx_illnesses_client_id ON illnesses(client_id);
CREATE INDEX IF NOT EXISTS idx_illnesses_date_range ON illnesses(start_date, end_date);
