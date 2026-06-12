-- Migration 015: Add must_change_password flag to employees
-- Purpose: Force password change on first login for imported employees
-- Date: 2026-06-12

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_employees_must_change_password ON employees(must_change_password);
