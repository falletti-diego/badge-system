-- 038_enforce_site_id_in_assigned_sites.sql
-- Bug (6 Agosto 2026, scoperto durante verifica manuale staging Fase A):
-- alcune migration storiche (018, 019a) valorizzano employees.site_id senza
-- mai toccare assigned_sites (resta al default schema '{}'). POST /checkins
-- autorizza SOLO tramite `site_id = ANY(assigned_sites)` — site_id da solo
-- non basta. Stessa causa già colpita in produzione una volta (Pino,
-- migration 033, patch one-off che ha risolto solo la sua riga).
--
-- Verificato (sola lettura, 6/8/2026): 1 riga rotta in produzione
-- (maria@badge.local, dal 19/06/2026), 2 su staging. Nessun cliente reale
-- coinvolto.
--
-- Fix in due parti:
-- 1) Backfill generale (non specifico a nessun UUID) per le righe già rotte.
-- 2) Trigger che mantiene l'invariante per ogni futuro INSERT/UPDATE su
--    employees, indipendentemente da quale codice applicativo scrive —
--    additivo, non rimuove mai siti già presenti in assigned_sites (un
--    dipendente multi-sede resta multi-sede).

-- Parte 1: backfill
-- NOTA (code review): assigned_sites non ha vincolo NOT NULL nello schema
-- (default ARRAY[]::UUID[], ma righe legacy possono comunque avere NULL).
-- Sotto three-valued logic di Postgres, `x = ANY(NULL)` valuta a NULL, e
-- `NOT NULL` è a sua volta NULL (falsy) — quindi senza COALESCE le righe
-- con assigned_sites IS NULL verrebbero silenziosamente saltate sia dal
-- backfill che dal trigger sottostante, restando rotte per sempre.
UPDATE employees
SET assigned_sites = array_append(COALESCE(assigned_sites, ARRAY[]::UUID[]), site_id)
WHERE site_id IS NOT NULL
  AND NOT (site_id = ANY(COALESCE(assigned_sites, ARRAY[]::UUID[])));

-- Parte 2: trigger
CREATE OR REPLACE FUNCTION ensure_site_id_in_assigned_sites()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.site_id IS NOT NULL AND NOT (NEW.site_id = ANY(COALESCE(NEW.assigned_sites, ARRAY[]::UUID[]))) THEN
    NEW.assigned_sites := array_append(COALESCE(NEW.assigned_sites, ARRAY[]::UUID[]), NEW.site_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_site_id_in_assigned_sites ON employees;
CREATE TRIGGER trg_ensure_site_id_in_assigned_sites
  BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION ensure_site_id_in_assigned_sites();
