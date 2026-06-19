-- Migration 018: Add @badge.local demo users to employees table
-- These are internal Dataxiom accounts (pippo, pino, diego, maria)
-- They can log in via DEMO_USERS in auth.js, but also need DB records
-- for endpoints that verify employee existence (illness, leaves, etc.)

-- 1. Pippo (admin) — optional in DB (admin role doesn't report illness/leaves)
INSERT INTO employees
  (id, client_id, email, name, role, site_id, password_hash, created_at)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440010', -- Pippo (admin) UUID
    '550e8400-e29b-41d4-a716-446655440001', -- Client: Dataxiom
    'pippo@badge.local',
    'Pippo',
    'admin',
    NULL, -- Admins don't have a site
    NULL, -- No DB password hash (login via DEMO_USERS)
    NOW()
  )
ON CONFLICT (client_id, email) DO NOTHING;

-- 2. Pino (manager Milano) — needs DB record for shift verification
INSERT INTO employees
  (id, client_id, email, name, role, site_id, password_hash, created_at)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440011', -- Pino (manager) UUID
    '550e8400-e29b-41d4-a716-446655440001', -- Client: Dataxiom
    'pino@badge.local',
    'Pino',
    'manager',
    '550e8400-e29b-41d4-a716-446655440011', -- Milano store
    NULL,
    NOW()
  )
ON CONFLICT (client_id, email) DO NOTHING;

-- 3. Diego (manager Torino) — needs DB record for shift verification
INSERT INTO employees
  (id, client_id, email, name, role, site_id, password_hash, created_at)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440020', -- Diego (manager) UUID
    '550e8400-e29b-41d4-a716-446655440001', -- Client: Dataxiom
    'diego@badge.local',
    'Diego',
    'manager',
    '550e8400-e29b-41d4-a716-446655440012', -- Torino store
    NULL,
    NOW()
  )
ON CONFLICT (client_id, email) DO NOTHING;

-- 4. Maria (employee) — needs DB record for illness/leave reporting
INSERT INTO employees
  (id, client_id, email, name, role, site_id, password_hash, created_at)
VALUES
  (
    '84ab2a73-aedd-4514-b9d4-4496a968e409', -- Maria (employee) UUID
    '550e8400-e29b-41d4-a716-446655440001', -- Client: Dataxiom
    'maria@badge.local',
    'Maria',
    'employee',
    '550e8400-e29b-41d4-a716-446655440012', -- Torino (default site)
    NULL,
    NOW()
  )
ON CONFLICT (client_id, email) DO NOTHING;
