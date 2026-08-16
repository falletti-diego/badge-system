-- 040_add_manager_id_to_employees.sql
-- Manager di riferimento: relazione self-referencing su employees, nullable.
-- ON DELETE SET NULL protegge solo dal caso raro/futuro di un HARD delete della
-- riga manager (DELETE FROM employees ...). Il flusso di offboarding manager
-- usato dall'app (DELETE /:id in routes/admin/employees.js) è invece un SOFT
-- delete (UPDATE employees SET active = false, exit_date = CURRENT_DATE ...):
-- nessuna riga viene mai eliminata, quindi ON DELETE SET NULL non scatta mai in
-- quel percorso. Oggi, disattivare un manager lascia il manager_id dei suoi
-- dipendenti puntato indefinitamente al manager ormai inattivo, senza
-- riassegnazione automatica — un chiamante che vuole liberare quei dipendenti
-- per la riassegnazione alla disattivazione deve gestirlo esplicitamente altrove.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON employees(manager_id);
