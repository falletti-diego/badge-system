# Badge System — Session 61 Handoff

**Date:** 2026-07-13
**Session:** 61 — Ambiente Demo Self-Service: pianificazione + Task 1-2/9 implementati
**Status:** ⏸️ **IN PAUSA su richiesta esplicita dell'utente — riprendere da Task 3/9 nella prossima sessione**

---

## Goal

Costruire un ambiente demo self-service: un visitatore anonimo del sito clicca "Prova la demo",
inserisce solo la propria email, ed entra immediatamente in una Dashboard web già popolata con
dati realistici (presenze, straordinari, assenteismo), esplorabile come Admin/Manager/Dipendente,
per 7 giorni, senza mai parlare con nessuno — con un invito sempre visibile a contattare Dataxiom.

Scelta come "prossima feature a minimo sforzo/massima resa" dal backlog MVP Hardening (Session 57),
al posto di alternative più economiche (es. PDF export Riepilogo Ore) per il maggiore valore
commerciale.

---

## Come riprendere (leggi in quest'ordine)

1. **Questo file** (contesto generale + cosa fare subito)
2. **Piano completo**: `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md` — contiene tutte
   le decisioni di grilling, il design visivo, i 9 task con checkpoint di sicurezza, e la matrice di
   test aggiuntiva emersa dall'autocritica del piano
3. **`TASKS.md`** Session 61 + **`PROJECT_DECISIONS.md`** Session 61 — riassunto di cosa è stato
   deciso e perché

**Il lavoro NON è su main.** Tutto vive in un worktree isolato:
```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/.claude/worktrees/demo-self-service"
git log --oneline -6   # deve mostrare c9ae14b in cima
git branch --show-current   # worktree-demo-self-service
```
Se il worktree non esiste più (rimosso per qualche motivo), va ricreato con lo strumento nativo
`EnterWorktree` (non `git worktree add` manuale) — vedi skill `superpowers:using-git-worktrees`.

**Per riprendere l'esecuzione:** invocare `/superpowers:subagent-driven-development`, leggere il
piano, e procedere dal **Task 3/9** (`POST /demo/start`). L'utente ha chiesto esplicitamente una
pausa con via libera dopo OGNI task (non l'esecuzione continua di default della skill) — mantenere
questo pattern anche nella prossima sessione, salvo diversa indicazione.

---

## Stato del codice (branch `worktree-demo-self-service`, commit `c9ae14b`)

| Task | Stato | Cosa contiene |
|---|---|---|
| 1/9 — Migration | ✅ Completato, review passata (con fix) | `backend/migrations/028_add_demo_tenant_fields.sql`, `029_create_demo_contact_requests.sql` |
| 2/9 — `demoSeed.js` | ✅ Completato, review passata (con fix) | `backend/src/utils/demoSeed.js` + `backend/src/__tests__/demoSeed.test.js` |
| 3/9 — `POST /demo/start` | ⏳ **DA INIZIARE** | Endpoint pubblico più delicato del piano — vedi sezione dedicata sotto |
| 4/9 — `POST /demo/switch-role` | Non iniziato | |
| 5/9 — `POST /demo/contact` + AWS SES | Non iniziato | |
| 6/9 — `DEMO_EXPIRED` + cleanup scheduler | Non iniziato | |
| 7/9 — `TryDemoPage.jsx` | Non iniziato | |
| 8/9 — Banner/Tour/Modal/ExpiredPage | Non iniziato | |
| 9/9 — `GET /api/admin/demo-tenants` | Non iniziato | |

Suite backend nel worktree: **502/502 test verdi** (verificato anche direttamente, non solo dai
subagent). Nessuna regressione rispetto alla baseline di main (492/502 dopo Session 60).

---

## What Worked

- **Autocritica esplicita del piano prima di eseguirlo** (`/grilling` con se stessi, su richiesta
  dell'utente): ha trovato un bug reale — `clients.email UNIQUE` non gestito per il caso di
  richiesta-demo-ripetuta con la stessa email — prima ancora che diventasse codice. Vale la pena
  ripetere questo passaggio per qualunque feature futura con superfici pubbliche/non autenticate.
- **Esecuzione a task singoli con pausa esplicita**: ha permesso review reali (implementer + 2
  subagent indipendenti per task) invece di una corsa continua — in entrambi i task completati la
  code-quality review ha trovato un problema reale non banale (indice mancante Task 1, design a
  doppia modalità superfluo/rischioso Task 2) che sarebbe stato più costoso correggere più avanti,
  quando altro codice si fosse appoggiato sopra.
- **Verifica reale su Postgres locale ad ogni step**, non solo mock — richiesto esplicitamente
  dall'utente ("testa ogni feature alla fine di ogni task") e già la pratica di default della
  skill: sia l'implementer che il reviewer di spec-compliance hanno rieseguito indipendentemente
  le stesse query/inserimenti contro un DB reale, non fidandosi l'uno del report dell'altro.
- **Verifica tecnica preventiva via SSH+psql su RDS produzione** (stessa sessione, prima di
  scrivere il piano): confermato che ogni tabella con `client_id` ha `ON DELETE CASCADE` verso
  `clients` — questo ha permesso di progettare la cancellazione di un tenant demo come una singola
  query invece di uno script multi-tabella.

## What Didn't Work / Attenzione

- Nessun blocco grave. Un solo intoppo minore: durante il Task 2, un run isolato di `auth.test.js`
  ha mostrato un fallimento transitorio (`refresh_token` undefined) legato a ordine/stato dei test
  pre-esistente, non a `demoSeed.js` — risolto rieseguendo (pulito sia dal subagent che da me
  direttamente). Se dovesse ripresentarsi in futuro, indagare `auth.test.js` per uno stato
  condiviso tra test non ripulito correttamente tra un test e l'altro — non è stato causato da
  questa feature, ma vale la pena tenerlo d'occhio.

---

## Prossimi step

### Da fare subito (Task 3/9)
`POST /demo/start` — l'endpoint pubblico, rate-limited, che crea un tenant demo. Il piano lo
descrive in dettaglio (§3), inclusa tutta la logica di gestione email-duplicata (3 percorsi + rete
di sicurezza contro race condition) emersa dall'autocritica. **Checkpoint di sicurezza esplicito
nel piano**: nessun campo diverso da `email` accettato dal body, rate-limit + tetto globale
verificati con test automatici (non solo manuali), i 3 percorsi email-duplicata testati uno per
uno incluso un test di race condition reale (`Promise.all`, non sequenziale).

### Decisione in sospeso da prendere con l'utente
- **Gap CI**: la pipeline GitHub Actions non provisiona un servizio Postgres reale per il job
  backend — i test DB-dipendenti passano solo in locale. Non bloccante finora, ma il Task 3
  dipende molto di più da questa copertura (race condition, duplicate email). Proporre
  esplicitamente all'utente: aggiungere un servizio Postgres a `ci.yml` prima/durante il Task 3, o
  accettare il gap come limite noto documentato.

### Dopo il Task 9 (fine feature)
- Review finale complessiva (code-reviewer su tutto il branch) + `superpowers:finishing-a-development-branch`
  per decidere merge/PR/keep/discard — non ancora il momento, restano 7 task.
- Setup infrastrutturale fuori dal repo (non bloccante per lo sviluppo applicativo): AWS SES
  (verifica dominio/email mittente + IAM `ses:SendEmail`), AWS EventBridge Scheduler (regola
  giornaliera per `cleanup-expired-demos.js`, via SSM Run Command sull'istanza EC2 esistente).

---

## Note operative

- Env file (`.env`, `.env.development`, `.env.test`) già copiati nel worktree — non serve
  ripeterlo, ma se il worktree viene ricreato da zero vanno ricopiati manualmente (sono
  gitignored).
- `npm install` già eseguito in `backend/` e `frontend-web/` dentro il worktree.
- Pattern di generazione dati demo (`demoSeed.js`) generalizza `backend/scripts/seed-may-2026-demo.sql`
  (Session 60) — stesso concetto (weekday-only IN/OUT, straordinari sparsi, assenze), ma date
  relative a "oggi" invece che a un mese fisso, e UUID dinamici invece che fissi.
- Vedi `PROJECT_DECISIONS.md` Session 61 per il ragionamento completo dietro ogni decisione di
  design (perché `is_demo` booleano dedicato e non overload di `plan`, perché scope solo-web,
  perché selettore ruolo in-app invece di 3 credenziali separate, ecc.).

---

Per riprendere: leggi questo file, poi il piano (`~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md`),
poi entra nel worktree ed esegui `git log --oneline -6` per confermare lo stato, poi procedi dal
Task 3/9 con `subagent-driven-development`.
