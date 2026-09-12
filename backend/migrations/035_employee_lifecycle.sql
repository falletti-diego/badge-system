-- Migration 035: Employee lifecycle fields (active, hiring_date, exit_date)
-- Part of employee-sync-wizard feature.
--
-- IF NOT EXISTS su ogni colonna/indice (7 Agosto 2026): schema.sql definisce
-- già questi campi nella CREATE TABLE employees per un'installazione da zero
-- (fonte di verità aggiornata quando questa migration è stata scritta) — il
-- job CI che fa bootstrap da schema.sql e POI riesegue tutte le migration
-- (incluse quelle storiche come questa) trovava quindi "column already
-- exists" ad ogni push, sempre e solo lì (mai in staging/produzione, il cui
-- storico si accumula via run-migrations.js, mai un bootstrap-da-zero seguito
-- dal replay completo nello stesso passo). Reso idempotente per coerenza con
-- le migration 036/037/038.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hiring_date DATE,
  ADD COLUMN IF NOT EXISTS exit_date DATE;

-- Backfill dipendenti esistenti: hiring_date approssimata a created_at
-- (non è la vera data di assunzione - il cliente potrà correggerla ricaricando
-- il wizard con la colonna "Data Assunzione" modificata per quella riga).
--
-- created_at è TIMESTAMPTZ; created_at::date valuterebbe la data nel timezone
-- di SESSIONE (UTC su AWS RDS di default), non Europe/Rome — durante la
-- finestra ~00:00-02:00 ora di Roma un dipendente creato "oggi" prenderebbe
-- silenziosamente "ieri" come hiring_date (CLAUDE.md Pattern 6, trovato
-- 2026-09-12 durante la progettazione del check CI dedicato).
UPDATE employees SET hiring_date = (created_at AT TIME ZONE 'Europe/Rome')::date WHERE hiring_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(client_id, active);
