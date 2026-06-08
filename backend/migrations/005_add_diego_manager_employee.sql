-- Migration 005: Add Diego as employee record so manager can also check in
-- Diego is manager of Torino Store and needs an employee_id for QR check-in

INSERT INTO employees (id, client_id, email, name, phone, assigned_sites, created_at, updated_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440200',
  '550e8400-e29b-41d4-a716-446655440001',  -- Dataxiom MVP client
  'diego@badge.local',
  'Diego',
  NULL,
  ARRAY['550e8400-e29b-41d4-a716-446655440012'::uuid],  -- Torino Store
  NOW(),
  NOW()
)
ON CONFLICT (client_id, email) DO NOTHING;
