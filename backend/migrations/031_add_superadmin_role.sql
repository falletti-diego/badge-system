-- Migration 031: Add 'superadmin' role for Dataxiom staff cross-tenant onboarding
--
-- Part of the RBAC cross-tenant scoping fix (see
-- docs/superpowers/specs/2026-07-16-admin-rbac-tenant-scoping-design.md).
-- Additive only — existing 'employee'/'manager'/'admin'/'viewer' rows and
-- behavior are entirely unaffected by this migration alone.
--
-- Phase 1 of a deliberate 2-phase rollout: this migration and the code that
-- recognizes 'superadmin' (Task 2) ship together with ZERO change to
-- existing 'admin' behavior on any route. Restricting 'admin' to its own
-- client_id happens in a later, separate deploy (Task 4-7), only after the
-- real Dataxiom back-office account(s) have been promoted to 'superadmin'
-- in production (manual step, Task 3) — promoting an account to
-- 'superadmin' BEFORE this migration + Task 2 are deployed would lock that
-- account out of all of /api/admin/* (the current gate only recognizes
-- 'admin'), so migration ordering matters.

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'manager', 'admin', 'viewer', 'superadmin'));
