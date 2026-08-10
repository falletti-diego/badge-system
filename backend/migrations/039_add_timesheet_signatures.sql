-- 039_add_timesheet_signatures.sql
-- Firma digitale cartellino mensile (2026-08-10): il dipendente approva
-- esplicitamente le ore del mese, snapshot immutabile al momento della firma
-- (non ricalcolato retroattivamente se utils/hours.js cambia in futuro —
-- una firma deve rappresentare esattamente cosa il dipendente ha visto,
-- altrimenti perde valore probatorio). UNIQUE (employee_id, month, year)
-- serve sia da vincolo di idempotenza (upsert su doppio click) sia da
-- indice per il lookup più comune.
CREATE TABLE IF NOT EXISTS timesheet_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  status TEXT NOT NULL DEFAULT 'signed' CHECK (status IN ('signed', 'invalidated')),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ,
  ore_totali NUMERIC(6,2) NOT NULL,
  ore_ordinarie NUMERIC(6,2) NOT NULL,
  ore_straordinarie NUMERIC(6,2) NOT NULL,
  giorni_presenti INT NOT NULL,
  buoni_pasto INT NOT NULL,
  UNIQUE (employee_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_timesheet_signatures_client_period ON timesheet_signatures(client_id, year, month);
