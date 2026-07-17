-- Migration 019a: Backfill maria.rossi@torino.it employee record
--
-- Problem discovered while wiring CI to a real (fresh) Postgres service container
-- (Task 12, CI real-Postgres): bootstrapping a brand-new database from
-- src/db/schema.sql + migrations/ fails at 019b_seed_demo_leave_saldi.sql with
--   "insert or update on table leave_saldi violates foreign key constraint
--    leave_saldi_user_id_fkey — Key (user_id)=(239ec99f-...) is not present
--    in table employees."
--
-- Root cause: employee id 239ec99f-3204-45ca-bce2-793f52442ec6 ("Maria Rossi",
-- the "real" planning employee referenced by DEMO_USERS in
-- src/__fixtures__/demo-users.js and by migrations 019b/022/024/026) was
-- created directly on the production RDS instance by hand at some point and
-- was never captured in a migration file — production has carried this row
-- for a long time, but no fresh database (a laptop, or CI's ephemeral
-- container) can reconstruct it from version control alone.
--
-- Idempotent: ON CONFLICT (id) DO NOTHING — a no-op against production
-- (and any existing dev DB) where the row already exists under this id.
INSERT INTO employees
  (id, client_id, email, name, role, site_id, password_hash, created_at)
VALUES
  (
    '239ec99f-3204-45ca-bce2-793f52442ec6', -- Maria Rossi ("real" planning employee, DEMO_USERS fixture)
    '550e8400-e29b-41d4-a716-446655440001', -- Client: Dataxiom
    'maria.rossi@torino.it',
    'Maria Rossi',
    'employee',
    '550e8400-e29b-41d4-a716-446655440012', -- Torino store
    NULL,
    NOW()
  )
ON CONFLICT (id) DO NOTHING;
