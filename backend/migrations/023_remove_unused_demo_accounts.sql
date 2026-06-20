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
--
-- Strategy: child tables with ON DELETE CASCADE are handled automatically.
-- The only exception is checkins.created_by which is ON DELETE RESTRICT —
-- we reassign those to the checkin's own employee_id before deleting.

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
  -- checkins.created_by is ON DELETE RESTRICT (NOT NULL).
  -- For any checkin owned by a non-removed employee but "created by" a removed one
  -- (e.g. manager Diego creating a checkin for Maria), reassign created_by to the
  -- checkin's own employee_id so the RESTRICT constraint is not triggered.
  UPDATE checkins
  SET created_by = employee_id
  WHERE created_by = ANY(removed_ids)
    AND employee_id != ALL(removed_ids);

  -- Delete the employees. All child tables use ON DELETE CASCADE so they
  -- are cleaned up automatically: checkins, notifications, illnesses,
  -- leave_requests, leave_saldi, used_tokens, revoked_tokens.
  DELETE FROM employees WHERE id = ANY(removed_ids);

  RAISE NOTICE 'Migration 023: removed % employee IDs and cascaded all associated data', array_length(removed_ids, 1);
END $$;
