-- Migration 002: Add correction fields to checkins table
-- Date: 2026-06-05
-- Adds: correction_note (text), modified_by_name (text) for corrections page (FASE 3.4)

BEGIN;

-- Add correction_note column (nullable — only populated when a correction is made)
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS correction_note TEXT;

-- Add modified_by_name column (nullable — stores display name of the corrector)
-- Using TEXT instead of UUID since managers are not in the employees table
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS modified_by_name TEXT;

COMMIT;
