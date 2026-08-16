-- 040_add_manager_id_to_employees.sql
-- Manager di riferimento: relazione self-referencing su employees, nullable.
-- ON DELETE SET NULL — se il manager viene rimosso, i dipendenti a lui
-- assegnati non devono essere bloccati, solo riassegnati in un secondo momento.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON employees(manager_id);
