-- 044_leave_half_day_units.sql
-- ONB.2 (design spec 2026-09-12): supports half-day (0.5) Ferie requests and
-- decimal balances imported from a prior payroll system. Order below is
-- mandatory — Postgres refuses ALTER COLUMN TYPE on a column a GENERATED
-- ALWAYS expression depends on, so remaining_days must be dropped first and
-- recreated last.

ALTER TABLE leave_saldi DROP COLUMN remaining_days;

ALTER TABLE leave_saldi ALTER COLUMN total_days TYPE NUMERIC(6,2);
ALTER TABLE leave_saldi ALTER COLUMN used_days TYPE NUMERIC(6,2);

ALTER TABLE leave_saldi
  ADD COLUMN remaining_days NUMERIC(6,2) GENERATED ALWAYS AS (total_days - used_days) STORED;

ALTER TABLE leave_requests ALTER COLUMN num_days TYPE NUMERIC(6,2);
