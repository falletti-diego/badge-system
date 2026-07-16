-- Migration 030: Add missing client_id column to checkins
--
-- NOT part of the Ambiente Demo Self-Service feature — this is a pre-existing
-- gap discovered while implementing Task 3 (POST /demo/start), which depends
-- on demoSeed.js (Task 2) inserting into checkins with a client_id column.
--
-- Root cause: commit b740dbf ("FASE 10 — Geofencing", 2026-06-11) started
-- writing `client_id` into every `INSERT INTO checkins` statement, and
-- src/utils/queryScope.js's buildScopedFilters() has treated
-- `checkins.client_id = $1` as the MANDATORY multi-tenant isolation filter
-- for every checkins/stats/export/presences query ever since (this is the
-- fail-closed RBAC guard referenced in S.32.1/S.32.2). No migration file
-- ever added the column — whatever database those code paths have been
-- running against in practice must have had it added out-of-band (manual
-- ALTER), which is exactly the kind of undocumented drift this migrations
-- directory exists to prevent.
--
-- This migration is a pure catch-up: idempotent (IF NOT EXISTS) so it is a
-- no-op on any database where the column already exists (e.g. production
-- RDS, if it already has it applied manually), and a real fix on any
-- database built from this migrations directory alone (e.g. a fresh local
-- or CI database), where the column has been silently missing.
--
-- IMPORTANT: this was found and fixed as a blocking dependency for Task 3's
-- testing, not verified against the actual production RDS instance. Confirm
-- `\d checkins` on production before assuming this migration is a no-op there.
-- Date: 2026-07-14

ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

-- Backfill any existing rows (client_id is always derivable from employee_id).
UPDATE checkins c
SET client_id = e.client_id
FROM employees e
WHERE c.employee_id = e.id
  AND c.client_id IS NULL;

ALTER TABLE checkins
  ALTER COLUMN client_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkins_client_id ON checkins(client_id);
