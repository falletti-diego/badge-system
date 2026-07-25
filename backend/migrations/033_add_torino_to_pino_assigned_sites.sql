-- Migration 033: Add Torino Store to Pino's assigned_sites
-- Pino's employees row (migration 018) was created without assigned_sites
-- (defaults to '{}'), and migration 025 only updated site_id when moving him
-- to Torino to manage Maria — assigned_sites was never touched. POST
-- /checkins requires site_id = ANY(assigned_sites), so Pino could never
-- actually check in via QR at Torino despite site_id being correct
-- (found while testing Task B6 Offline Mode, Section 7 — shared device).

UPDATE employees
SET assigned_sites = array_append(assigned_sites, '550e8400-e29b-41d4-a716-446655440012'::uuid)
WHERE id = '550e8400-e29b-41d4-a716-446655440011'
  AND NOT ('550e8400-e29b-41d4-a716-446655440012'::uuid = ANY(assigned_sites));
-- Idempotent: only appends if not already present
