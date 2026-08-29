-- 042_add_role_hierarchy.sql
-- Gerarchia ruoli scalabile: aggiunge senior_manager/director e una colonna
-- reports_to_id self-referenziante per la catena di approvazione delle
-- richieste personali (ferie/malattia/correzione cartellino) di manager e
-- senior manager. Additiva al 100%: nessuna riga esistente cambia role o
-- guadagna un reports_to_id non-NULL da questa migrazione — un client a 2
-- livelli (solo employee/manager/admin) continua a funzionare identico a
-- oggi. Vedi docs/superpowers/specs/2026-08-29-role-hierarchy-design.md.
--
-- reports_to_id è deliberatamente una colonna NUOVA e non un riuso di
-- manager_id (migration 040): manager_id ha oggi una semantica precisa e
-- validata (il manager della sede di un employee, richiesto per ogni
-- employee, mai per un manager) usata anche dal CSV import
-- (services/employeeSync/*). reports_to_id è concettualmente diverso — chi
-- approva le richieste personali di un manager/senior_manager — non è
-- scoped a una sede e non è mai obbligatorio. Vedi la sezione "Perché non
-- riusare manager_id" nella design spec collegata sopra.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'manager', 'senior_manager', 'director', 'admin', 'viewer', 'superadmin'));

ALTER TABLE employees ADD COLUMN IF NOT EXISTS reports_to_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_reports_to_id ON employees(reports_to_id);
