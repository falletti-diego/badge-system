-- Migration 006: Add authentication fields to employees
-- Required for DB-backed login (replacing mock DEMO_USERS for real customers)
--
-- Adds:
--   password_hash  — bcrypt hash (cost 12) for employee login
--   role           — employee | manager | admin
--   site_id        — primary managed site (for managers only)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'employee'
    CHECK (role IN ('employee', 'manager', 'admin')),
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role);
