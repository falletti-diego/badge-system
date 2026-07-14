# Badge System — Session 62 Handoff

**Date:** 2026-07-14
**Session:** 62 — Hotfix `POST /auth/refresh`: bug replay-detection in produzione, trovato durante il Task 3/9 della Session 61
**Status:** ✅ **Fix completo, testato, code-reviewed — pronto per merge su `main`. Il bug è ancora LIVE in produzione finché non viene mergiato.**

---

## Goal

Correggere un bug di produzione reale, indipendente dalla feature "Ambiente Demo Self-Service": `POST /api/v1/auth/refresh` rifiutava con `401 SESSION_REVOKED` il **primo** tentativo di refresh di ogni cliente reale (non-`@badge.local`) login, subito dopo un login altrimenti riuscito.

Scoperto per caso durante il Task 3/9 della Session 61 (testando il `refresh_token` appena aggiunto a `POST /demo/start`), ma è un bug pre-esistente su `main`, non introdotto dalla feature demo.

---

## Come riprendere (leggi in quest'ordine)

1. **Questo file**
2. **Piano completo**: `docs/superpowers/plans/2026-07-14-refresh-replay-detection-hotfix.md` — root cause dettagliata, task-by-task, note di auto-review
3. **`PROJECT_DECISIONS.md`** sezione "Session 62" — ragionamento completo dietro ogni decisione di design
4. **`TASKS.md`** Session 62 — riepilogo sintetico

**Il lavoro vive in un worktree isolato, separato dal branch demo self-service:**
```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/.claude/worktrees/hotfix-refresh-replay-detection"
git log --oneline -6   # deve mostrare ae92741 in cima
git branch --show-current   # worktree-hotfix-refresh-replay-detection
```
Base branch: `main` (non `worktree-demo-self-service`) — deliberato, per poter shippare questo hotfix indipendentemente dalla feature demo, ancora multi-settimana dal completamento.

**Prossimo step immediato: merge/PR su `main`**, poi tornare al worktree `.claude/worktrees/demo-self-service` e riprendere da **Task 3/9** della Ambiente Demo Self-Service (vedi `HANDOFF.md`/`TASKS.md` Session 61 in quel worktree).

---

## Stato del codice (branch `worktree-hotfix-refresh-replay-detection`, commit `ae92741`)

| File | Cosa contiene |
|---|---|
| `backend/src/routes/auth.js` | Fix completo: semantica trovato/non-trovato invertita, esenzione demo basata su dominio email (non più id-lookup), `revoked_tokens` controllato prima del replay-check, tutti e 3 i touch-point del ciclo di vita del jti coerenti |
| `backend/src/__tests__/auth-refresh-first-use.test.js` | 4 test di regressione reali (Postgres locale, non mockati): primo refresh dopo login, rifiuto di un token già consumato, collisione id con `DEMO_USERS`, revoca permanente non declassata |
| `backend/src/__tests__/auth-refresh-race.test.js` | Test mockati preesistenti, aggiornati alla semantica corretta + al nuovo ordine delle query |
| `backend/src/__tests__/auth-refresh-concurrent-stress.test.js` | Idem |
| `docs/superpowers/plans/2026-07-14-refresh-replay-detection-hotfix.md` | Piano completo con root cause e task |

Suite backend: **492/506 test verdi**, 14 skip noti (pattern soft-skip senza Postgres reale), 0 falliti. Lint pulito (1 warning preesistente non correlato, riga 630, funzione change-password). Un test frontend isolato (`getInitials.test.js`, 8/8) eseguito per verificare la toolchain — l'hotfix è backend-only, non serve la suite frontend completa.

---

## What Worked

- **TDD reale, non solo dichiarato**: ogni fix (quello iniziale e le 2 correzioni successive trovate dalla code review) è passato per un vero ciclo RED→GREEN — il test di regressione è stato eseguito e verificato fallire per il motivo esatto atteso prima di scrivere qualunque riga di fix.
- **Worktree isolato dedicato, non il branch della feature in corso**: separare l'hotfix dal branch demo self-service (ancora WIP, multi-settimana) permette di shippare la correzione di sicurezza immediatamente, senza aspettare che l'altra feature sia completa.
- **`/code-review` con 6 agenti paralleli su una fix già "verde"**: la prima versione della fix passava tutti i test e sembrava corretta — la code review ha comunque trovato 2 regressioni reali e sfruttabili (collisione id Maria, declassamento revoca permanente) che nessun test esistente copriva, perché nessuno aveva mai pensato di testare "cosa succede se un dipendente reale ha lo stesso id di un fixture demo" o "cosa succede al refresh dopo una revoca amministrativa". Vale la pena ripetere la code review multi-angolo anche su fix che sembrano già complete, specialmente su codice di autenticazione condiviso.
- **Verificare le affermazioni degli agenti finder contro il codice reale prima di agire**: un agente aveva ipotizzato che l'INSERT finale avrebbe causato un crash per violazione di foreign key sugli account demo Pippo/Pino — verificato leggendo `migrations/018_add_badge_local_demo_users.sql` che le loro righe `employees` esistono davvero, confutando l'ipotesi (non un vero bug, solo un accumulo di righe orfane, comunque corretto per coerenza).
- **Usare il payload del token stesso (dominio email) invece di un id-lookup come segnale di "sessione demo"**: più robusto di `DEMO_USERS.find(u => u.id === user_id)`, che collide ogni volta che un id fixture viene intenzionalmente riusato per un dipendente reale (già successo una volta con Maria, migration 022 — potrebbe succedere di nuovo).

## What Didn't Work / Attenzione

- Il primo tentativo del test di regressione per la collisione id (V1) ha fallito con un conflitto di chiave duplicata: avevo provato a inserire una nuova riga `employees` con l'id di Pippo, ma quella riga esiste già (seed di migration 018). Risolto riusando/ripristinando la riga esistente (UPDATE temporaneo email/password_hash, ripristinato in `afterAll`) invece di inserirne una nuova.
- Il classificatore di sicurezza della piattaforma è stato temporaneamente non disponibile per diversi minuti durante la sessione (bloccando `npm ci` e l'invocazione della skill code-review) — non un problema del codice, risolto aspettando.

---

## Prossimi step

### Immediato
- **Merge/PR di questo hotfix su `main`** — priorità alta, il bug è live in produzione (ogni cliente reale non riesce al primo refresh del token).
- Dopo il merge, verificare il deploy in produzione (CI/CD → EC2) e testare live con un account cliente reale (login → refresh) come da convenzione "Verification" del progetto.

### Dopo il merge
- Tornare al worktree `.claude/worktrees/demo-self-service`, riprendere da **Task 3/9** (`POST /demo/start`) della Ambiente Demo Self-Service (Session 61, in pausa su richiesta esplicita dell'utente).
- Valutare se il branch demo self-service debba fare rebase/merge di questo hotfix (contiene modifiche a `routes/auth.js` che il branch demo tocca in modo adiacente per `POST /demo/start`'s `issueDemoSession()` — verificare compatibilità).
- Task 4 del piano di questo hotfix (un-skip del test `demo-start.test.js` che documentava questo stesso bug) può essere completato una volta che il branch demo ha questo fix disponibile.

---

## Note operative

- Non confondere questo worktree (`hotfix-refresh-replay-detection`, base `main`) con `.claude/worktrees/demo-self-service` (base `main` + commit feature demo) — sono branch fratelli indipendenti, non l'uno dentro l'altro.
- Env file (`.env`, `.env.test`) copiati manualmente da `.claude/worktrees/demo-self-service/backend/` all'inizio di questa sessione — se il worktree viene ricreato da zero, vanno ricopiati di nuovo (gitignored).
- Database locale condiviso (`badge_system`, `badge_system_test`) tra i worktree — già migrato con lo schema del branch demo (comprese le migration 028-030), quindi i test di questo hotfix (che non dipendono da quelle tabelle) girano correttamente senza bisogno di ri-migrare.

---

Per riprendere: leggi questo file, poi `docs/superpowers/plans/2026-07-14-refresh-replay-detection-hotfix.md`, poi procedi al merge/PR.
