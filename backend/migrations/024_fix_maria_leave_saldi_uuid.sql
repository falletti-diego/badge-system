-- Migration 024: Fix wrong user_id in leave_saldi for Maria Rossi
-- 019b_seed_demo_leave_saldi.sql used '84ab2a73-aedd-4514-b9d4-4496a968e409'
-- (a stale UUID) instead of Maria's real employee ID from the employees table.
-- The /leave/balance endpoint queries WHERE user_id = req.user.user_id which
-- is the real employee ID, so balance always returned empty for Maria.

DO $$
DECLARE
  wrong_uuid  UUID := '84ab2a73-aedd-4514-b9d4-4496a968e409';
  correct_uuid UUID := '239ec99f-3204-45ca-bce2-793f52442ec6';
  client_uuid  UUID := '550e8400-e29b-41d4-a716-446655440001';
BEGIN
  -- Remove rows seeded with the wrong UUID (idempotent)
  DELETE FROM leave_saldi
  WHERE user_id = wrong_uuid;

  -- Insert correct rows (idempotent via ON CONFLICT DO NOTHING)
  INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days)
  VALUES
    (client_uuid, correct_uuid, 'FERIE_1', 2026, 20),
    (client_uuid, correct_uuid, 'FERIE_2', 2026,  8),
    (client_uuid, correct_uuid, 'FERIE_3', 2026,  4)
  ON CONFLICT (user_id, leave_type, year) DO NOTHING;
END $$;
