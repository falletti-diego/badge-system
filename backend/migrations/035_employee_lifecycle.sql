-- Migration 035: Employee lifecycle fields (active, hiring_date, exit_date)
-- Part of employee-sync-wizard feature.

ALTER TABLE employees
  ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN hiring_date DATE,
  ADD COLUMN exit_date DATE;

-- Backfill dipendenti esistenti: hiring_date approssimata a created_at
-- (non è la vera data di assunzione - il cliente potrà correggerla ricaricando
-- il wizard con la colonna "Data Assunzione" modificata per quella riga).
UPDATE employees SET hiring_date = created_at::date WHERE hiring_date IS NULL;

CREATE INDEX idx_employees_active ON employees(client_id, active);
