# Migration database — UNICA directory autoritativa

Questa è l'unica directory di migration del progetto. Ogni file `*.sql` qui
dentro viene applicato in ordine alfabetico da `backend/scripts/run-migrations.js`
(`npm run migrations`), che tiene traccia dello stato nella tabella
`schema_migrations` (filename univoco + checksum): ogni file viene applicato
una sola volta, in transazione.

**Regole:**

- Numerazione progressiva a 3 cifre: il prossimo file prende il numero più
  alto esistente + 1 (es. `045_...sql`).
- ⚠️ Qualunque `*.sql` messo qui **verrà eseguito** al prossimo
  `npm run migrations` / deploy. Script one-off, seed manuali o bozze NON
  vanno qui (one-off storici: `docs/archive/`).
- Il bootstrap di un database nuovo (CI compresa) è `backend/src/db/schema.sql`,
  che crea le tabelle base; le migration qui coprono tutto il resto.
- Niente cast timezone-naive su colonne TIMESTAMPTZ: CI esegue
  `check-timestamptz-casts.js` anche su questa directory (CLAUDE.md Pattern 6).

**Storia:** fino al 2026-11-15 esistevano altre due directory di migration
(root `migrations/`, legacy pre-runner, ora in
`docs/archive/migrations-legacy-root/`; e `backend/src/migrations/`, una bozza
orfana mai applicata, rimossa).
