-- Migration 026: Seed full leave allocation for all employees and managers (2026)
-- Sets FERIE_1=20, FERIE_2=8, FERIE_3=4 for all non-admin users.
-- Resets used_days=0 so remaining_days equals the full allocation.
-- Idempotent: ON CONFLICT DO UPDATE.

DO $$
DECLARE
  client_uuid UUID := '550e8400-e29b-41d4-a716-446655440001';
  yr INT := 2026;
  users UUID[] := ARRAY[
    '550e8400-e29b-41d4-a716-446655440011', -- Pino (manager)
    '84ab2a73-aedd-4514-b9d4-4496a968e409', -- Maria (employee)
    '18b78806-e78c-413f-a631-2d91cd43978c', -- Andrea Conti
    '239ec99f-3204-45ca-bce2-793f52442ec6', -- Maria Rossi
    '1291d79e-2280-442f-81dc-ac1112e6f5cf', -- Francesca Gallo (manager)
    'd32f100b-38f8-4c2a-a9b4-c837d6fe4459', -- Marco Ferrari
    'a7552cfa-79c5-4cd9-a2ac-00130ec83aa6', -- Thomas Weber
    '5159059d-2ee0-4548-944f-10997825eb47', -- Giulia Rizzo
    '6e5bb89d-5dc3-4988-8a14-4a16122e8e66', -- Luca Verdi (manager)
    'd1fd0017-0133-4207-ba9d-416ddd425eb3', -- Valentina Russo
    '2e1c9a6a-13c1-454f-a232-cc5a6537598e', -- Giovanni Bianchi
    '35e2c96b-9a18-45f6-8069-e72cd6e79424'  -- Sofia Moretti
  ];
  uid UUID;
BEGIN
  FOREACH uid IN ARRAY users LOOP
    INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days, used_days)
    VALUES
      (client_uuid, uid, 'FERIE_1', yr, 20, 0),
      (client_uuid, uid, 'FERIE_2', yr,  8, 0),
      (client_uuid, uid, 'FERIE_3', yr,  4, 0)
    ON CONFLICT (user_id, leave_type, year)
    DO UPDATE SET total_days = EXCLUDED.total_days, used_days = 0, updated_at = NOW();
  END LOOP;
END $$;
