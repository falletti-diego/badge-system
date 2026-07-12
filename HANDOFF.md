# Badge System — Session 55 Handoff

**Date:** 2026-07-12
**Session:** 55 — Redesign mobile Storico Presenze/Impostazioni + nuova feature Smart Working (Build 25)
**Status:** ✅ **Build 25 APPROVATA su TestFlight/produzione (testata con `maria@badge.local`) — codice pushato su main (commit `7b115fb`, `ff33233`)**

---

## Goal

Secondo step del redesign completo dell'app mobile Badge System (dopo Session 54 — QR Scanner/Face
ID/Conferma, Build 24), seguendo il mockup `frontend-mobile/mockups/badge-mobile-mockups.html`
(screen 04 Storico Presenze, 05 Settings, 06 Smart Working). A differenza della sessione precedente,
due delle tre schermate non esistevano affatto: Impostazioni (nessuna tab, nessun toggle, solo
"Esci" nell'header) e Smart Working (concetto assente — nessuna tabella, nessun endpoint).

Piano completo con tutte le decisioni di grilling (incluso il checklist di sicurezza aggiunto su
richiesta esplicita dell'utente): `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md`

---

## Stato del codice (tutto su main, commit `7b115fb`)

| Componente | Stato |
|-----------|-------|
| Backend produzione | ✅ api.dataxiom.it (invariato, nessun deploy backend fatto in questa sessione) |
| Frontend produzione | ✅ badge.dataxiom.it (invariato) |
| Mobile `app.json` buildNumber | ✅ 25 |
| `backend/migrations/027_create_smart_working_days.sql` | ✅ NUOVO — tabella `smart_working_days`, idempotente |
| `backend/src/routes/smartWorking.js` | ✅ NUOVO — `POST /` + `GET /my-history`, RBAC fail-closed |
| `backend/src/routes/auth.js` | ✅ login ora ritorna `client_name`/`site_name` |
| `frontend-mobile/src/utils/presenceUtils.js` | ✅ NUOVO — pairing IN/OUT client-side, merge Smart Working |
| `MyPresencesScreen.jsx` | ✅ riscritta — filtri periodo, aggregazione per giorno, riepilogo ore |
| `StorePresencesScreen.jsx` | ✅ restyle (struttura/logica invariate) |
| `SmartWorkingScreen.jsx` | ✅ NUOVO — dichiarazione giornaliera, bottone in home |
| `SettingsScreen.jsx` + `ChangePasswordScreen.jsx` | ✅ NUOVI — tab "Profilo", Face ID toggle, logout |
| `RootNavigator.jsx` | ✅ nuovo `SettingsStackNavigator`, tab "Profilo" aggiunta |
| Backend test | ✅ 473/487 pass |
| Mobile test | ✅ 25/25 pass |
| Test manuale utente (Xcode locale) | ✅ **confermato funzionante** — Smart Working, Storico Presenze, Cambio Password, toggle Face ID |

---

## What Worked

- **Grilling esteso con decisioni tabellate prima di scrivere codice**: per una feature a
  precedente zero (Smart Working) e una sezione mai esistita (Impostazioni), risolvere ogni
  ambiguità (periodo, sede, accesso, ruoli, duplicati) *prima* di implementare ha evitato rework.
- **Checklist di sicurezza esplicita richiesta dall'utente dopo il primo draft del piano**
  ("Aggiungi degli step di verifica per fare in modo che le criticità possano essere incontrate
  prima della messa in produzione") — ha effettivamente permesso di intercettare il bug reale
  della data Smart Working durante il test manuale, non dopo il deploy.
- **Riuso del pattern già stabilito** per dati mancanti (`client_name`/`site_name` in login,
  stesso approccio di `external_employee_id`/`site_name` in Session 54: piccola estensione della
  query esistente, nessuna nuova chiamata).
- **Copia rsync in path pulito per build iOS locali**: bloccati due volte da un errore CocoaPods
  legato al path del progetto (spazi + `&`); un symlink non ha funzionato, la copia reale sì —
  pattern riutilizzabile per ogni futura sessione di test locale su Xcode.
- **Verifica con curl/psql reali, non solo unit test a mock**: il bug della data Smart Working e
  la conferma del cambio password sono stati diagnosticati e risolti confrontando lo stato
  effettivo del DB prima/dopo, non fidandosi della sola risposta HTTP "successo".

## What Didn't Work / Attenzione per il prossimo redesign

- **`node-pg` + colonne `DATE` esposte via JSON = bug di un giorno**: qualunque `SELECT`/`RETURNING`
  che restituisce una colonna `DATE` senza cast `::text` rischia uno shift di un giorno indietro
  (timezone locale del server → UTC in serializzazione). Non emerso dagli unit test (mockano il
  DB), solo dal test manuale con Postgres reale. **Controllare se altre route nel backend hanno
  lo stesso pattern non ancora scoperto** (`illnesses.js` non ne soffre solo perché non rilegge la
  data dal DB, non perché sia stato progettato per evitarlo).
- **Path progetto con spazi e `&` rompe le build native locali**: `Dataxiom – Analisi & BI/badge`
  causa un errore CocoaPods (`[CP-User] Generate app.config...`) perché la shell tronca il path a
  `&`. Simlink non basta (`process.cwd()` risolve sempre il path reale). Serve una copia rsync
  reale in un path pulito (usato `~/badge-ios-test`) — vedi "Come testare in locale" sotto.
- **Account demo locali con dati DB disallineati**: login con `maria@badge.local` fallisce su
  qualunque nuova tabella con FK su `employees` perché il suo `employee_id` fixture non esiste nel
  DB locale corrente (bug pre-esistente, non di questa sessione). Per testare feature nuove che
  scrivono su `employees_id` FK, usare un account reale DB tipo `alice@store.local` (password
  reimpostata più volte in questa sessione, **verificare quale sia l'ultima prima di riusarla**,
  vedi sotto).
- **Sessioni JWT che scadono durante test prolungati con riavvii backend**: un tentativo di cambio
  password è fallito silenziosamente con logout forzato, causato da un token di accesso scaduto
  (15 min) combinato con refresh non riuscito — non un bug di codice, ma un effetto collaterale
  dei tanti riavvii del backend fatti in sessione. Un login fresco ha risolto tutto al primo colpo.

---

## Credenziali locali per test

| Email | Password | Ruolo | Note |
|---|---|---|---|
| `maria@badge.local` / `pino@badge.local` / `pippo@badge.local` | locale: vedi `.env.development` — produzione: SSM `/badge/production/DEMO_*_PASSWORD` | employee/manager/admin | ⚠️ `employee_id` fixture di Maria non esiste nel DB **locale** attuale — FK violation su nuove tabelle in locale (in produzione funziona, verificato Build 25) |
| `alice@store.local` | `ProvaFinale2028!` | employee (Torino Store) | **Solo DB locale** — non esiste in produzione (RDS), mai sincronizzato. Non usare per test su TestFlight/build reali: fallisce il login. Usare solo per testare in locale feature con FK su `employees`. |

**⚠️ Regola per le prossime sessioni:** ogni build TestFlight/produzione (`buildNumber` incrementato, push su main → Codemagic) usa `https://api.dataxiom.it` di default (`endpoints.js:6`, nessun `.env` è committato nel repo). Per testare su TestFlight/dispositivo reale con build da Codemagic, usare **solo** gli account `@badge.local` — mai account creati ad-hoc nel DB locale come `alice@store.local`.

---

## Prossimi step

### Immediato
1. **Attendere build Codemagic** (buildNumber 25, ~35-45 min da push) e verificare che compili.
2. **Test finale su TestFlight**: Smart Working, Storico Presenze, Impostazioni/Cambio Password —
   già verificati in locale, ma da confermare anche sul binario TestFlight reale.

### Redesign mobile — completato
Tutte le 6 schermate del mockup `badge-mobile-mockups.html` sono state ridisegnate (Session 54 +
55). Rimane da valutare se includere Ferie/Malattia/Turni in un futuro restyle (nessun mockup
dedicato oggi).

### Backlog pre-esistente (invariato, vedi TASKS.md/PROJECT_DECISIONS.md per dettaglio)
- Staging environment obbligatorio prima del primo cliente reale (STG.1-STG.6)
- ONB.2 — Saldi ferie NUMERIC per mezze giornate (3-5h)
- EU trader status su App Store Connect
- S.26 — Consenso GPS esplicito
- **Nuovo**: verificare se altre route col pattern `SELECT date_column` (non castato `::text`)
  esistono nel backend, per prevenire lo stesso bug di shift di un giorno altrove

---

## Note operative

### Come testare in locale su Xcode (percorso progetto con spazi/`&`)
```bash
# 1. Backend
cd backend && npm run dev   # DATABASE_URL da .env.development

# 2. Applicare eventuali nuove migration
psql "$DATABASE_URL" -f migrations/0XX_nome.sql

# 3. Copia pulita per build iOS (necessaria: il path reale rompe CocoaPods)
rsync -a --delete --exclude 'node_modules' --exclude 'frontend-mobile/ios' \
  --exclude 'frontend-mobile/android' --exclude '.git' --exclude '.DS_Store' \
  "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/" ~/badge-ios-test/

cd ~/badge-ios-test/frontend-mobile
npm install
# Editare .env → EXPO_PUBLIC_API_URL=http://localhost:3000 (o IP LAN per device fisico)
npx expo prebuild --platform ios --clean
npx expo run:ios
```
Il simlink NON funziona per questo scopo — serve la copia reale rsync.

### Come avviare nuova build Codemagic
1. Incrementa `buildNumber` in `frontend-mobile/app.json`
2. `git add . && git commit -m "..." && git push`
3. Codemagic parte automaticamente (webhook su push a `main`) → ~35-45 min → TestFlight

### Dati tecnici Codemagic
| Dato | Valore |
|------|--------|
| Bundle identifier | `it.dataxiom.badge` |
| Apple Team ID | `UKZ95L3FHH` |
| App Store Connect App ID | `6777934529` |
| API Key in Codemagic | `Badge System (Key: 58VXN7ATGV)` |
| Workflow | `badge-ios-testflight` |
| Branch | `main` |
| buildNumber attuale | `25` |

---

Per riprendere: leggi `TASKS.md` + `PROJECT_DECISIONS.md` (Session 55) + `git log --oneline -10`.
