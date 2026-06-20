-- Migration 022: Merge maria@badge.local demo account into real employee record
-- Problem: Two Maria records exist:
--   84ab2a73-aedd-4514-b9d4-4496a968e409 — maria@badge.local (demo login account, used in leave_requests)
--   239ec99f-3204-45ca-bce2-793f52442ec6 — maria.rossi@torino.it (real employee visible in planning)
-- Leave requests used the demo id; planning uses the real id → isDateBlocked() never matched.
-- Fix: redirect all references from the demo id to the real employee id.

DO $$
DECLARE
  demo_id UUID := '84ab2a73-aedd-4514-b9d4-4496a968e409';
  real_id UUID := '239ec99f-3204-45ca-bce2-793f52442ec6';
BEGIN
  -- 1. Re-point leave_requests
  UPDATE leave_requests SET user_id = real_id WHERE user_id = demo_id;

  -- 2. Merge leave_saldi (insert real_id rows if they don't exist, else drop demo rows)
  --    For each (leave_type, year) pair under demo_id, upsert into real_id.
  INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days, used_days)
  SELECT client_id, real_id, leave_type, year, total_days, used_days
  FROM leave_saldi
  WHERE user_id = demo_id
  ON CONFLICT (user_id, leave_type, year) DO UPDATE
    SET used_days  = EXCLUDED.used_days,
        total_days = EXCLUDED.total_days;

  DELETE FROM leave_saldi WHERE user_id = demo_id;

  -- 3. Re-point illness records if any
  UPDATE illnesses SET employee_id = real_id WHERE employee_id = demo_id;

END $$;
