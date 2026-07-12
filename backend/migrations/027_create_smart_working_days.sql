-- Migration 027: Create smart_working_days table
-- Purpose: Self-declared smart working days (no QR/site check-in, no manager approval).
-- Pattern mirrors `illnesses` (auto-confirmed, employee self-service) rather than `checkins`
-- (no physical site verification is applicable to remote work).
-- Date: 2026-07-12

CREATE TABLE IF NOT EXISTS smart_working_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_smart_working_employee_id ON smart_working_days(employee_id);
CREATE INDEX IF NOT EXISTS idx_smart_working_client_id ON smart_working_days(client_id);
