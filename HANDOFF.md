# Badge System — Session 64 Handoff

**Date:** 2026-07-14
**Session:** 64 — Task 4/9 (`POST /demo/switch-role`) implementato, code-reviewed, race condition critica trovata e fixata
**Status:** ✅ **Task 4/9 chiuso. Pronto per Task 5/9 (`POST /demo/contact` + AWS SES) nella prossima sessione.**

---

## Goal

Riprendere il piano "Ambiente Demo Self-Service" dal Task 4/9, su richiesta esplicita dell'utente di usare `/superpowers:subagent-driven-development` + `/superpowers:test-driven-development`, seguito da `/test-all` e da una `/code-review` completa (5 agenti paralleli) sul diff del task, prima di considerarlo chiuso.

---

## Come riprendere (leggi in quest'ordine)

1. **Questo file**
2. **Piano completo**: `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md` — 9 task, checkpoint di sicurezza, matrice di test
3. **`TASKS.md`** Session 64 + **`PROJECT_DECISIONS.md`** Session 64 — ragionamento completo dietro la race condition trovata e la decisione di design

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/.claude/worktrees/demo-self-service"
git log --oneline -6   # deve mostrare 2dcfe47 in cima
git branch --show-current   # worktree-demo-self-service
```

**Per riprendere l'esecuzione:** invocare `/superpowers:subagent-driven-development`, leggere il piano, procedere dal **Task 5/9** (`POST /demo/contact` + AWS SES). Mantenere la pausa esplicita dopo ogni task come richiesto dall'utente dalla Session 61.

---

## Cosa è successo in questa sessione

### Decisione preliminare via `/grilling`
Prima di dispatchare l'implementer, ho verificato che il testo letterale del piano per l'"igiene sessione" del Task 4 ("riusa la logica di `POST /auth/revoke-session`") avrebbe reintrodotto la stessa classe di bug appena risolta nell'hotfix Session 62 (una revoca permanente in `revoked_tokens`, keyed per `user_id`, che non si auto-ripulisce). **Deciso con l'utente**: sostituire con un `DELETE FROM used_tokens WHERE user_id = $1` mirato — poi rivelatosi comunque problematico per una ragione diversa (vedi sotto).

### Implementazione (subagent-driven-development + TDD)
Endpoint implementato secondo spec: guardia fail-closed `is_demo` first, lookup dipendente scoped per `client_id`, riemissione JWT via `issueDemoSession` (riuso da `/demo/start`), audit log `demo_role_switch`. L'implementer ha auto-corretto durante il proprio self-review un bug d'ordine reale (il DELETE doveva girare PRIMA di `issueDemoSession`, non dopo — altrimenti il caso no-op stesso-ruolo cancellava la propria riga appena inserita).

### Review a due stadi
Spec-compliance: 100% conforme, tutti i 6 scenari del Checkpoint 4 coperti da test reali. Code-quality: 2 finding minori (export morto rimosso, tradeoff del DELETE-fallito-ignorato documentato esplicitamente).

### `/test-all`
Backend 528/542 (14 skip noti), frontend 191/192 (1 skip, invariato). **Nota operativa**: i test demo-correlati condividono lo stesso tetto reale `MAX_ACTIVE_DEMOS` su Postgres — in worker Jest paralleli possono darsi falsi 409 a vicenda. Usato `--runInBand` per un segnale deterministico; non risolto strutturalmente.

### `/code-review` — race condition critica trovata e fixata
5 agenti paralleli + verifica dedicata 1-voto. **Confermato**: il `DELETE FROM used_tokens WHERE user_id = $1` (non scoped al jti specifico, non transazionale) poteva cancellare la riga appena inserita da un `POST /auth/refresh` concorrente e legittimo per lo stesso utente — causando un falso `REPLAY_ATTACK_DETECTED` e un blocco di 5 minuti su una sessione mai replayata. Non raggiungibile oggi (nessun frontend chiama ancora questo endpoint), ma non impedito dal codice.

**Deciso con l'utente** (via `AskUserQuestion`): rimosso del tutto il DELETE proattivo. Il piano stesso descrive questa igiene come "non un rischio di sicurezza, solo accumulo di sessioni fantasma" — il fix per eliminare la race avrebbe richiesto un cambio di contratto API o toccare `routes/auth.js` (fuori scope), quindi si accetta che il vecchio refresh token scada naturalmente (max 7gg) invece di rischiare un falso blocco su una sessione legittima concorrente.

---

## Stato del codice (branch `worktree-demo-self-service`, commit `2dcfe47`)

| Task | Stato |
|---|---|
| 1/9 — Migration | ✅ Completato (Session 61) |
| 2/9 — `demoSeed.js` | ✅ Completato (Session 61) |
| 3/9 — `POST /demo/start` | ✅ Completato (Session 61/63) |
| 4/9 — `POST /demo/switch-role` | ✅ **Completato e chiuso in questa sessione** — race condition trovata dalla code review e fixata prima del merge |
| 5/9 — `POST /demo/contact` + AWS SES | ⏳ **DA INIZIARE — prossimo task** |
| 6/9 — `DEMO_EXPIRED` + cleanup scheduler | Non iniziato |
| 7/9 — `TryDemoPage.jsx` | Non iniziato |
| 8/9 — Banner/Tour/Modal/ExpiredPage | Non iniziato |
| 9/9 — `GET /api/admin/demo-tenants` | Non iniziato |

---

## What Worked

- **Verificare col codice reale una decisione del piano prima di eseguirla** (`/grilling`): il testo letterale ("riusa revoke-session") avrebbe introdotto un bug reale — verificato leggendo `routes/auth.js` prima di dispatchare l'implementer, non dopo.
- **Il ciclo implementer→self-review ha funzionato**: l'implementer ha trovato da solo il bug d'ordine (DELETE prima/dopo `issueDemoSession`) senza bisogno di un round di review esterna per quello specifico problema.
- **La code review multi-angolo ha trovato un secondo bug di concorrenza, più sottile, che il self-review dell'implementer non poteva vedere**: la race con un `/auth/refresh` concorrente richiede di ragionare su DUE richieste HTTP diverse in volo insieme, non solo sull'ordine interno di una singola richiesta — esattamente il tipo di bug per cui vale la pena una review indipendente anche su codice "già verde".
- **Verifica dedicata a 1-voto sul finding più grave prima di agire**: non ho fixato subito sulla base del solo report del finder-agent — ho dispatchato un verificatore indipendente che ha confermato il meccanismo esatto (con tanto di dettaglio MVCC/lock di Postgres) prima di toccare codice di produzione.
- **Chiedere all'utente la decisione di design, non sceglierla unilateralmente**: la fix del race condition aveva 3 opzioni ragionevoli con tradeoff reali (cambiare il contratto API, rimuovere la feature di igiene, o documentare il rischio) — non una scelta tecnica ovvia, quindi corretto chiederla esplicitamente.

## What Didn't Work / Attenzione

- La prima soluzione scelta per l'igiene-sessione (DELETE mirato su `used_tokens`, invece di riusare `revoke-session`) era corretta per il problema che risolveva (evitare il blocco permanente al rientro su un ruolo) ma ne ha introdotto uno nuovo e diverso (race con refresh concorrente) — un promemoria che risolvere un bug di concorrenza non garantisce che la soluzione sia priva di altri bug di concorrenza; serve sempre pensare esplicitamente a "cos'altro potrebbe girare in parallelo su questo stesso `user_id`".
- I test demo-correlati (`demo-start.test.js`, `demo-switch-role.test.js`) condividono un tetto reale (`MAX_ACTIVE_DEMOS`) su Postgres — eseguirli in worker Jest paralleli (default) può produrre falsi 409. Non risolto strutturalmente in questa sessione (mitigato con `--runInBand`), da tenere d'occhio se altri task aggiungono altri test demo-correlati.

---

## Prossimi step

### Immediato — Task 5/9
`POST /demo/contact` + `utils/email.js` (AWS SES) — vedi piano §5. **Nota**: il piano stesso dichiara che questo endpoint riuserà lo stesso controllo `is_demo` del Task 4 — buon momento per estrarre un middleware condiviso `requireDemoTenant` invece di duplicare di nuovo l'inline guard (finding della code review di questa sessione, non ancora risolto).

### Backlog
- Task 6-9 del piano, vedi tabella sopra.
- Finding minori non risolti da questa sessione code review: estrarre `requireDemoTenant` middleware (vedi sopra); `logAudit`'s `userId` per `demo_role_switch` registra il nuovo dipendente non l'attore — verificare se è una convenzione violata altrove nel codebase.
- Decisione ancora in sospeso dalla Session 61: aggiungere un servizio Postgres reale alla pipeline CI GitHub Actions.
- Fragilità dei test demo-correlati sotto esecuzione parallela (vedi sopra) — non bloccante oggi, da monitorare.

---

## Note operative

- Invariate rispetto a Session 63: env file già copiati, `npm install` già eseguito, hotfix `auth.js` della Session 62 già presente in questo branch.
- **Nuovo**: se esegui i test backend con `npm test`/`test:coverage` in questo worktree e vedi un 409 inatteso su un test `/demo/start`, prova a rieseguire con `--runInBand` prima di sospettare una regressione reale — è quasi certamente l'interferenza tra worker paralleli descritta sopra, non un baco.
- Vedi `PROJECT_DECISIONS.md` Session 64 per il ragionamento completo dietro la race condition e la decisione di rimuovere il DELETE proattivo invece di scoping-are per jti.

---

Per riprendere: leggi questo file, poi il piano, poi `git log --oneline -6` per confermare lo stato, poi procedi dal Task 5/9 con `subagent-driven-development`.
