# Migration legacy (root `migrations/`) — ARCHIVIATE 2026-11-15

File SQL di inizio giugno 2026, applicati **a mano** su RDS prima che esistesse
il migration runner. Archiviati qui per riferimento storico — **non vanno mai
ri-applicati**.

- `V001__initial_schema.sql` — schema iniziale, superseded da
  `backend/src/db/schema.sql` (il bootstrap autoritativo per un DB nuovo)
- `003`–`007` — patch e seed di giugno 2026, già incorporati in `schema.sql`
  o nelle migration ufficiali

La numerazione di questi file **non c'entra** con quella di
`backend/migrations/` (le due serie 003–007 hanno contenuti diversi).

**Fonte di verità attuale:** `backend/migrations/` (vedi il README lì) +
`backend/src/db/schema.sql` per il bootstrap.
