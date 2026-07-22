-- Migration 032: Offline mode — idempotency key + flag timbratura offline
--
-- Parte della Fase A del piano Offline Mode
-- (docs/superpowers/plans/2026-07-19-offline-mode.md). Additiva e
-- retrocompatibile: client_uuid è opzionale, is_offline ha default false,
-- nessuna riga esistente viene toccata.
--
-- client_uuid è la idempotency key generata dal client mobile per ogni
-- timbratura: permette al backend di deduplicare i retry di sync della coda
-- offline (stesso client_uuid → stessa riga, mai un duplicato). L'indice è
-- parziale (WHERE client_uuid IS NOT NULL) perché le timbrature online
-- esistenti/pre-app-aggiornata non hanno client_uuid.

ALTER TABLE checkins ADD COLUMN IF NOT EXISTS client_uuid UUID;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS is_offline BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_client_uuid
  ON checkins (client_uuid) WHERE client_uuid IS NOT NULL;
