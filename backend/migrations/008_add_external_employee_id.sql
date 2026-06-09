-- Migration 008: Add external_employee_id to employees
-- Stores the client's internal employee code (e.g. EMP001, MAT-2024-042).
-- Unique per client — two different clients may reuse the same code.
-- Nullable: existing employees and DB-created employees without a code are unaffected.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS external_employee_id VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_external_id
  ON employees (client_id, external_employee_id)
  WHERE external_employee_id IS NOT NULL;
