-- 037_add_client_id_to_audit_log.sql
-- Finding #6 (2026-08-02): audit_log non aveva colonna tenant — un futuro
-- endpoint di audit-log admin (scope MVP, CLAUDE.md) rischierebbe un leak
-- cross-tenant silenzioso con una query naive. Nessun backfill delle righe
-- storiche (non derivabile in modo affidabile senza join per tipo entità):
-- restano NULL, accettabile perché il rischio riguarda i log futuri.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS client_id UUID;
CREATE INDEX IF NOT EXISTS idx_audit_log_client_id_timestamp ON audit_log (client_id, timestamp);
