# Badge System — Session 66 Handoff

**Date:** 2026-07-15
**Session:** 66 — Task 6/9 (`DEMO_EXPIRED` su refresh + cleanup scheduler) implementato, revisionato, chiuso
**Status:** ✅ **Task 6/9 chiuso. Pronto per Task 7/9 (`TryDemoPage.jsx`) nella prossima sessione.**

---

## Goal

Riprendere il piano "Ambiente Demo Self-Service" dal Task 6/9, su richiesta esplicita dell'utente di
usare `/superpowers:subagent-driven-development`, seguito da `/test-all` e da una `/code-review`
completa sul diff del task, prima di considerarlo chiuso.

---

## Come riprendere (leggi in quest'ordine)

1. **Questo file**
2. **Piano completo**: `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md` — 9 task, checkpoint di sicurezza, matrice di test
3. **`TASKS.md`** Session 66 + **`PROJECT_DECISIONS.md`** Session 66 — ragionamento completo dietro le decisioni di questa sessione

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/.claude/worktrees/demo-self-service"
git log --oneline -6   # deve mostrare 6cc3077 in cima (prima dei commit di docs)
git branch --show-current   # worktree-demo-self-service
```

**Per riprendere l'esecuzione:** invocare `/superpowers:subagent-driven-development`, leggere il piano,
procedere dal **Task 7/9** (`frontend-web/src/pages/TryDemoPage.jsx` — landing pubblica `/prova-demo`).
Mantenere la pausa esplicita dopo ogni task come richiesto dall'utente dalla Session 61.

---

## Cosa è successo in questa sessione

### Implementazione (subagent-driven-development), corretta con precisione chirurgica su file sensibile
`backend/src/routes/auth.js` — file con una storia reale di incidenti di produzione (Session 62: ordine
sbagliato tra revoke-check e replay-check) — è stato toccato con istruzioni estremamente precise
all'implementer: **non riordinare nulla** della sequenza esistente revoke-check → replay-check →
consumo-jti, aggiungere solo un controllo puntuale dopo il guard `USER_NOT_FOUND` già esistente in
`POST /refresh`. **Due correzioni deliberate al testo letterale del piano**, decise dal coordinatore
prima di dispatchare l'implementer: (1) il controllo non va in `middleware/auth.js` né nel path di
login — `middleware/auth.js` fa solo verifica di firma JWT su ogni richiesta (nessuna query DB, un
controllo lì sarebbe una regressione di performance su tutta l'app), e i dipendenti demo hanno
`password_hash NULL` quindi non possono strutturalmente autenticarsi via `POST /login` (percorso
irraggiungibile per loro); (2) la forma della risposta usa `{ error: 'DEMO_EXPIRED' }` (non `{ code:
... }` come scritto nel piano) per coerenza con tutte le altre risposte di rifiuto già esistenti in
quella stessa funzione (`SESSION_REVOKED`, `USER_NOT_FOUND`, ecc.).

`backend/scripts/cleanup-expired-demos.js` (nuovo) — modellato sul pattern già esistente
`audit-log-retention.js` (Pool proprio, `--dry-run`, count-before-delete), logica core esportata come
funzione testabile `cleanupExpiredDemos(pool, { dryRun })` separata dal wrapper CLI, audit log
`demo_tenant_cleanup` per ogni riga effettivamente cancellata (via `RETURNING`).

### `/code-review` (8 angoli) — trovato e corretto un bypass funzionale reale
A differenza della Session 65, questa volta il `/code-review` ha trovato qualcosa di sostanziale
**non solo nitpick di stile**: l'angolo Altitude ha segnalato che `POST /demo/switch-role` (Task 4) è
protetto solo da `requireAuth` + `requireDemoTenant`, e quest'ultimo controllava solo `is_demo`, mai
`demo_expires_at`. Siccome `switch-role` riemette sempre un token fresco (15 minuti) via
`issueDemoSession()`, un tenant demo scaduto ma non ancora ripulito (entro la finestra di grazia di 7
giorni) poteva chiamare `switch-role` ogni ~14 minuti per rinnovare la sessione all'infinito,
bypassando completamente il controllo `DEMO_EXPIRED` appena aggiunto su `/refresh` — vanificando lo
scopo dichiarato del task. **Verificato personalmente dal coordinatore** leggendo il codice (non solo
fidandosi del report dell'agente) prima di agire: confermato che `requireDemoTenant.js` selezionava
solo `is_demo, demo_contact_email`, mai `demo_expires_at`. Severità classificata **Important, non
Critical**: nessuna fuga cross-tenant (il bypassatore accede solo ai propri dati demo già isolati), e
comunque limitato nel tempo dallo scheduler di pulizia stesso (cancellazione dopo 7 giorni dalla
scadenza originale, indipendentemente da quante volte la sessione viene rinnovata via switch-role).

**Fix**: esteso `requireDemoTenant` (non solo `/switch-role` inline) per controllare anche
`demo_expires_at`, rispondendo `401 { error: 'DEMO_EXPIRED' }` (distinto dal 403 "non è un tenant
demo" già esistente) — questo chiude il gap per `switch-role`, `contact`, e qualunque futura route
demo-autenticata in un solo posto, invece di richiedere che ogni nuovo endpoint ricordi di ricopiare
il controllo a mano (esattamente il tipo di gap appena trovato). Aggiunto anche un fix minore
(commento fuorviante in `cleanup-expired-demos.js` che affermava erroneamente che ogni tabella figlia
avesse `ON DELETE CASCADE` — `checkins.created_by` è in realtà `ON DELETE RESTRICT`, corretto solo il
commento per riflettere la realtà, la query non necessitava modifiche).

Altri 6 finding minori del `/code-review` (loop sequenziale di `logAudit` invece di batch, boilerplate
CLI duplicato con `audit-log-retention.js`, `console.log` invece di `pino`, commento verboso,
audit-log non atomico con la DELETE, JOIN concettualmente duplicato tra login e refresh) **non
fixati** — coerenti con pattern già esistenti nel resto del codebase, non bloccanti, lasciati come
backlog.

### `/test-all` (dopo il fix)
Backend: 555/569 verdi in `--runInBand` deterministico (14 skip noti, 0 fallimenti — incluso l'intero
set di test auth-correlati: `auth-refresh-first-use`, `auth-refresh-race`,
`auth-refresh-concurrent-stress`, `auth-revoke-session`, `auth-checkrevoked`, `auth.test.js`, tutti
verdi). Frontend: 191/192 invariato (feature backend-only). **Nota operativa ripetuta**: pulita
preventivamente la riga `revoked_tokens` nota per la fixture `Pippo` (id `550e8400-...-440010`) prima
di ogni run — stesso flake pre-esistente e non correlato già documentato in Session 65, riconfermato
anche dall'implementer durante il proprio fix loop.

---

## Stato del codice (branch `worktree-demo-self-service`, commit `6cc3077` prima dei commit di docs)

| Task | Stato |
|---|---|
| 1/9 — Migration | ✅ Completato (Session 61) |
| 2/9 — `demoSeed.js` | ✅ Completato (Session 61) |
| 3/9 — `POST /demo/start` | ✅ Completato (Session 61/63) |
| 4/9 — `POST /demo/switch-role` | ✅ Completato (Session 64) |
| 5/9 — `POST /demo/contact` + AWS SES | ✅ Completato (Session 65) |
| 6/9 — `DEMO_EXPIRED` + cleanup scheduler | ✅ **Completato e chiuso in questa sessione** — bypass reale trovato dal code-review e fixato prima della chiusura |
| 7/9 — `TryDemoPage.jsx` | ⏳ **DA INIZIARE — prossimo task** |
| 8/9 — Banner/Tour/Modal/ExpiredPage | Non iniziato |
| 9/9 — `GET /api/admin/demo-tenants` | Non iniziato |

---

## What Worked

- **Verificare personalmente un finding di severità alta prima di agire, non fidarsi del solo report
  dell'agente**: ho letto io stesso `requireDemoTenant.js` e la costante `ACCESS_TOKEN_EXPIRY` in
  `routes/demo.js` per confermare il meccanismo esatto del bypass prima di richiedere un fix — pratica
  ormai consolidata dalle sessioni precedenti (Session 64 aveva fatto lo stesso per la race condition
  su `switch-role`).
- **Istruzioni estremamente precise e vincolanti sull'implementer per un file ad alto rischio**: dare
  in anticipo la sequenza esatta riga-per-riga della funzione esistente e vietare esplicitamente il
  riordino ha prodotto un diff chirurgico, confermato intatto da 3 angoli di review indipendenti
  (Angle A, Angle B, spec-compliance) senza bisogno di correzioni su quella parte.
- **Fixare il guard condiviso invece della singola route**: quando il code-review ha trovato che
  `switch-role` bypassava il controllo, la scelta di estendere `requireDemoTenant` (già estratto in
  Session 65 proprio per essere il punto singolo di verità) invece di aggiungere un controllo inline
  solo lì ha chiuso il gap anche per `/demo/contact` e per qualunque route futura, senza doverci
  pensare di nuovo.
- **Decidere esplicitamente cosa NON fixare**: dei 9 finding totali del code-review, solo 1 (+1 minore
  di documentazione) meritava un fix immediato; gli altri 7 sono nitpick di stile coerenti con pattern
  già esistenti — fixarli tutti avrebbe esteso lo scope oltre il necessario per una sessione con pausa
  esplicita richiesta dopo ogni task.

## What Didn't Work / Attenzione

- Nessun blocco grave. L'unico intoppo minore è stato di nuovo il pre-esistente stato residuo in
  `revoked_tokens`/`used_tokens` per la fixture `Pippo` (vedi Session 65) — gestito con la stessa
  pulizia preventiva prima di ogni run completa, sia dal coordinatore che dall'implementer durante il
  proprio fix loop, indipendentemente.

---

## Prossimi step

### Immediato — Task 7/9
`frontend-web/src/pages/TryDemoPage.jsx` — landing pubblica `/prova-demo`, vedi piano §7 e la sezione
Design del piano (hero navy-900/oro, form solo email, chiama `POST /demo/start`, riusa
`authService.setSession(...)` esistente, micro-copy GDPR, responsive <768px).

### Backlog
- Task 8-9 del piano, vedi tabella sopra.
- 6 finding Minor non risolti da questa sessione (`/code-review` Task 6): loop sequenziale
  `logAudit` in `cleanup-expired-demos.js`, boilerplate CLI duplicato con `audit-log-retention.js`,
  `console.log` invece di `pino`, commento verboso sul cortocircuito booleano in `auth.js`, audit-log
  non atomico con la DELETE (coerente col pattern "best-effort" già documentato altrove), JOIN
  concettualmente duplicato tra `POST /login` e `POST /refresh`.
- 6 finding Minor non risolti dalla Session 65 (vedi HANDOFF Session 65).
- Decisione ancora in sospeso dalla Session 61: aggiungere un servizio Postgres reale alla pipeline CI
  GitHub Actions.
- Causa esatta dell'hang Jest post-completamento (Session 65) non identificata — non bloccante.
- Setup infrastrutturale fuori dal repo (non bloccante): AWS EventBridge Scheduler per invocare
  `cleanup-expired-demos.js` quotidianamente via SSM Run Command sull'istanza EC2 esistente.

---

## Note operative

- Invariate rispetto a Session 65: env file già copiati, `npm install` già eseguito.
- Vedi `PROJECT_DECISIONS.md` Session 66 per il ragionamento completo dietro il bypass trovato e la
  decisione di fixare il guard condiviso invece della singola route.

---

Per riprendere: leggi questo file, poi il piano, poi `git log --oneline -6` per confermare lo stato, poi
procedi dal Task 7/9 con `subagent-driven-development`.
