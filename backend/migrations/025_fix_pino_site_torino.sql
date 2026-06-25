-- Migration 025: Move Pino (manager) to Torino Store so he manages Maria Rossi
-- Previously Pino had site_id = '550e8400-e29b-41d4-a716-446655440011' (Roma Store)
-- but Maria works at Torino Store ('...0012'). The /leave/pending filter
-- WHERE e.site_id = manager.site_id meant Pino never saw Maria's leave requests.

UPDATE employees
SET site_id = '550e8400-e29b-41d4-a716-446655440012'
WHERE id = '550e8400-e29b-41d4-a716-446655440011'
  AND site_id = '550e8400-e29b-41d4-a716-446655440011';
-- Idempotent: only updates if still pointing to the old site
