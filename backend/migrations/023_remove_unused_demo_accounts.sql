-- Migration 023: Remove unused demo/test accounts
--
-- Accounts removed:
--   diego@badge.local  — redundant second manager (two DB records: migration 005 + 018)
--   luca.verdi@employee.it  — never used in frontend
--   alice.neri@employee.it  — never used in frontend
--   carlo.rossi@employee.it — never used in frontend
--   paolo.sordo@employee.it — never used in frontend
--
-- After this migration, only 3 accounts exist for testing:
--   pippo@badge.local (admin)    — web
--   pino@badge.local  (manager)  — web + app
--   maria@badge.local (employee) — web + app

DO $$
DECLARE
  removed_ids UUID[] := ARRAY[
    '550e8400-e29b-41d4-a716-446655440200'::uuid,  -- diego (migration 005)
    '550e8400-e29b-41d4-a716-446655440020'::uuid,  -- diego (migration 018 duplicate)
    '550e8400-e29b-41d4-a716-446655440102'::uuid,  -- luca.verdi@employee.it
    '550e8400-e29b-41d4-a716-446655440103'::uuid,  -- alice.neri@employee.it
    '550e8400-e29b-41d4-a716-446655440104'::uuid,  -- carlo.rossi@employee.it
    '550e8400-e29b-41d4-a716-446655440116'::uuid   -- paolo.sordo@employee.it
  ];
BEGIN
  -- Child tables first (FK order)
  DELETE FROM notifications      WHERE employee_id = ANY(removed_ids);
  DELETE FROM illnesses          WHERE employee_id = ANY(removed_ids);
  DELETE FROM leave_requests     WHERE user_id     = ANY(removed_ids);
  DELETE FROM leave_saldi        WHERE user_id     = ANY(removed_ids);
  DELETE FROM shifts             WHERE employee_id = ANY(removed_ids);
  DELETE FROM checkins           WHERE employee_id = ANY(removed_ids);
  DELETE FROM used_tokens        WHERE user_id     = ANY(removed_ids);
  DELETE FROM revoked_tokens     WHERE user_id     = ANY(removed_ids);

  -- Parent
  DELETE FROM employees WHERE id = ANY(removed_ids);

  RAISE NOTICE 'Migration 023: removed % employee IDs and all associated data', array_length(removed_ids, 1);
END $$;
