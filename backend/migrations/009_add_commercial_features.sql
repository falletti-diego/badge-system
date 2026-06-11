-- Migration 009: Commercial Features (FASE 8 + FASE 9)
-- FASE 8: viewer role support for accountants (commercialisti)
-- FASE 9: meal_voucher_hours threshold per client

-- Add meal voucher threshold to clients (default 5h)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS meal_voucher_hours DECIMAL(4,2) DEFAULT 5.0;

-- Expand role check constraint to include 'viewer'
-- PostgreSQL auto-names inline CHECK constraints as {table}_{column}_check
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'manager', 'admin', 'viewer'));
