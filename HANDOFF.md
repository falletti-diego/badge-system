# Badge System — Session 78 Handoff

**Date:** 2026-07-22
**Session:** 78 — lancio landing+LinkedIn completato; Fase A del piano Offline Mode (backend) implementata, code-reviewata e **DEPLOYATA LIVE in produzione**
**Status:** ✅ **Lancio completo. Offline Mode Fase A live e verificata.** Prossimo step: Fase B (mobile), non ancora iniziata.

---

## Goal

1. Collegare la landing aziendale dataxiom.it a Badge System (pagina prodotto dedicata) e lanciare l'annuncio LinkedIn — ereditato dalla Session 77b, completato in questa sessione.
2. Implementare la Fase A (backend) del piano Offline Mode: timbrature IN/OUT che funzionano senza rete, con timestamp fedele, zero duplicati, badge "offline" visibile al manager.

---

## Current Progress

### 1. Lancio landing + LinkedIn — ✅ COMPLETO

- Verificato lo stato reale prima di agire: i commit di Session 77b erano pushati su GitHub ma il deploy Netlify non era mai partito (nonostante fosse "previsto per il giorno dopo").
- Deploy eseguito (`netlify deploy --prod`, sito `dataxiom` — id `a31a2216-fb06-47e0-b632-a1193a88039a`, verificato con `netlify status` prima di procedere per non toccare per errore il sito `dataxiom-badge`).
- Verificato live: `dataxiom.it/badge-system.html` → 200, title corretto, nav+card home, hero, tema condiviso, funnel demo (`badge.dataxiom.it/prova-demo`) invariato.
- Post LinkedIn (Variante A + carosello 7 slide) pubblicato dall'utente sulla Company Page — confermato manualmente (nessun tool MCP LinkedIn disponibile in questo ambiente per farlo direttamente).

### 2. Piano Offline Mode — scritto e committato

`/superpowers:writing-plans` + `/grilling` (decisioni: perimetro = timbrature+consultazione read-only; anti-frode = finestra 48h + badge "offline" visibile, non hash-chain "sigillato"; UX = successo garantito con contatore coda; rollout = piano ora, esecuzione dopo il lancio). Piano respinto una prima volta in Plan Mode per mancanza di step di verifica/test — corretto aggiungendoli a ogni task e a ogni gate. Salvato in `docs/superpowers/plans/2026-07-19-offline-mode.md`, commit `1af3e37`.

### 3. Offline Mode — Fase A (backend) — ✅ COMPLETA e LIVE

Eseguita con `/superpowers:test-driven-development` + `/superpowers:executing-plans` (skill esplicitamente richieste dall'utente, non `subagent-driven-development` nonostante suggerito dalla skill stessa).

- **A1** — migration `032_add_offline_checkin_fields.sql` (`client_uuid`, `is_offline`, indice UNIQUE). Deviazioni dal piano: directory reale è `backend/migrations/` (non `backend/src/db/migrations/`), numero `032` non `031` (già occupato). `schema.sql` **deliberatamente non toccato** — il bootstrap CI applica `schema.sql` + tutte le migration in sequenza (`scripts/run-migrations.js`), duplicare le colonne sarebbe stato ridondante, coerente con la convenzione già stabilita dalla migration 030.
- **A2** — schema Zod: `occurred_at` (finestra anti-frode 48h/+5min), `client_uuid`.
- **A3** — route `POST /api/checkins`: dedup idempotente.
- **A4** — dashboard: Chip MUI "Offline" in `PresencesTable`, `GET /api/v1/checkins` estesa con `is_offline`.
- **`/test-all`**: 608/608 backend, 239/240 frontend (1 skip pre-esistente).
- **`/code-review`** (medium effort, 8 finder-agent + verifica): **1 bug CRITICO trovato e confermato empiricamente contro Postgres reale** (non solo per ispezione) — vedi "What Didn't Work" sotto. Corretto, commit `f89b933`.
- **Deploy produzione**: migration applicata su RDS (via EC2 — RDS non raggiungibile direttamente dal locale, security group VPC-only), push su `main` → pipeline CI/CD standard verificata verde.
- **Vulnerabilità trovata da un security review automatico POST-PUSH** (durante lo smoke test, quando il codice vulnerabile era già live per alcuni minuti): `is_offline` fidato dal client. Corretto con TDD e ri-deployato entro pochi minuti, commit `5067e01`.
- **Smoke test live (4/4)** eseguito su un tenant demo self-service isolato (creato via `/api/v1/demo/start`, ripulito con `DELETE FROM clients` a fine test — nessun dato cliente reale toccato): retrocompatibilità ✓, `occurred_at` rispettato nel DB (non `NOW()`) ✓, dedup (`200 deduplicated:true`, nessuna riga doppia) ✓, finestra 48h rifiutata (`400 OFFLINE_TIMESTAMP_OUT_OF_WINDOW`) ✓.
- **Badge Offline**: verificato a livello di contratto dati (`GET /api/v1/checkins` espone `is_offline:true` correttamente sul record atteso, `false` su tutti gli altri) — **non verificato visivamente in un browser reale** (nessun tool di rendering browser disponibile in questa sessione).

Commit range Fase A: `a344dee` → `451a7cd` (7 commit, tutti pushati e deployati).

---

## What Worked

- **Verificare lo stato reale prima di agire**, sia per il deploy landing (git log + curl live, non fidarsi di "domani era previsto") sia per le credenziali RDS (testate da EC2 prima di assumerle valide dalla memoria).
- **`/test-all` + `/code-review` come gate obbligatorio prima del commit finale** (istruzione esplicita dell'utente): il code-review ha trovato un bug critico che i test con mock non potevano vedere.
- **Riprodurre un bug sospetto contro l'infrastruttura reale prima di dichiararlo risolto** (script Node diretto contro Postgres reale per il bug 25P02, poi contro `api.dataxiom.it` per il fix finale) — non fidarsi della sola teoria/lettura del codice.
- **Usare un tenant demo self-service per lo smoke test di produzione** invece di toccare dati reali o inventare fixture — creato e ripulito in modo pulito, cascata FK verificata.
- **Documentare le deviazioni dal piano nel piano stesso** (numero migration, directory, schema.sql non toccato, redesign ON CONFLICT) invece di lasciarle solo nei commit — il prossimo che legge il piano capisce cosa è cambiato e perché.

## What Didn't Work (lezioni)

- **Il design iniziale "SELECT dedup + INSERT + catch(23505) + re-SELECT" era rotto**: dopo un'eccezione 23505, Postgres marca la transazione come *aborted* — qualunque query successiva sullo stesso client (inclusa la SELECT di recovery) fallisce con `25P02`. Il mock dei test (funzione JS pura) non ha stato di transazione reale, quindi non lo rilevava: **9/9 test verdi su un design rotto**. Il fix corretto (`INSERT ... ON CONFLICT DO NOTHING RETURNING`) non lancia mai eccezioni — architetturalmente più semplice E corretto, non solo una patch. **Lezione**: quando un mock deve simulare comportamento transazionale di Postgres (stato aborted, SAVEPOINT), un test verde non è sufficiente garanzia — va riprodotto contro un DB reale prima di fidarsi.
- **Un fix di sicurezza trovato dopo un push in produzione richiede correzione e ri-deploy immediati**, non un rimando a fine sessione — il codice vulnerabile (`is_offline` fidato dal client) è rimasto live per alcuni minuti prima di essere corretto.
- **`npm run migrations` in `backend/package.json` puntava a un file inesistente** (`src/db/migrations.js`) — script rotto, mai notato perché in pratica si usa sempre `scripts/run-migrations.js` (il runner reale, usato anche in CI). **Corretto** prima di iniziare la Fase B (verificato con una run reale contro il DB di test locale).

---

## Next Steps

1. **Offline Mode — Fase B (mobile)**: coda offline (`offlineQueue.js`, AsyncStorage), sync automatico (NetInfo+AppState), UI "in attesa di rete" su check-in/QRScanner/SuccessScreen, cache read-only turni/presenze. Piano già scritto in dettaglio (task B1-B6 + gate B-G1/B-G2/B-G3) in `docs/superpowers/plans/2026-07-19-offline-mode.md`. Prevista per la prossima build TestFlight — comunque necessaria entro l'8 settembre (scadenza Build 14, reminder 25 agosto).
2. **SES Parte B** (email a prospect reali): resta l'unico bloccante commerciale — serve accesso DNS register.it dell'utente per verifica dominio + uscita Sandbox.
3. Backlog invariato: flake inter-worker test demo, saldi superadmin — vedi TASKS.md sezione SECURITY TECH DEBT.

---

## Dove sono le cose

- **Piano Offline Mode**: `docs/superpowers/plans/2026-07-19-offline-mode.md` (Fase A ✅ checkbox complete + note deviazioni, Fase B da eseguire)
- **Migration**: `backend/migrations/032_add_offline_checkin_fields.sql`
- **Route**: `backend/src/routes/checkins.js` (POST /api/checkins, dedup + is_offline server-derived)
- **Validazione**: `backend/src/middleware/validation.js` (`PostCheckinSchema`)
- **Test**: `backend/src/__tests__/checkins-offline.test.js` (11 test)
- **Dashboard**: `frontend-web/src/features/dashboard/components/PresencesTable.jsx` (Chip Offline)
- **Repo landing** (fuori da questo repo): `/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/Landing Page` → GitHub privato `falletti-diego/dataxiom-landing`
- **Materiale LinkedIn**: `LinkedIn/2026-07-20_badge-system-launch/` (post + carosello, già pubblicati)

## Note operative

- Deploy landing: SEMPRE `--site a31a2216-fb06-47e0-b632-a1193a88039a` · Deploy badge frontend: `--site 29a79b49-...` · Backend: automatico su push `main` (`backend/**`)
- **RDS non raggiungibile dal locale** (security group VPC-only) — per migration su produzione: SSH su EC2 (`ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143`), poi `psql` da lì (già installato).
- Credenziali RDS/EC2 in memoria (`aws_rds_postgres.md`, `rds_new_instance_2026_06_03.md`, `aws_ec2_instance.md`) — verificate valide in questa sessione.
- Cron produzione EC2: 2:00 retention, 3:30 cleanup demo (verificati in sessioni precedenti).
