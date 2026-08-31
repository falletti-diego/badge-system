-- 043_create_device_push_tokens.sql
-- Push notifications (design spec 2026-08-30, decisione 7): un dipendente
-- può avere più device registrati; il token identifica univocamente un
-- device Expo — un cambio di proprietario del device fa upsert sulla stessa
-- riga (vedi POST /api/notifications/push-token, backend/src/routes/notifications.js).

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_employee_id ON device_push_tokens(employee_id);
