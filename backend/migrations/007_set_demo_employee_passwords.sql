-- Migration 007: Set bcrypt password hashes for seeded @employee.it demo accounts
--
-- These employees were seeded before migration 006 added password_hash, so their
-- password_hash is NULL and they cannot log in via the DB path.
--
-- After this migration, auth.js checks DB first. DEMO_USERS is restricted to
-- @badge.local (internal Dataxiom accounts only), eliminating the bypass risk.
--
-- Hashes generated with bcryptjs cost 12 (same as hashPassword() in auth/password.js).
-- Passwords: Luca1975 / Alice1975 / Carlo1975 / Paolo1975

UPDATE employees
SET password_hash = '$2b$12$xudj3ALGB6ppBRopwj7Oc.zttx5rDMsBkyclmOa7eaCOeQ5DsKJ5q'
WHERE id = '550e8400-e29b-41d4-a716-446655440102'  -- luca.verdi@employee.it
  AND password_hash IS NULL;

UPDATE employees
SET password_hash = '$2b$12$mdE0R02EHEnRDVBAAzf.S.G86gDSpt/n5scBxbd2nbO5m7M49CpcC'
WHERE id = '550e8400-e29b-41d4-a716-446655440103'  -- alice.neri@employee.it
  AND password_hash IS NULL;

UPDATE employees
SET password_hash = '$2b$12$I7Y3qr2hfQgryJMGapEEkel4CdQcyHMgA021tzHJa7hjQfUBpl9mi'
WHERE id = '550e8400-e29b-41d4-a716-446655440104'  -- carlo.rossi@employee.it
  AND password_hash IS NULL;

UPDATE employees
SET password_hash = '$2b$12$kv1ZuVcQ6hwLDRoj/tn0vewfLtjnVDUntpdktwNowJuQS6TScz1pe'
WHERE id = '550e8400-e29b-41d4-a716-446655440116'  -- paolo.sordo@employee.it
  AND password_hash IS NULL;
