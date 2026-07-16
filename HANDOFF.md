# Badge System — Session 69 Handoff

**Date:** 2026-07-16
**Session:** 69 — Task 9/9 (`GET /api/admin/demo-tenants`) implementato e chiuso — ULTIMO task del piano — + verifica end-to-end completa + review di sicurezza automatica (1 fix TLS applicato, 1 finding RBAC documentato come backlog)
**Status:** ✅ **Piano "Ambiente Demo Self-Service" COMPLETO. Tutti i 9 task chiusi. Prossimo step: decisione merge/PR.** ⚠️ Prima di decidere merge, leggi la sezione "Finding di sicurezza" qui sotto — un finding HIGH resta aperto e non è specifico di questo branch.

---

## Goal

Implementare l'ultimo task del piano "Ambiente Demo Self-Service" (Task 9/9), poi condurre una
verifica end-to-end completa del piano prima di decidere se e come integrare il branch nel resto
del repository (merge/PR/keep), su richiesta esplicita dell'utente.

---

## Come riprendere (leggi in quest'ordine)

1. **Questo file**
2. **`TASKS.md`** Session 69 + **`PROJECT_DECISIONS.md`** Session 69 — ragionamento completo dietro
   ogni decisione e verifica di questa sessione
3. **Piano completo** (per riferimento storico): `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md`

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/.claude/worktrees/demo-self-service"
git log --oneline -6   # deve mostrare 3058086 in cima (prima dei commit di docs)
git branch --show-current   # worktree-demo-self-service
```

**Per riprendere: NON c'è più un Task N/9 da fare.** Il piano è completo. Il passo successivo è
invocare `/superpowers:finishing-a-development-branch` per decidere merge/PR/keep/discard del branch
`worktree-demo-self-service` verso `main`.

---

## Cosa è successo in questa sessione

### Implementazione Task 9/9
`GET /api/admin/demo-tenants` (`backend/src/routes/admin/demo-tenants.js`) — endpoint di sola lettura,
lista tenant demo ordinata per scadenza, montato dopo il gate RBAC condiviso `role==='admin'` già
esistente. **Gap reale chiuso**: il gate condiviso non controllava se il tenant del chiamante fosse
esso stesso demo — un admin di un tenant demo (creato da `demoSeed.js`) avrebbe altrimenti passato il
controllo. Fix dedicato dentro il nuovo file, polarità invertita rispetto a `requireDemoTenant.js`
(deliberatamente non riusato per questo motivo).

### Review: nessun Critical/Important, 3 Minor in backlog
Spec-compliance e code-quality entrambe pulite. 3 Minor lasciati come backlog esplicito: codice errore
riusato (`ADMIN_REQUIRED`) invece di uno dedicato, nessun log sul tentativo cross-tenant, query
duplicata invece di un middleware condiviso (stesso pattern DRY che il Task 5 aveva già imparato ad
evitare).

### `/test-all`
Backend **563/577 verdi** (0 fallimenti — 2 fallimenti iniziali in parallelo diagnosticati come flake
preesistente, non correlato, riprodotto anche sul commit precedente). Frontend 259/260 invariato.

### `/api-test` — fallimento diagnosticato come gap ambientale locale, non del codice
Lo script generico ha fallito 8/23 contro il backend dev locale. Causa reale: `.env.development` ha
`DISABLE_AUTH=true` (bypassa tutto l'RBAC, voluto in dev) e il DB locale non ha gli account
`diego@badge.local`/`luca.verdi@employee.it` che lo script si aspetta. **Nessuna relazione col Task 9.**
Sostituito con una verifica mirata: server riavviato con `DISABLE_AUTH=false`, verificato dal vivo con
curl reali contro Postgres reale — admin reale vede la lista (200), admin di un tenant demo riceve
**403 `ADMIN_REQUIRED`**, nessun token riceve 401. Esattamente il Checkpoint 9 del piano.

### Verifica end-to-end completa del piano (richiesta esplicita dell'utente)
Verificati dal vivo con curl reali (server locale, auth reale attiva):
- **#6 (critico)**: `switch-role` con JWT di un admin REALE → 403, nessun token emesso.
- **#7**: scadenza forzata nel passato → refresh dà `DEMO_EXPIRED`, non un errore generico.
- **#8**: scadenza oltre la finestra di grazia → `cleanup-expired-demos.js` cancella tutto a cascata
  (verificato a zero righe client/dipendenti/sedi), rieseguito una seconda volta → idempotente pulito.
  **Nota operativa**: lo script richiede le variabili `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/
  `DB_NAME` singole, non `DATABASE_URL` — utile saperlo se va rieseguito manualmente.
- **#5**: rate-limit bloccato con messaggio chiaro e `retryAfter`.
- **#1-4** (flusso frontend/tour/banner): **NON verificati con un browser reale** — nessuno strumento
  di controllo browser disponibile in questo ambiente. Verificati per proxy tramite la suite di test
  frontend automatizzata (259/260 verdi). **Gap dichiarato esplicitamente**: una verifica visiva reale
  in un browser resta raccomandata prima del lancio a un prospect reale.

**Matrice di test supplementare (13 scenari)**: 11/13 già coperti da test automatici verdi. 2 gap
accettati come non bloccanti: riga 10 (richiesta in-flight durante cleanup — strutturalmente sicura per
le garanzie transazionali di Postgres, ma non testata esplicitamente), riga 12 (nessun test di
regressione dedicato per `is_demo=false` su `POST /api/admin/clients` — protetto comunque dal
`DEFAULT false` della colonna).

---

## Stato del codice (branch `worktree-demo-self-service`, commit `3058086` prima dei commit di docs)

| Task | Stato |
|---|---|
| 1/9 — Migration | ✅ Completato (Session 61) |
| 2/9 — `demoSeed.js` | ✅ Completato (Session 61) |
| 3/9 — `POST /demo/start` | ✅ Completato (Session 61/63) |
| 4/9 — `POST /demo/switch-role` | ✅ Completato (Session 64) |
| 5/9 — `POST /demo/contact` + AWS SES | ✅ Completato (Session 65) |
| 6/9 — `DEMO_EXPIRED` + cleanup scheduler | ✅ Completato (Session 66) |
| 7/9 — `TryDemoPage.jsx` | ✅ Completato (Session 67) |
| 8/9 — Banner/Tour/Modal/ExpiredPage | ✅ Completato (Session 68) |
| 9/9 — `GET /api/admin/demo-tenants` | ✅ **Completato e chiuso in questa sessione — piano COMPLETO** |

---

## What Worked

- **Diagnosticare un fallimento di `/api-test` leggendo la configurazione invece di assumere una
  regressione**: trovare `DISABLE_AUTH=true` e gli account mancanti nel DB locale ha evitato di
  inseguire 8 falsi allarmi non correlati al Task 9, e ha permesso una verifica mirata più preziosa
  (auth reale, scenario esatto del Checkpoint 9) al posto di uno script generico mal configurato per
  l'ambiente locale.
- **Verificare dal vivo con curl reali contro Postgres reale invece di fidarsi solo dei test automatici**
  per i punti più critici del piano (#5, #6, #7, #8) — ha dato una conferma diretta, non mediata da
  mock, degli scenari di sicurezza più delicati dell'intera feature (switch-role fail-closed, scadenza,
  cascata di cancellazione).
- **Dichiarare esplicitamente i gap invece di nasconderli**: sia l'assenza di verifica browser reale
  (punti #1-4) sia le 2 righe non coperte della matrice supplementare sono stati riportati onestamente
  come limiti accettati, non presentati come "tutto verificato al 100%".

## What Didn't Work / Attenzione

- Nessun blocco grave. Uno script di utilità (`cleanup-expired-demos.js`) richiede variabili d'ambiente
  singole (`DB_HOST` etc.) invece di `DATABASE_URL` — non un bug, ma una discrepanza di convenzione
  rispetto al resto del progetto, utile da ricordare per la prossima esecuzione manuale.

---

## Finding di sicurezza (review automatica in background, subito dopo la chiusura del Task 9/9)

Una review di sicurezza automatica ha segnalato 2 finding. Entrambi verificati manualmente (non accettati sulla fiducia) prima di agire.

**Fixato**: TLS certificate verification disabilitata in 3 script standalone (`cleanup-expired-demos.js`,
`audit-log-retention.js`, `apply-schema.js` — ciascuno apre un proprio `pg.Pool` separato dal pool
condiviso, con `rejectUnauthorized: false` incondizionato in produzione). Nessuno dei tre file era stato
toccato dal Task 9 — problema preesistente (il più recente risale alla Session 66), non una regressione
di questa sessione. Allineati al pattern già sicuro di `src/db/pool.js`. Verificato: sintassi corretta,
563/577 backend verdi dopo il fix. Commit `2659982`.

**NON fixato, documentato come backlog HIGH in `TASKS.md`**: l'intero namespace `/api/admin/*`
(incluse `GET /admin/clients` e `GET /admin/sites`, preesistenti da molte sessioni, non solo la nuova
`GET /admin/demo-tenants`) non scopa mai l'accesso al `client_id` del chiamante — qualunque dipendente
`role==='admin'` di *qualsiasi* tenant reale vede oggi tutti i client/sedi/ora anche tutte le email di
contatto dei prospect demo del sistema. **Non è una regressione del Task 9** — `demo-tenants.js` ha solo
ereditato il modello di accesso già stabilito per tutto il namespace. Non fixato perché: (1) correggerlo
solo qui sarebbe incoerente (resterebbe comunque possibile vedere tutto da `/admin/clients`), (2) serve
prima una decisione di prodotto (il ruolo `admin` è esclusivo di Dataxiom o assegnabile da un cliente
reale a un proprio dipendente?) che l'utente ha preferito investigare insieme piuttosto che decidere a
memoria. Evidenza raccolta (indicativa, non conclusiva): l'onboarding self-service reale
(`scripts/onboarding/parseWorkbook.js`) non può mai produrre un dipendente `admin` tramite import CSV
— solo Dataxiom può crearne uno manualmente. Vedi `PROJECT_DECISIONS.md` Session 69 (Addendum) per il
ragionamento completo. **Prossimo passo consigliato**: un ciclo `/grilling` + `/writing-plans` dedicato
per decidere e pianificare il fix (probabilmente una colonna `is_staff` su `clients` o un ruolo
`superadmin`, applicato a tutto `/api/admin`), separato dalla decisione merge/PR di questo branch — il
finding non è specifico del branch demo self-service e non dovrebbe bloccarne il merge, ma va tracciato
con la priorità che merita.

---

## Prossimi step

### Immediato — decisione merge/PR
Il piano è completo. Prossimo passo: `superpowers:finishing-a-development-branch` per decidere se e
come integrare `worktree-demo-self-service` in `main` — merge diretto, PR per review, o mantenerlo
ancora isolato per ulteriori verifiche.

### Prima del lancio a un prospect reale (raccomandato, non bloccante per il merge tecnico)
- Verifica visiva reale in un browser del flusso completo (`/prova-demo` → dashboard → tour → banner →
  selettore ruolo → form contatto → scadenza) — non eseguibile in questo ambiente.
- Screenshot reali per la sezione "Cosa vedrai" di `TryDemoPage.jsx` (oggi placeholder commentati).
- Setup infrastrutturale fuori dal repo: AWS SES (dominio/email mittente), AWS EventBridge Scheduler
  per `cleanup-expired-demos.js` quotidiano via SSM su EC2.

### Backlog tecnico (non bloccante)
- 3 Minor del Task 9 (codice errore dedicato, logging cross-tenant, middleware condiviso).
- Minor residui delle Session 65-68 (vedi `PROJECT_DECISIONS.md` di ciascuna sessione).
- 2 gap della matrice di test supplementare (righe 10 e 12, vedi sopra — entrambi strutturalmente
  a basso rischio).
- Decisione ancora in sospeso dalla Session 61: servizio Postgres reale nella pipeline CI.

---

## Note operative

- Ambiente ripulito a fine sessione: nessun tenant demo di test residuo, `.env.development` ripristinato
  a `DISABLE_AUTH=true`.
- Vedi `PROJECT_DECISIONS.md` Session 69 per il dettaglio completo di ogni verifica live eseguita.

---

Per riprendere: leggi questo file, poi `git log --oneline -6` per confermare lo stato, poi invoca
`superpowers:finishing-a-development-branch` per la decisione merge/PR.
