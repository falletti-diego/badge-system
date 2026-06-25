-- Migration 019: Seed demo user leave saldi for 2026
-- Provides Maria, Diego, and other demo users with leave balance for testing

-- Demo users and their leave balance for 2026
-- Client: 550e8400-e29b-41d4-a716-446655440001 (Dataxiom)

-- Maria Rossi (employee) — full allocation
-- UUID must match employees.id for Maria (verified against DEMO_USERS fixture)
INSERT INTO leave_saldi
  (client_id, user_id, leave_type, year, total_days)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', '239ec99f-3204-45ca-bce2-793f52442ec6', 'FERIE_1', 2026, 20),
  ('550e8400-e29b-41d4-a716-446655440001', '239ec99f-3204-45ca-bce2-793f52442ec6', 'FERIE_2', 2026, 8),
  ('550e8400-e29b-41d4-a716-446655440001', '239ec99f-3204-45ca-bce2-793f52442ec6', 'FERIE_3', 2026, 4)
ON CONFLICT (user_id, leave_type, year) DO NOTHING;
