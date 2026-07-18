-- Migration 026: Seed full leave allocation for all employees and managers (2026)
-- Sets FERIE_1=20, FERIE_2=8, FERIE_3=4 for all non-admin users.
-- Resets used_days=0 so remaining_days equals the full allocation.
-- Idempotent: ON CONFLICT DO UPDATE.
--
-- Resilient-on-fresh-DBs rewrite (2026-07-17, code-review-fixes Task 12):
-- most of the UUIDs below were created by hand in production via a CSV
-- concierge import and were never versioned anywhere in this repo (they are
-- NOT the same people as any similarly-named demo employee that IS in the
-- repo — e.g. "Andrea Conti"/"Luca Verdi" here are a different dataset with
-- different UUIDs). On a fresh database (a laptop, or CI's ephemeral
-- Postgres container) none of these rows exist in `employees`, so the
-- original per-uid INSERT loop hit `leave_saldi_user_id_fkey` and aborted
-- the whole migration run partway through.
--
-- run-migrations.js only tracks "already applied" by filename (see
-- getAppliedMigrations() — SELECT filename FROM schema_migrations; the
-- checksum column is never populated/compared), so production — where this
-- migration already ran successfully against the real roster and is already
-- recorded in schema_migrations — will NEVER re-execute this file. Changing
-- its body is therefore safe: it only changes behavior on databases that
-- have not applied 026 yet (fresh CI/dev databases).
--
-- Fix: seed only the users that actually exist in `employees` on whatever
-- database this runs against, via SELECT ... FROM (VALUES ...) JOIN
-- employees, instead of assuming the full historical roster is present.

INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days, used_days)
SELECT v.client_id, v.user_id, v.leave_type, v.year, v.total_days, 0
FROM (
  VALUES
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '550e8400-e29b-41d4-a716-446655440011'::uuid, 'FERIE_1', 2026, 20), -- Pino (manager)
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '550e8400-e29b-41d4-a716-446655440011'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '550e8400-e29b-41d4-a716-446655440011'::uuid, 'FERIE_3', 2026,  4),

    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '84ab2a73-aedd-4514-b9d4-4496a968e409'::uuid, 'FERIE_1', 2026, 20), -- Maria (employee)
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '84ab2a73-aedd-4514-b9d4-4496a968e409'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '84ab2a73-aedd-4514-b9d4-4496a968e409'::uuid, 'FERIE_3', 2026,  4),

    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '18b78806-e78c-413f-a631-2d91cd43978c'::uuid, 'FERIE_1', 2026, 20), -- Andrea Conti
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '18b78806-e78c-413f-a631-2d91cd43978c'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '18b78806-e78c-413f-a631-2d91cd43978c'::uuid, 'FERIE_3', 2026,  4),

    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '239ec99f-3204-45ca-bce2-793f52442ec6'::uuid, 'FERIE_1', 2026, 20), -- Maria Rossi
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '239ec99f-3204-45ca-bce2-793f52442ec6'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '239ec99f-3204-45ca-bce2-793f52442ec6'::uuid, 'FERIE_3', 2026,  4),

    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '1291d79e-2280-442f-81dc-ac1112e6f5cf'::uuid, 'FERIE_1', 2026, 20), -- Francesca Gallo (manager)
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '1291d79e-2280-442f-81dc-ac1112e6f5cf'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '1291d79e-2280-442f-81dc-ac1112e6f5cf'::uuid, 'FERIE_3', 2026,  4),

    ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'd32f100b-38f8-4c2a-a9b4-c837d6fe4459'::uuid, 'FERIE_1', 2026, 20), -- Marco Ferrari
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'd32f100b-38f8-4c2a-a9b4-c837d6fe4459'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'd32f100b-38f8-4c2a-a9b4-c837d6fe4459'::uuid, 'FERIE_3', 2026,  4),

    ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'a7552cfa-79c5-4cd9-a2ac-00130ec83aa6'::uuid, 'FERIE_1', 2026, 20), -- Thomas Weber
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'a7552cfa-79c5-4cd9-a2ac-00130ec83aa6'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'a7552cfa-79c5-4cd9-a2ac-00130ec83aa6'::uuid, 'FERIE_3', 2026,  4),

    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '5159059d-2ee0-4548-944f-10997825eb47'::uuid, 'FERIE_1', 2026, 20), -- Giulia Rizzo
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '5159059d-2ee0-4548-944f-10997825eb47'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '5159059d-2ee0-4548-944f-10997825eb47'::uuid, 'FERIE_3', 2026,  4),

    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '6e5bb89d-5dc3-4988-8a14-4a16122e8e66'::uuid, 'FERIE_1', 2026, 20), -- Luca Verdi (manager)
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '6e5bb89d-5dc3-4988-8a14-4a16122e8e66'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '6e5bb89d-5dc3-4988-8a14-4a16122e8e66'::uuid, 'FERIE_3', 2026,  4),

    ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'd1fd0017-0133-4207-ba9d-416ddd425eb3'::uuid, 'FERIE_1', 2026, 20), -- Valentina Russo
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'd1fd0017-0133-4207-ba9d-416ddd425eb3'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'd1fd0017-0133-4207-ba9d-416ddd425eb3'::uuid, 'FERIE_3', 2026,  4),

    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '2e1c9a6a-13c1-454f-a232-cc5a6537598e'::uuid, 'FERIE_1', 2026, 20), -- Giovanni Bianchi
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '2e1c9a6a-13c1-454f-a232-cc5a6537598e'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '2e1c9a6a-13c1-454f-a232-cc5a6537598e'::uuid, 'FERIE_3', 2026,  4),

    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '35e2c96b-9a18-45f6-8069-e72cd6e79424'::uuid, 'FERIE_1', 2026, 20), -- Sofia Moretti
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '35e2c96b-9a18-45f6-8069-e72cd6e79424'::uuid, 'FERIE_2', 2026,  8),
    ('550e8400-e29b-41d4-a716-446655440001'::uuid, '35e2c96b-9a18-45f6-8069-e72cd6e79424'::uuid, 'FERIE_3', 2026,  4)
) AS v(client_id, user_id, leave_type, year, total_days)
JOIN employees e ON e.id = v.user_id
ON CONFLICT (user_id, leave_type, year)
DO UPDATE SET total_days = EXCLUDED.total_days, used_days = 0, updated_at = NOW();
