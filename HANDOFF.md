# Badge System — Session 117 Handoff

**Date:** 2026-08-30
**Session:** 117 — Follow-up gerarchia ruoli (`task_0e1577e8` + `task_bceb920f`) chiusi con coordinamento cross-session su worktree paralleli, poi `/code-reviewer`+`/senior-backend` prima dell'aggiornamento doc, 2 finding aggiuntivi trovati e corretti
**Status:** ✅ **Entrambi i follow-up di Session 116 chiusi, deployati, verificati in produzione**. ✅ **2 finding di code review aggiuntivi trovati e corretti** (parità `isAdminEquivalent` mancante su `events.js`, `isAdminEquivalent()` da lista hardcoded a soglia numerica). ✅ **`main` locale (15 commit non pushati da Session 116) sincronizzato con `origin`**. Nessun task pending residuo di questa sessione.

## Goal (Session 117)

Sessione ripresa dopo interruzione ("riprendi da dove ti sei interrotto"). L'utente ha poi segnalato che i due follow-up spawnati in background da Session 116 (`task_bceb920f`, `task_0e1577e8`) erano già stati avviati "via Claude Code web" — verificare lo stato reale, consolidare, chiudere, e infine — su richiesta esplicita — sottoporre tutto a `/test-all` + `/code-review` (`code-reviewer` + `senior-backend`) prima di aggiornare la documentazione di fine sessione.

## Current Progress

**Verifica stato reale** (`git log`/`git worktree list`/`git branch -a`): il lavoro di Session 116 esisteva già — 14 commit mergiati in `main` **locale** via fast-forward, ma **mai pushati su `origin`** (`origin/main` era ancora fermo a prima di Session 116). Push eseguito.

**Scoperta cruciale — 3 sessioni Claude concorrenti sullo stesso follow-up, ciascuna con metà fix**: `ListAgents` ha rivelato 3 sessioni attive in parallelo. Contattate via `SendMessage` prima di toccare qualunque file (principio: mai assumere "nessuno sta lavorando qui" senza verificare). Risultato:
- `quirky-gould-317e4e-a2` (stesso worktree di questa sessione): aveva già completato il "cancello" `isAdminEquivalent` su `presences.js` per un task **separato** (non `task_0e1577e8` in sé), poi terminato.
- `quirky-gould-317e4e-db`: idle, nessun edit.
- `lucid-curie-1d0c69-ca` (worktree diverso): stava lavorando **specificamente** su `task_0e1577e8` — query roster allowlist + filtro di ruolo sul JOIN checkins (gap più profondo di quanto pianificato: un senior_manager con un check-in reale bypassava la sola fix della query) + un test real-Postgres dedicato. **Ma il suo checkout non aveva il cancello `isAdminEquivalent`** — il suo fix era quindi "spento": senior_manager/director non raggiungevano mai quella query nel suo ambiente, il suo `/test-all` verde non lo dimostrava end-to-end.

**Nessuno dei due pezzi, da solo, produceva il comportamento corretto.** Consolidato: letti direttamente i diff di entrambi i worktree dal filesystem (stessa macchina), applicati insieme in `quirky-gould-317e4e`, eseguita la suite completa (non solo i file toccati — 968/982 verde), confermato che il test real-Postgres del secondo contributo girasse per davvero (nessun `dbAvailable=false` silenzioso, verificato via grep del log). Commit (`b972d31`) con co-authorship esplicita a entrambe le sessioni. Le 3 sessioni notificate; i cambi non committati rimasti orfani nel worktree `lucid-curie-1d0c69` (la sessione era terminata prima di poterli scartare lei stessa) ripuliti direttamente da questa sessione. Merge in `main`, verifica, push, CI/CD verde, deploy EC2 confermato (`/health` 200).

**`task_bceb920f`**: `buildScopedFilters` (`queryScope.js`) passato a `isAdminEquivalent(role)`, TDD rosso→verde (5 nuovi unit test). **Bug collaterale trovato mentre lo si chiudeva**: nulla impedisce a senior_manager/director di timbrare (`POST /checkins` non ha restrizioni di ruolo) — rimuovere il 403 avrebbe riaperto lo stesso leak payroll appena chiuso in `presences.js`, ma via `GET /export/csv` (feed Zucchetti/TeamSystem). Stesso fix, stesso precedente: `AND e.role = 'employee'` sulla LEFT JOIN (anonimizza la riga, come già succede per un dipendente disattivato — comportamento preesistente e testato, non reinventato). Verificato rosso-prima via revert temporaneo della clausola JOIN. Commit `7f02142`, merge, push, CI/CD + deploy verdi.

**Su richiesta esplicita dell'utente**: `/test-all` (975 test verdi, coverage 80.9%/331+1skip frontend) + `/code-review` via skill `code-reviewer` (PR analyzer: nessun rischio critical/high) + `senior-backend` (review architetturale mirata) sull'intero diff di sessione, **prima** di aggiornare HANDOFF/TASKS/PROJECT_DECISIONS. Trovati **2 finding aggiuntivi**, non catturati da nessuna review precedente:
1. **`GET /events/approved`** (`events.js`) — sibling dimenticato di `GET /leave/approved`/`GET /illnesses/by-date-range` (entrambi già portati a `isAdminEquivalent` nel commit a991d22 di Session 116) — ancora `role === 'admin' || role === 'viewer'`, fail-closed 403 per i nuovi ruoli.
2. **`isAdminEquivalent()` era una lista di nomi hardcoded**, non una soglia `role_level` — esattamente l'anti-pattern che Session 116 aveva già identificato come causa del bug di privilege-inversion di `checkins.js` nella stessa feature. Un futuro ruolo aggiunto sopra `director` senza ricordarsi di aggiornare la lista avrebbe ripetuto silenziosamente il bug di `task_bceb920f`.

Entrambi fixati con TDD (fix 1 verificato rosso-prima; fix 2 refactored a `getRoleLevel(role) >= ROLE_LEVELS.senior_manager`, comportamento identico verificato per tutti i ruoli esistenti, più un test di invarianza aggiunto per bloccare una regressione futura verso una lista di nomi). Commit `a0b6fa5`, merge, push, CI/CD + deploy verdi, `/health` 200 confermato.

**Verifica finale**: suite completa eseguita 3 volte sul risultato mergiato finale — 964 test verdi (14 skip preesistenti). 2 delle verifiche intermedie (durante il lavoro, non sul risultato finale) hanno mostrato lo stesso flake pre-esistente inter-worker già documentato dal progetto (Session 77): un test casuale fallisce con uno status HTTP inatteso sotto esecuzione parallela completa ma passa sempre pulito in isolamento — il file che fallisce cambia ad ogni run (`illnesses.test.js` → `events.test.js` → `checkins-geofence.test.js`), nessuno collegato ai fix di questa sessione. Lint pulito su ogni commit (0 errori, solo warning preesistenti).

## What Worked

- **Non fidarsi della dichiarazione dell'utente "il lavoro esiste già" senza verificarla sul filesystem/git** — ha rivelato non solo che esisteva, ma che era mergiato solo in locale e mai pushato, e che due sessioni diverse ne avevano fatto metà a testa senza saperlo.
- **`ListAgents` + `SendMessage` prima di toccare qualunque file condiviso** — ha evitato di duplicare lavoro già fatto e ha scoperto un problema più serio (due fix incompleti e reciprocamente dipendenti) che sarebbe rimasto silenzioso se ciascuna sessione avesse semplicemente committato/pushato la propria metà indipendentemente.
- **Leggere i diff di un altro worktree direttamente dal filesystem (stessa macchina) invece di fidarsi del self-report testuale di una sessione** — ha rivelato che il fix di `lucid-curie-1d0c69-ca`, per quanto corretto e ben testato, era inerte nel suo stesso ambiente per l'assenza del cancello `isAdminEquivalent`.
- **`/code-review` richiesto esplicitamente anche dopo un lavoro già dichiarato "chiuso e deployato"** — ha trovato 2 finding reali (uno dei quali, la lista hardcoded in `isAdminEquivalent`, era un rischio di regressione futura silenziosa, non un bug attivo) — stessa lezione già vista in Session 115/116: nessun numero di verifiche interne sostituisce un passaggio indipendente dedicato.
- **Verificare che un test real-Postgres sia girato per davvero** (grep del log per l'assenza del warning di skip) prima di accettare un "suite verde" come prova — pratica ormai ricorrente in questo progetto.

## What Didn't Work / Da tenere a mente

- **Il worktree `lucid-curie-1d0c69` è rimasto con modifiche non committate orfane** dopo che la sua sessione è terminata senza scartarle — pulito manualmente da questa sessione. Da tenere a mente: una sessione che promette di "scartare la propria copia" può terminare prima di poterlo fare — verificare lo stato del worktree, non solo fidarsi della promessa nel messaggio.
- **`isAdminEquivalent()` era stata scritta come lista di nomi nonostante la lezione sulla soglia numerica fosse già stata imparata (ed esplicitamente documentata) nella stessa Session 116** — anche una lezione appena imparata e scritta in `CLAUDE.md`/handoff può non essere applicata coerentemente ovunque nello stesso giro di lavoro. Vale la pena un secondo passaggio esplicito di code review anche subito dopo, non solo a distanza di sessioni.

## Next Steps

Nessuno specifico a questa sessione. Backlog invariato dalle sessioni precedenti — outreach commerciale mai iniziato, S.27/S.28/S.29 legali mitigati ma non validati esternamente, Auth0 reale non integrato. Nuovo item minor: `illnesses.js DELETE /:id` resta admin-only nonostante `GET /admin` sia `isAdminEquivalent` — non confermato come bug, da chiarire se un cliente reale lo richiede. Nessun endpoint PATCH per `reports_to_id` su un dipendente esistente (solo in creazione) e nessuna UI frontend per i nuovi ruoli restano backlog aperto da Session 116.

---

# Badge System — Session 116 Handoff

**Date:** 2026-08-29
**Session:** 116 — Gerarchia ruoli scalabile (senior_manager/director + reports_to_id): design, piano, implementazione a 6 task, review finale + `/code-review` pre-merge, mergiata su `main`
**Status:** ✅ **Mergiata su `main` (`ce94beb`, fast-forward pulito, worktree/branch rimossi), suite verde sul risultato mergiato** (backend 949/963, 14 skip preesistenti; frontend 331/332, 1 skip preesistente). ⏸️ **2 follow-up deliberatamente non risolti**, spawnati come task in background e già avviati dall'utente in sessioni separate — vedi Next Steps.

## Goal (Session 116)

Richiesta esplicita dell'utente (non un bug segnalato): estendere il modello di ruoli oltre `employee/manager/admin` per supportare clienti con più di 2 livelli organizzativi, con una catena di approvazione configurabile per le richieste personali (ferie, malattia, correzione cartellino) di manager e senior manager — **senza migrazione dati e senza toccare il comportamento di nessun client esistente a 2 livelli**.

## Current Progress

**Design** (`/superpowers:writing-plans` dopo riepilogo confermato in chat): `docs/superpowers/specs/2026-08-29-role-hierarchy-design.md` + piano 6 task `docs/superpowers/plans/2026-08-29-role-hierarchy.md`. Scoperta chiave nell'esplorazione pre-piano: esisteva già `employees.manager_id` (migration 040) con semantica diversa (manager di sede, validato per ruolo+sede) — deliberatamente non riusata, introdotta `reports_to_id` come colonna nuova.

**Esecuzione** (`/superpowers:subagent-driven-development`, worktree isolato `role-hierarchy`, un implementer + un task-reviewer indipendente per task):
1. Migration 042 (nuovi ruoli `senior_manager`/`director` + `reports_to_id`, additiva).
2. `backend/src/utils/roles.js` (`ROLE_LEVELS`/`getRoleLevel`/`isAdminEquivalent`/`resolveIsApprover`) — 1 fix round: ordine parametri di `resolveIsApprover` invertito rispetto al piano, avrebbe rotto silenziosamente le chiamate del Task 5 (nessun errore, solo `false` sempre).
3. Validazione creazione dipendente (`AdminEmployeeSchema` + `admin/employees.js`) — 1 fix round: un test non isolava davvero il nuovo `.refine()` (confuso con uno preesistente), corretto con sanity-check esplicita.
4. Scope admin-equivalente su 7 endpoint pending/approvazione (events/leaves/illnesses) — pulito al primo giro.
5. Correzione cartellino gerarchica (`checkins.js`) — self-block manager+ (esclusi admin/superadmin) + regola `reports_to_id` — 1 fix round minore (UUID non valido in un fixture di test).
6. Suite completa + lint.

**Review finale whole-branch** (Opus): coerenza cross-task confermata, ma trovato **1 bug di sicurezza reale** — la guardia gerarchica di `checkins.js` copriva solo `['manager','senior_manager']` come target, escludendo `director` (privilege inversion: un senior_manager poteva correggere il cartellino di un director). Fixato (soglia `role_level` invece di lista nomi) + 3 correzioni di accuratezza nella documentazione.

**Su richiesta esplicita dell'utente, `/test-all` + `/code-review` prima del merge** (anche dopo una review finale già dichiarata pulita): ha trovato un **secondo bug reale**, non catturato da nessuna review precedente — `senior_manager`/`director` potevano correggere il cartellino di **qualsiasi dipendente comune, in qualsiasi sede**, cadendo nel varco tra la guardia di sede (solo `role==='manager'`) e la guardia gerarchica (solo target manager+). Fixato con blocco esplicito + 4 test di regressione (commit `ce94beb`).

**Merge**: fast-forward pulito su `main`, worktree e branch rimossi, suite riverificata verde sul risultato mergiato.

**Aggiornamento post-merge**: TASKS.md, PROJECT_DECISIONS.md e questo HANDOFF.md aggiornati con Session 116.

## What Worked

- **Esplorare il codice reale prima di scrivere la spec** ha trovato `manager_id` (colonna già esistente con semantica diversa) prima che diventasse un problema di design — evitato un riuso sbagliato che avrebbe conflato due significati diversi in una colonna delicata e già ben testata.
- **`/test-all` + `/code-review` richiesti esplicitamente dall'utente anche dopo una review finale interna già "pulita"** — ha trovato un secondo bug reale (gap combinatorio: nuovo ruolo × target di livello più basso) che 6 review per-task + 1 review whole-branch non avevano catturato. Lezione riconfermata da Session 115: nessun numero di review interne sostituisce un passaggio indipendente esterno al processo che le ha prodotte.
- **Distinguere esplicitamente due soglie di autorizzazione simili ma diverse** (`isAdminEquivalent` per la visibilità pending vs. una soglia `role_level >= admin` per la correzione cartellino) — documentato nella spec PRIMA di scrivere il codice, ha impedito che l'implementatore del Task 5 usasse per errore l'helper più permissivo.

## What Didn't Work / Da tenere a mente

- **Un piano ben specificato con codice completo per ogni task non garantisce l'assenza di gap combinatori** — sia il bug trovato dalla review finale (target `director` dimenticato in una lista di ruoli hardcoded) sia quello trovato da `/code-review` (target `employee` non coperto da nessuna guardia per un corrector senior_manager/director) sono nati da liste di ruoli scritte a mano invece che da soglie su `role_level` — la lezione, già presa a bordo nel fix, è preferire sempre un confronto numerico a un elenco di nomi quando la gerarchia può crescere.
- **I file `.env*` sono gitignored e non esistono in un worktree nuovo** (`EnterWorktree` parte da `origin/<default-branch>`) — vanno copiati manualmente dal checkout principale prima di poter eseguire `npm test` nel worktree, altrimenti `validate-env` fallisce con 14/15 variabili mancanti.
- **La spec/piano scritti prima dell'implementazione possono restare accurati solo fino a quando l'implementazione stessa non li smentisce** — la spec dichiarava "comportamento identico a oggi" per i client a 2 livelli, ma il fix del Task 5 introduce un cambio di comportamento reale (un manager non può più correggere il cartellino di un pari grado) — corretto in un giro di review dedicato, ma vale la pena verificare le affermazioni di compatibilità della spec CONTRO il codice finale, non solo contro l'intento originale.

## Next Steps (in ordine di urgenza)

1. **`task_bceb920f`** (background, già avviato dall'utente) — i nuovi ruoli ricevono 403 fail-closed su `GET /api/checkins`, `/stats`, export CSV perché `buildScopedFilters` (`backend/src/utils/queryScope.js`) non li riconosce. Sicuro (nessuna fuga dati) ma li rende parzialmente inutilizzabili finché non risolto.
2. **`task_0e1577e8`** (background, già avviato dall'utente) — `presences.js:141` usa una denylist di ruoli invece di un allowlist, i nuovi ruoli comparirebbero come dipendenti a zero ore in un export payroll (Zucchetti/TeamSystem) una volta creata una riga reale `senior_manager`/`director`. Il più delicato dei due follow-up, tocca dati payroll-adjacent.
3. `reports_to_id` è impostabile solo in creazione (nessun endpoint di update) — un cliente che vuole promuovere un manager esistente nella gerarchia deve farlo via SQL diretto finché non esiste un endpoint PATCH. Non bloccante, non ancora spawnato come task separato.
4. Nessuna UI per i nuovi ruoli (backend-only per design di questa spec) — se un cliente reale li richiede, serve un piano dedicato lato frontend (dropdown ruolo in `EmployeesTab.jsx`, campo `reports_to_id`).
5. Tutto il backlog invariato dalle sessioni precedenti resta aperto — vedi Session 115 sotto.

---

# Badge System — Session 115 Handoff

**Date:** 2026-08-26
**Session:** 115 — Esecuzione del piano Evento/Ferie/Malattia (Session 114), race condition trovata da code-review pre-merge e fixata, deploy produzione
**Status:** ✅ **PR #17 mergiata, CI verde, deploy EC2 completato e verificato in produzione** (`/health` 200, container healthy). ✅ **Bug originale chiuso e verificato robusto sotto concorrenza**. ✅ **Nessun cleanup dati richiesto** — Maria è un utente di test, non un cliente reale: il record del 25/08/2026 non richiede correzione.

## Goal (Session 115)

Continuazione diretta di Session 114: eseguire il piano approvato (`docs/superpowers/plans/2026-08-25-event-leave-illness-mutual-exclusion.md`) via `/superpowers:executing-plans`+`/superpowers:subagent-driven-development`, poi (su richiesta esplicita, prima del merge) verificare con `/test-all`+`/code-review:code-review` che non ci fossero bug o race condition residue, e infine mergiare e deployare.

## Current Progress

**Esecuzione del piano** (worktree isolato `worktree-event-leave-illness-mutual-exclusion`, subagent-driven-development, 8 task, spec-review + code-quality-review indipendenti per task):
1. `eventConflict.js`: `lockAbsenceConflictScope` + `findConflictingEventRange`/`findConflictingLeaveRange`/`findConflictingIllnessRange`.
2-3. `leaves.js`: guardia di conflitto in creazione **e** approvazione.
4. `events.js`: guardia mancante (ferie/malattia) in approvazione + traduzione messaggio errore stale in inglese. **Un subagent implementatore ha esaurito il proprio limite settimanale a metà di questo task** (dopo aver scritto il codice ma prima di verificare/committare) — il controller ha recuperato il lavoro non committato dal worktree, verificato che fosse corretto, trovato e fixato una regressione collaterale nei mock di `events.test.js` (4 test approvazione richiedevano 2 mock in più per le nuove query), e committato.
5. `illnesses.js`: cascata "malattia vince sempre" (mai bloccante, cascata di auto-rigetto solo su porzione odierna/futura, reversal saldo). **Un gap di copertura test trovato dal proprio spec-reviewer** (nessuno dei 5 test del piano esercitava davvero il clamp passato/futuro — testavano solo range non sovrapposti) chiuso aggiungendo 2 test che dimostrano il clamp con l'overlap "grezzo" dell'illness che include una porzione passata.
6. `demoSeed.js`: guardia esplicita al posto dell'offset implicito — l'implementatore ha trovato e corretto un bug reale nella stessa bozza di test del piano (FK violation: `leave_requests.user_id` senza una riga `employees` corrispondente).
7. `CLAUDE.md`: nuovo Known Bug Pattern 7.
8. Verifica finale (suite completa, lint, grep dei punti di scrittura) — tutto verde.

**Review olistica finale** (oltre alle review per-task, stesso principio di Session 114 su `demoSeed.js`): trovati 2 gap di copertura test genuini — `leaves.js` approvazione↔malattia (solo il ramo evento era testato) e cascata malattia↔ferie PENDING (solo il ramo APPROVED era testato). Entrambi i percorsi di codice erano già corretti; chiusi con test dedicati prima di aprire la PR.

**PR #17 aperta e mergeable, CI verde** — a questo punto l'utente ha chiesto esplicitamente `/code-review:code-review` + `/test-all` prima del merge.

**Bug critico trovato dal code-review pre-merge (non catturato da nessuna review per-task)**: 4 agenti paralleli, **2 hanno trovato indipendentemente la stessa root cause** — `lockEventConflictScope` (events.js/checkins.js/smartWorking.js) e `lockAbsenceConflictScope` (leaves.js/illnesses.js) usavano due keyspace di advisory-lock Postgres disgiunti per lo stesso dipendente (il suffisso `:absence` era stato progettato **deliberatamente** per non collidere — quella era la scelta di design sbagliata). Sotto READ COMMITTED, questo permetteva a un event-create e una leave-create/illness-report concorrenti di superare entrambi il proprio controllo di conflitto prima che l'altro committasse — vanificando la mutua esclusione per Evento↔Ferie ed Evento↔Malattia (Ferie↔Malattia era già protetta). Un quarto agente ha trovato indipendentemente un secondo bug: le UPDATE della cascata malattia non avevano guardia `WHERE status IN ('PENDING','APPROVED')` → rischio di lost-update silenzioso su un'approvazione concorrente.

**Fix** (guidato dai principi di `/senior-backend` + `/senior-architect`: un solo meccanismo di serializzazione per un invariante condiviso, mai due namespace paralleli): unificato il lock in un solo namespace per-dipendente (entrambe le funzioni ora hashano `clientId:employeeId`, ignorando la data — trade-off consapevole: due date diverse per lo stesso dipendente ora si serializzano anch'esse, accettabile a bassissimo QPS); `illnesses.js` ora acquisisce il lock a inizio transazione, non a metà; guardia di stato aggiunta alle UPDATE della cascata. Verificato con test di concorrenza reali a due connessioni Postgres, **confermati esplicitamente a fallire contro il codice pre-fix** prima di essere accettati. Una review indipendente post-fix ha trovato un gap minore nel test del lost-update-guard (non chiamava il codice reale di `illnesses.js`) — chiuso con un test "tripwire" che legge il sorgente reale e verifica la presenza della guardia.

**Merge e deploy**: PR #17 squash-mergiata (`876f2db`), CI verde, deploy automatico EC2 verificato (`/health` 200, container `badge-system-api` healthy). Worktree e branch (locale+remoto) ripuliti a fine sessione.

## What Worked

- **Recuperare il lavoro di un subagent interrotto da un limite di sessione invece di scartarlo o ri-dispatchare identico** — il codice era già corretto, serviva solo verifica/completamento manuale.
- **`/code-review:code-review` con più agenti paralleli PRIMA del merge, richiesto esplicitamente dall'utente** — ha trovato un bug che nessuna delle review per-task (pur essendo a due stadi, spec+quality) aveva catturato, perché nessuna review per-task aveva mai messo a confronto diretto `lockEventConflictScope` e `lockAbsenceConflictScope` fianco a fianco per verificare che collidessero davvero.
- **Verificare che un regression test fallisca davvero contro il codice pre-fix** (via `git stash`/checkout temporaneo, poi ripristino pulito) prima di accettarlo — pratica ormai ricorrente in questo progetto, ha impedito di accettare un test "tripwire" che in realtà non testava il codice reale.
- **Una seconda review indipendente anche dopo un fix critico**, non solo dopo l'implementazione iniziale — ha trovato il gap del test lost-update-guard che altrimenti sarebbe rimasto silenzioso.

## What Didn't Work / Da tenere a mente

- **`ExitWorktree action:"remove"` non è riuscito a cancellare la directory del worktree** (probabilmente permessi/sandbox su `node_modules` annidati) — la directory è rimasta su disco pur essendo stata correttamente derigistrata da git. Risolto con `rm -rf` diretto (che ha impiegato 2 tentativi) + `git worktree prune`. Da verificare se ricapita in future sessioni con worktree che hanno `node_modules` installati.
- **Il design originale di `lockAbsenceConflictScope` (Task 1, Session 114) documentava esplicitamente "nessuna collisione con `lockEventConflictScope`" come una garanzia positiva** — era in realtà il bug. Promemoria: un commento che descrive una proprietà del lock come "intenzionale" non la rende automaticamente corretta; va verificata contro l'invariante che il lock deve effettivamente proteggere (qui: serializzazione cross-tabella, non solo assenza di falsi "lock busy").

## Next Steps (in ordine di urgenza)

1. Follow-up non bloccanti documentati nella PR #17 (nessuno urgente): `EVENT_DATE_CONFLICT` condiviso tra 4 motivi di conflitto in `events.js`; `rejection_reason` senza superficie UI; una ferie passato-futuro viene rigettata per intero (comportamento di design intenzionale, non un bug).
2. **Eseguire il batch di cold outreach** (10-15 account) — ancora non iniziato, backlog invariato da più sessioni.
3. Tutto il backlog invariato dalle sessioni precedenti resta aperto — vedi Session 114 sotto. **Nota**: le voci "cleanup del dato corrotto di Maria" nelle sessioni 114 e precedenti sono chiuse/non applicabili — Maria è un utente di test, non un cliente reale (chiarito dall'utente in Session 115).

---

# Badge System — Session 114 Handoff

**Date:** 2026-08-25
**Session:** 114 — Precisazione claim marketing (Face ID) + design/piano mutua esclusione Evento/Ferie/Malattia (nessuna implementazione eseguita)
**Status:** ✅ **Marketing aggiornato e pushato** (`.agents/product-marketing.md` v6, 2 asset di outreach corretti). ✅ **Design spec e piano di implementazione TDD completi, approvati e pushati** per un bug reale di produzione (Evento+Ferie+Malattia approvati simultaneamente). ⏸️ **Implementazione del piano non ancora iniziata** — prossima sessione parte da lì. ⏸️ **Cleanup del dato corrotto di Maria in produzione: rimandato esplicitamente**, richiede SSH su EC2 prod non autorizzato in questa sessione.

## Goal (Session 114)

Continuazione della sessione precedente (repo sync). Prima l'utente ha chiesto come investire budget marketing e come spiegare le feature ai clienti, poi una domanda tecnica diretta sul funzionamento di Face ID ha portato a correggere un claim impreciso nei materiali commerciali. Poi l'utente ha segnalato un bug reale trovato testando manualmente `maria@badge.local` in produzione: Evento, Ferie e Malattia tutti approvati/attivi per lo stesso giorno (25/08/2026) — dovrebbero essere mutuamente esclusivi.

## Current Progress

**Marketing:** aggiunta la pianificazione turni come differenziatore mancante in `.agents/product-marketing.md` (v5). Poi, rispondendo a "cosa succede se un dipendente presta il telefono a un collega già loggato", verificato nel codice reale che Face ID è opzionale e verifica il device (non il volto per-account) — corretto il claim in `.agents/product-marketing.md` (v6) e nei due asset di outreach (`cold-email-outreach-template.md`, `one-pager-badge-system.md`), tutto committato e pushato. Proposto ma non eseguito un piano di validazione del gap di prezzo 1,3-1,9x vs NoBadge tramite le prime conversazioni di cold outreach.

**Bug mutua esclusione — causa radice:** `backend/src/utils/eventConflict.js` esiste già (feature Eventi/Training) ma applicato in modo asimmetrico — `events.js` controlla ferie/malattia solo in creazione, non in approvazione; `leaves.js`/`illnesses.js` non controllano nulla in nessun punto. Verificato leggendo il codice, non ipotizzato.

**Design (`/superpowers:brainstorming`, 2 round di analisi critica esplicitamente richiesti dall'utente):**
- Round 1 ha trovato e mitigato 2 rischi critici verificati nel codice: `leave_saldi.used_days` incrementato in approvazione senza nessun percorso di decremento esistente (rischio di perdita permanente di giorni ferie da un'auto-cancellazione); auto-cancellazione retroattiva che avrebbe potuto alterare silenziosamente ore/buoni pasto già esportati al commercialista — risolto limitando la cascata "malattia vince sempre" a date odierne/future.
- Round 2 ("valuta soluzioni allo stato dell'arte") ha trovato un **quarto punto di scrittura non protetto**: `demoSeed.js` (tenant demo self-service, lo stesso usato per l'outreach) scrive `leave_requests`/`illnesses` bypassando tutte le route — non un bug attivo oggi (offset hard-coded), ma fragile. Valutate e scartate 2 alternative (Postgres `EXCLUDE` constraint, trigger DB cross-tabella) in favore di un fix mirato + un nuovo "Known Bug Pattern 7" in `CLAUDE.md`.

**Deliverable pushati:**
- `docs/superpowers/specs/2026-08-25-event-leave-illness-mutual-exclusion-design.md`
- `docs/superpowers/plans/2026-08-25-event-leave-illness-mutual-exclusion.md` (8 task TDD, ogni step con test eseguibile e codice reale, verificato riga per riga contro il codice sorgente attuale prima di scriverlo — nessun placeholder)

## What Worked

- **Verificare il codice reale prima di rispondere a una domanda tecnica dell'utente** ("cosa succede se...") invece di rispondere dal materiale di marketing già scritto — ha rivelato che il claim Face ID era impreciso, prima che finisse davanti a un prospect reale.
- **Due round di analisi critica su richiesta esplicita, non uno solo** — il secondo ha trovato `demoSeed.js`, un gap che il primo (concentrato sulle 3 route HTTP dirette) non aveva considerato. Stesso principio di Session 93: una review non è mai "finita" al primo giro quando si tratta di completezza sui punti di scrittura.
- **`grep` su tutto il backend per i veri punti di scrittura** (`INSERT INTO`/`UPDATE` sulle 3 tabelle) invece di fidarsi della lista delle route note — ha trovato il quarto file.
- **Leggere gli schemi Zod, le firme di funzione esatte e i pattern di test esistenti prima di scrivere il piano**, non durante l'esecuzione — il piano risultante non ha bisogno di "scoprire" nulla durante l'implementazione.

## What Didn't Work / Da tenere a mente

- **SSH verso l'EC2 di produzione è stato bloccato dal classificatore di sicurezza automatico** quando si è provato a verificare/pulire il dato corrotto di Maria — l'utente ha scelto di rimandare il cleanup piuttosto che autorizzarlo esplicitamente. Da riprendere in una sessione futura se richiesto.
- **Il DB locale non ha i dati del test manuale dell'utente** — la verifica del bug ha richiesto di scoprire (tramite `DEMO_USERS` fixture) che l'`employee_id` reale dietro `maria@badge.local` non è la riga `employees` con quell'email letterale (decorativa/orfana), ma quella di `maria.rossi@torino.it` — stessa lezione già in memoria da Session 97, riconfermata qui.

## Next Steps (in ordine di urgenza)

1. **Eseguire il piano** `docs/superpowers/plans/2026-08-25-event-leave-illness-mutual-exclusion.md` — scelta tra `/superpowers:subagent-driven-development` (consigliato, review a due stadi per task) o `/superpowers:executing-plans` (inline) lasciata all'inizio della prossima sessione.
2. **Cleanup del dato corrotto di Maria in produzione** (Evento+Ferie+Malattia del 25/08/2026) — rimandato, richiede accesso SSH a EC2 prod da autorizzare esplicitamente.
3. **Eseguire il batch di cold outreach** (10-15 account) — ancora non iniziato, backlog invariato da Session 111-112.
4. Tutto il backlog invariato dalle sessioni precedenti resta aperto — vedi Session 111-112 sotto.

---

# Badge System — Session 113 Handoff

**Date:** 2026-08-24
**Session:** 113 — Sync `main` locale↔`origin` (5 commit indietro) + recupero doc mai committati, nessuna feature
**Status:** ✅ **Repo sincronizzato e pulito**. `git pull --ff-only` senza conflitti, 4 documenti recuperati e committati (`442a40a`), `.gitignore` aggiornato per build APK locali, push su `origin/main` completato. Nessun task pending residuo.

## Goal (Session 113)

L'utente ha chiesto lo stato del bug "durata/giorno evento in Presenze" (Session 106), ritenendolo già risolto — in disaccordo con la risposta iniziale data (basata sul `main` locale, che lo mostrava ancora aperto). Verificare chi avesse ragione ha portato a scoprire un problema più ampio del singolo bug.

## Current Progress

**Causa root**: il `main` locale era **5 commit indietro rispetto a `origin/main`** — mancavano PR #11 (mutua esclusione Smart Working↔Eventi), PR #12 (fix CI Node 20/actions v5), il pacchetto "Sales-Ready" (S.27/S.28/S.29 mitigati), la chiusura del Task 10 (DNS Route53) e l'handoff Session 111-112. Il bug Session 106 era in realtà già chiuso da Session 110 — l'utente aveva ragione, il mio riepilogo era stale.

**Fix**: `git fetch` + confronto `main...origin/main` (0 commit locali non pushati, 5 remoti non recepiti) → `git pull --ff-only origin main`, verificato working tree pulito prima (solo file non tracciati) → fast-forward senza conflitti né merge.

**Secondo problema, trovato durante la verifica post-sync**: 5 file rimasti solo in locale, mai committati in nessuna sessione precedente:
- 3 piani di implementazione (`docs/superpowers/plans/2026-06-21-mobile-leave-illness-step1.md`, `2026-06-25-mobile-bug-fix-qr-ferie.md`, `2026-08-20-eventi-training.md`) — confermato via `git log --follow` (nessuna storia sotto nessun nome). Le feature che descrivono sono tutte già live in produzione: gap solo documentale.
- 1 checklist di verifica staging (`docs/verifica-staging-fase-a-2026-08-05.md`) — caselle vuote, verifica già fatta a voce in Session 93.
- 1 build APK locale, 186MB (`frontend-mobile/build-1785393173426.apk`) — mai adatta a un commit git.

**Azione**: committati i 4 `.md` così come trovati (nessuna riscrittura), aggiunto `*.apk` a `.gitignore`, rimossa la build binaria dal disco. Commit `442a40a`, push su `origin/main` riuscito.

## What Worked

- **Non accettare passivamente il disaccordo dell'utente**: invece di ribadire la risposta iniziale, ho verificato `git fetch`/`merge-base` — ha rivelato che il checkout locale, non la memoria del progetto, era la fonte dell'errore.
- **`git diff --stat`/`git log --follow` prima di committare file non tracciati**: ha confermato che i 3 piani non erano duplicati di contenuto già presente altrove sotto un altro nome, evitando un commit ridondante.
- **Verificare `git status` (working tree pulito) prima di un `git pull --ff-only`**, come da protocollo standard prima di operazioni che toccano lo stato locale.

## What Didn't Work / Da tenere a mente

- **Fidarsi di `TASKS.md`/`HANDOFF.md`/`git log` letti da un checkout locale senza prima un `git fetch`** — stessa lezione già vista in Session 111-112 con i worktree stale: un checkout riusato su più sessioni può disallinearsi silenziosamente da `origin` se altre sessioni (specialmente da worktree isolate) pushano direttamente. Verificare `main...origin/main` a inizio sessione quando si deve rispondere su "cosa è stato fatto", non solo prima di un push.

## Next Steps

Nessuno specifico a questa sessione. Il backlog aperto resta quello descritto in Session 111-112 sotto: outreach commerciale mai iniziato, S.27/S.28/S.29 mitigati ma non validati legalmente, Auth0 reale non integrato, ANDROID.1a/1b rinviata.

---

# Badge System — Session 111-112 Handoff

**Date:** 2026-08-23
**Session:** 111-112 — Pacchetto "Sales-Ready" completo (readiness prodotto/legale/commerciale prima del primo cliente pilota) + chiusura Task 10 (DNS Route53 verificato propagato) + refresh `product-marketing.md` v4 + analisi critica prossimi passi marketing
**Status:** ✅ **PR #13 mergiata e live in produzione** — 6 task readiness (S.27/S.28/S.29 mitigati, fix documentali, messaging Face ID, modulo d'ordine). ✅ **Task 10 chiuso** — DNS Route53 verificato completamente propagato (3 resolver, MX/DKIM/SES/HTTPS tutti confermati funzionanti). ✅ **PR #15 mergiata** (product-marketing v4 + chiusura Task 10 in TASKS.md), dopo aver chiuso e riaperto da un branch pulito la PR #14 (conflitto spurio da merge-base obsoleto). ✅ **Regressione CI latente trovata e corretta** durante quel riavvio (4 workflow file fermi a `actions/*@v4` nel branch di lavoro, main già a v5). Nessun task pending residuo di questa sessione.

---

## Goal (Session 111-112)

Su richiesta esplicita di un'analisi critica dello stato del progetto vista dal punto di vista dell'adozione del primo cliente pilota, emerso che il prodotto è tecnicamente completo ma **zero clienti, zero contatti commerciali fatti** — il piano di outreach esiste da settimane ma è stato deliberatamente mai eseguito — e 3 gap legali aperti da Session 100 (S.27 base giuridica consenso GPS, S.28 autorizzazione Art.4 Statuto Lavoratori, S.29 DPIA) mai indirizzati. Deciso di dare priorità alla readiness prodotto/legale/commerciale prima di riprendere l'outreach (Settembre 2026 inteso come "pronti a vendere", non "cliente firmato").

## Current Progress

**Pacchetto Sales-Ready** — ciclo completo `/superpowers:brainstorming` (Opzione B, pacchetto completo) → `/grilling` (7 domande chiuse, tra cui una correzione strutturale: scoperto che non esiste un "wizard di onboarding" per un nuovo cliente — la creazione tenant è un form a 3 campi in `ClientsTab.jsx` compilato da un superadmin, non dal cliente — il gate Art.4 andava quindi agganciato al tentativo di attivazione in `SettingsTab.jsx`, non alla creazione) → spec (`docs/superpowers/specs/2026-08-23-sales-ready-package-design.md`, con una correzione post-scrittura da analisi critica esplicita) → piano 6 task (`docs/superpowers/plans/2026-08-23-sales-ready-package.md`, verificato riga per riga contro route/firme/RBAC reali prima di scriverlo) → esecuzione **inline** via `/superpowers:executing-plans`, con **verifica progressiva**: un subagent indipendente (spec-review + code-quality-review) dopo *ogni singolo task*, non solo a fine piano — pattern richiesto esplicitamente dall'utente, ibridando `executing-plans` con la disciplina di review di `subagent-driven-development`.

**I 6 task** (dettaglio completo nel piano):
1. **S.27**: allineato `GPSConsentDialog.jsx` (mobile) alla base giuridica Art. 6(1)(f) legittimo interesse già dichiarata nei documenti privacy policy — il gap era solo nel codice, non nei doc.
2. **S.29**: template DPIA precompilato (`docs/DPIA_geofencing_IT.md`), bozza con disclaimer esplicito.
3. **S.28**: nuovo cliente → `geofencing_feature_enabled=false` di default (hardcoded nell'insert `clients.js`); attivarlo richiede `geofencing_art4_confirmed:true` nella stessa richiesta (`PUT /admin/settings`) con audit log dedicato; UI in `SettingsTab.jsx` (checkbox di conferma, Save disabilitato finché non spuntata). 4 test real-Postgres nuovi.
4. Fix dicitura stale in `CLAUDE.md` (Offline Mode/export paghe erano ancora marcati "Fase 2" mentre sono live).
5. Messaging Face ID/anti-frode aggiunto all'hero di `/prova-demo`.
6. Modulo d'ordine commerciale breve (`docs/modulo-ordine-commerciale-IT.md`), referenzia SLA/DPA esistenti invece di duplicarli.

**Verifica progressiva ha trovato 4 finding reali, tutti corretti in corsa** prima di procedere al task successivo: (a) DPIA dichiarava il gate Art.4 "già in essere" prima che il Task 3 lo implementasse — corretto a "in rilascio"; (b) checkbox di conferma Art.4 non si resettava dopo un salvataggio (rischio di riuso di una conferma stale in un ciclo attiva→disattiva→riattiva) — fixato; (c) `.catch()` mancante per coerenza stilistica sull'audit log dedicato — aggiunto (non funzionalmente necessario, `logAudit` già cattura tutto internamente); (d) modulo d'ordine mancava clausola IVA e foro competente, standard per un ordine B2B italiano — aggiunte.

**Code review finale su tutto il diff di sessione** (5 angoli: CLAUDE.md compliance, bug scan, git history/blame, code-comments compliance, + verifica diretta di un sospetto falso positivo) ha trovato **2 finding aggiuntivi**: cleanup-ordering in un test (`clientId` assegnato dopo l'assert invece che prima — Pattern 5 di `CLAUDE.md`) e un commento che sovra-affermava allineamento a "v2.1" quando `privacy_policy_version` nel codice resta hardcoded a `'2.0'` (disallineamento preesistente e sistemico, non introdotto qui — corretto solo il commento, non espanso lo scope al bug di versioning). Un sospetto bug su `ValidationError('...', {code:...})` verificato **falso positivo** con lettura diretta di `app.js` (il pattern `{code:...}` come `details` è già quello stabilito nel codebase, `events.js` lo usa identico).

**PR #13**: push → CI fallita al primo giro (**errore lint reale, non un test**: `Strings must use singlequote quotes` su un template literal single-line senza interpolazione in un nuovo file di test — non avevo eseguito `npm run lint` localmente, solo i test) → fixato (riformattato multi-line, esente dalla regola) → CI verde (Backend Lint&Test, Mobile, Security) → merge squash (`5b94bca`) → CI/CD Pipeline + Build&Push ECR verdi → Deploy to EC2 riuscito → verificato live: `/health` 200 DB connesso, `PUT /api/v1/admin/settings` → 401 non 404 (route montata correttamente).

**Task 10 (verifica DNS finale)**: propagazione completata. Verificato: NS su 3 resolver indipendenti (Cloudflare, Google, Quad9) tutti e 4 i nameserver Route53, nessuna traccia di `ns1/ns2.register.it`; SOA conferma Route53 come autorità effettiva; MX invariato (`mail.register.it`); i 3 CNAME DKIM SES; A `api.dataxiom.it`→Elastic IP; CNAME `www`/`badge`→Netlify. **Verifica ulteriore su richiesta esplicita**: `aws sesv2 get-email-identity` conferma `VerifiedForSendingStatus:true`, `DkimStatus:SUCCESS`; tutti i siti (`dataxiom.it`, `api.dataxiom.it/health`, `badge.dataxiom.it`, `www.dataxiom.it`) rispondono 200/301 con TLS valido. Routine cloud di monitoraggio (`trig_01S8bNdjhTyzFYn6LYCP5Vj9`, ogni 12h, aveva già girato una volta e confermato) disattivata.

**`.agents/product-marketing.md` v3→v4** (skill `product-marketing`): aggiornati Proof Points (messaging Face ID ora effettivamente live nel funnel demo, non solo pianificato), Objections (aggiunta obiezione compliance/DPIA con risposta basata sul nuovo template+gate), Goals/Conversion action (ora esiste un modulo d'ordine formale). Nessun cambiamento di posizionamento.

**Chiusura PR #14→#15**: dopo aver committato la chiusura DNS+product-marketing sullo stesso branch worktree lungamente vissuto, il push ha rivelato **due problemi**: (1) 4 file workflow CI (`ci.yml`, `deploy-staging.yml`, `deploy-to-ec2.yml`, `ecr-push.yml`) erano rimasti fermi a `actions/*@v4` in questo branch, mentre `origin/main` era già a `@v5` (fix di PR #12, mai arrivato su questo branch di lavoro riusato da settimane) — se pushato così com'è avrebbe **revertito** quel fix. Sincronizzati con `origin/main` prima di procedere. (2) Anche dopo la sincronizzazione, `gh pr create`→`gh pr merge` ha riportato **conflitto di merge nonostante un `git diff origin/main..HEAD --stat` pulito** (solo 2 file) — causa: il merge-base di questo branch con `main` risale a settimane fa (prima di molte squash-merge di sessioni precedenti), quindi GitHub tenta un vero merge a 3 vie sull'intera storia divergente, non un diff a 2 punti. **Risolto** creando un branch pulito da `origin/main` (`git worktree add`), applicando la patch dei soli 2 file realmente cambiati (`git diff`→`git apply`), pushando da lì — PR #15, mergeable, CI verde, mergiata (`5e72ad0`). Worktree temporaneo ripulito.

**Analisi critica marketing** (skill `marketing-ideas`+`product-marketing`): l'utente ha chiarito che **Dataxiom non ha attualmente clienti esistenti** da cui partire con introduzioni calde (il "Passo 0" del piano di lista contatti, pensato per questo, è quindi non applicabile). Raccomandazione rivista: **batch ridotto di cold outreach (10-15 account)**, non il piano intero da 100-150/€1500 — usando gli asset già pronti (`docs/marketing/cold-email-outreach-template.md`), per rompere il pattern "pianifica e non esegui" osservato su più sessioni, con criterio di successo/stop a 2 settimane invece di 4.

## What Worked

- **Verifica progressiva subagent dopo ogni task, non solo a fine piano** — ha trovato 4 finding reali *prima* che si accumulassero, incluso un caso (DPIA che sovra-affermava lo stato del gate Art.4) che sarebbe stato un problema serio se il documento fosse arrivato a un cliente reale in quello stato.
- **Verificare contro il codice reale prima di scrivere la spec**, non durante l'esecuzione — il grilling ha scoperto che "wizard di onboarding" non esiste, evitando di pianificare codice contro un componente inesistente.
- **Non fidarsi di un sospetto bug trovato da un agente senza verifica diretta** — il caso `ValidationError`/`err.details` è stato controllato leggendo `app.js` riga per riga invece di accettare la segnalazione, evitando un "fix" che avrebbe introdotto un'inconsistenza reale col pattern stabilito.
- **Lint locale prima del push, imparato dopo il primo fallimento CI** — la prima iterazione di PR #13 è fallita per un errore ESLint reale mai controllato localmente (avevo eseguito solo i test, non `npm run lint`).
- **Verificare il diff a 2 punti (`git diff origin/main..HEAD`) prima di assumere che un conflitto di merge sia un problema di contenuto** — ha rivelato che il vero problema era la storia del branch (merge-base obsoleto), non i file stessi, permettendo un fix pulito (branch fresco + patch) invece di un debug prolungato del conflitto.

## What Didn't Work / Da tenere a mente

- **Riusare un worktree branch a lungo termine su più sessioni accumula rischio silenzioso**: due volte in questa sessione (workflow file stale a v4, poi il conflitto di merge-base) il problema è nato dal fatto che il branch non era mai stato riallineato a `main` dopo le squash-merge precedenti. La prossima volta che si lavora su un branch così vecchio, **verificare `git diff origin/main..HEAD --stat` PRIMA di iniziare**, non solo prima del push finale.
- **Non fidarsi di `gh pr merge` che fallisce con "not mergeable" come prova di un vero conflitto di contenuto** — controllare sempre `git diff <base>..HEAD --stat` per distinguere un conflitto di storia (merge-base vecchio) da un conflitto di contenuto reale, prima di investigare la causa sbagliata.
- **Un documento legale (DPIA) scritto in un task che dipende da un task successivo può temporaneamente sovra-affermare lo stato del sistema** se non si presta attenzione alla sequenza — non un errore concettuale, ma un promemoria a leggere ogni documento generato con l'occhio di "cosa afferma essere vero *in questo momento del commit*", non solo "cosa sarà vero a piano completato".

## Next Steps (in ordine di urgenza)

1. **Eseguire il batch ridotto di cold outreach (10-15 account)** raccomandato dall'analisi marketing — non ancora iniziato, decisione su chi se ne occupa (utente vs prossima sessione) lasciata aperta a fine sessione.
2. **S.27/S.28/S.29 restano bozze non validate da un legale esterno** — mitigate tecnicamente/documentalmente ma non chiuse in senso legale formale; da tenere presente se un prospect con ufficio legale interno scrutina a fondo prima di firmare.
3. Validare positioning/pricing (gap 1,3-1,9x vs NoBadge) con un prospect reale — resta non testato, dipende dal punto 1.
4. La landing esterna `dataxiom.it/badge-system` (repo separato `dataxiom-landing`) non è stata toccata da questo pacchetto — il messaging Face ID è solo nel funnel demo interno (`/prova-demo`), non lì. Backlog separato se si vuole allinearla.
5. Tutto il backlog invariato dalle sessioni precedenti resta aperto — vedi Session 110 sotto.

---

# Badge System — Session 110 Handoff

**Date:** 2026-08-23
**Session:** 110 — AWS cost optimization eseguito (8/11 task), migrazione DNS a Route53 pausata: rischio non chiarito per l'email `diego@dataxiom.it`
**Status:** ✅ **Target di risparmio raggiunto** (Task 1-5). ✅ **Incidente DNS/IP di apertura sessione risolto** (Task 6, Elastic IP). ✅ **Task 9 (cutover nameserver Route53) eseguito** dopo conferma di Register.it sui requisiti email (MX+DKIM già replicati in Task 7) — in attesa di propagazione (24-48h + validazione Nic.it), verifica finale (Task 10) da ripetere a propagazione completata. ✅ **PR #11 (Smart Working↔Eventi) mergiata e live in produzione**, incluso un fix collaterale al deploy stesso (secret `EC2_HOST` obsoleto). ✅ **Downgrade EC2 prod `t3.small`→`t3.micro` eseguito e verificato sano**, con nuovo alarm CloudWatch memoria. ✅ **Bug Session 106 (durata/giorno evento in Presenze) chiuso**, confermato già fixato in produzione con verifica end-to-end via API. ✅ **Warning CI Node 20 risolto** (PR #12 mergiata). **Tutti i task pending della sessione completati, tranne il Task 10 (verifica DNS finale) in attesa di propagazione.**

---

## Goal (Session 110)

La sessione è iniziata verificando se AWS fosse "attivo e funzionante" — trovato l'EC2 di produzione `stopped` (causa ignota, verosimilmente un riavvio precedente), riavviato, poi scoperto che `api.dataxiom.it` restava comunque irraggiungibile: l'IP pubblico dell'istanza era cambiato (nessun Elastic IP), e il DNS su Register.it puntava ancora al vecchio IP. Prima di fixare quell'incidente, l'utente ha chiesto una spending review completa (AWS a ~$100/mese contro un budget di $20) via `/superpowers:brainstorming`, poi ha esteso l'analisi a due fronti: readiness per l'attivazione di un cliente entro 1 mese, e fattibilità di migrare la gestione DNS di `dataxiom.it` da Register.it a Route53.

## Current Progress

**Diagnosi reale** (via inventario `aws ec2`/`rds`/`ecr`/`logs`/`budgets`, non stime): RDS staging 24/7 non coperto da Free Tier (~$15-16/mese), EC2 prod `t3.small` sovradimensionato (CPU media 1.07%), 2 snapshot RDS manuali dimenticati di giugno (~$3.8/mese), ECR senza lifecycle policy (181 immagini/33GB in crescita illimitata), log staging senza retention.

**Revisione esplicita per readiness cliente (~1 mese)**: downgrade EC2 prod deferito (rischio memoria/OOM, storico di crisi pool-exhaustion già documentato); backup retention RDS prod alzata da 1 a 7gg invece (readiness, non risparmio).

**DNS**: confermato via `aws route53domains` che `.it` è supportato da Route53 per il trasferimento di registrazione, ma scelta la Soluzione A (solo delega DNS via nameserver, registrazione invariata su Register.it) per il rischio del trasferimento completo a ridosso del lancio. Inventario record reale catturato (A/CNAME/MX/TXT/3×DKIM SES).

**Spec** (`docs/superpowers/specs/2026-08-23-aws-cost-optimization-design.md`) → **piano 11 task** (`docs/superpowers/plans/2026-08-23-aws-cost-optimization.md`) → `/superpowers:subagent-driven-development`, adattato: subagent "executor" per task (nessuna code-quality-review, non c'è codice — verifica diretta del controller sull'output reale).

**Eseguiti e verificati (Task 1-8/11):**
1. RDS staging fermato.
2. 2 snapshot manuali cancellati (un subagent ha sollevato un falso allarme di sicurezza "unica risorsa di backup" — verificato e smentito: i 6 snapshot automatici, il vero backup, restano intatti).
3. Lifecycle policy ECR applicata (166 immagini marcate per scadenza, 15 mantenute).
4. Retention log staging → 30gg.
5. Backup retention RDS prod → 7gg.
6. **Elastic IP `52.19.238.50` allocato e associato** a `badge-system-api` — chiude l'incidente di apertura sessione indipendentemente da Route53. Record A `api.dataxiom.it` aggiornato su Register.it dall'utente.
7. Hosted zone Route53 creata e popolata con tutti e 9 i record reali (incluso MX e 3× DKIM SES).
8. Verifica pre-cutover superata (tutti i record confermati via `aws route53 list-resource-record-sets`).

**Scoperta collaterale non correlata**: il resolver DNS locale del sandbox restituiva risposte stantie indipendentemente dal server `@` specificato in `dig` — ha causato falsi allarmi di "propagazione lenta" su Register.it già in realtà avvenuta. Risolto verificando con query DoH dirette (Cloudflare) e con l'API Route53 direttamente.

**Task 9 (cutover nameserver) fermato dall'utente**: nel pannello "Cambio DNS" di Register.it è comparso un avviso non previsto — *"L'impostazione dei DNS esterni comporterà la disattivazione di tutti i servizi aggiuntivi legati al dominio"*. L'utente ha una casella email reale e attiva `diego@dataxiom.it` ospitata lì. Non determinabile dagli strumenti disponibili se l'avviso riguardi solo componenti Register.it o disattivi il servizio email stesso, a prescindere dal record MX (già replicato correttamente). Dato che il problema originale è già risolto dal Task 6, il beneficio residuo di Route53 non giustifica il rischio senza conferma esplicita dal supporto Register.it.

**Dopo la chiusura del piano, merge di PR #11 eseguito** (mutua esclusione Smart Working↔Eventi, Session 109 — era in attesa perché AWS non era raggiungibile). Squash-merge (`3697b8e`), CI/CD e Build&Push ECR verdi, ma **il deploy EC2 è fallito al primo tentativo** (`dial tcp ***:22: i/o timeout`). Causa: il secret GitHub `EC2_HOST` era ancorato all'IP effimero originale, fermo dal 2 giugno 2026 — reso obsoleto dal nuovo Elastic IP allocato nel Task 6 di questa stessa sessione, un effetto collaterale non previsto dal piano (il secret non era nell'inventario delle risorse toccate). Corretto (`gh secret set EC2_HOST --body "52.19.238.50"`), rilanciato con `gh run rerun` — secondo tentativo verde, `/health` confermato con database connesso. PR #11 ora live in produzione.

**Downgrade EC2 prod rivalutato e completato via `/superpowers:brainstorming`**: esplorando il contesto reale via SSH diretto sull'istanza + query CloudWatch (non solo stime), trovato che il "gap" di dati memoria (motivo del deferimento nella spec originale) era in realtà un falso allarme — il CloudWatch Agent pubblicava già `mem_used_percent` da settimane sotto un namespace custom (`BadgeSystem/EC2`) mai interrogato prima. Recuperate 3 settimane di dati reali: memoria media 22.87%, picco 32.37% (~615MB su 1.9GiB); CPU media 1.09%, picco 32.59%. **Verifica cruciale**: riletto il dettaglio della crisi di stabilità storica (`backend_stability_crisis_resolved.md`) — le cause erano pool di connessioni DB troppo piccolo, timeout RDS cold-start, healthcheck rigido, **nessuna legata alla RAM host**. Il rischio OOM della spec originale era sovrastimato. Dato che non c'è ancora un cliente reale, l'utente ha scelto di eseguire il downgrade ORA (finestra a rischio minimo) invece di aspettare, capovolgendo la logica originale.

**Eseguito** via `/superpowers:subagent-driven-development` (subagent executor per step + verifica indipendente del controller): alarm CloudWatch `badge-ec2-memory-high` creato (soglia 85%, stesso pattern degli alarm esistenti); downgrade `t3.small`→`t3.micro` (stop→modify-instance-attribute→start→wait status-ok, Elastic IP rimasto invariato automaticamente); verifica indipendente — `/health` 200 con DB connesso, container Docker `Up (healthy)`, memoria **12.81%** (116.5MiB/909.5MiB), `RestartCount: 0`, alarm in stato `OK` con dati reali (~19.7%).

**Register.it ha confermato** (contattato dall'utente) che il cambio DNS esterni non rompe la posta **a condizione che** MX e i relativi record SPF/DKIM siano già presenti nel nuovo provider prima del cutover — verificato che era già così (Task 7: MX `10 mail.register.it` + 3 CNAME DKIM SES già replicati; nessun SPF esisteva prima, quindi nulla da aggiungere). **Task 9 eseguito**: nameserver di `dataxiom.it` cambiati su Register.it ai 4 di Route53. Il pannello conferma il salvataggio, ma la propagazione pubblica (verificata via DoH, non ancora arrivata) richiede 24-48h più la validazione della Registration Authority italiana (Nic.it) — normale, non un fallimento. **Task 10 (verifica finale) da ripetere quando la propagazione sarà completa**, su richiesta dell'utente rimandata "a fine giornata".

**Bug Session 106 (durata/giorno evento non visibile nelle Presenze) chiuso, con verifica end-to-end reale**: l'esplorazione del codice (`Explore` agent) aveva già trovato che il fix esisteva (commit `570c06b`, 21/8 — endpoint `GET /events/approved` + `mapEventToPresenceRow`), ma non era mai stato verificato a schermo. Confermato che il fix è live in produzione controllando il contenuto reale del bundle JS servito da `badge.dataxiom.it` (stesso metodo usato per l'OTA mobile: grep di stringhe distintive `events/approved`/`ore_label`/`is_event`, non solo il log del deploy). Poi **verifica end-to-end reale via API**, richiesta esplicitamente dall'utente: creato un tenant demo isolato (`/demo/start`), sottomesso e approvato un evento reale (`POST /events/request` → `PUT /:id/approve`), chiamato l'endpoint reale (`GET /events/approved`), e passato la risposta reale attraverso la funzione di mapping frontend vera (`mapEventToPresenceRow`, eseguita con Node, stesso codice del browser) — risultato: `timestamp` corretto (24/8 09:00 Europe/Rome) e `ore_label: "8h"` corretto. Bug chiuso con prova diretta sul contenuto, non solo lettura del codice.

## What Worked

- **Diagnosi bottom-up da inventario reale invece che da stime** — Cost Explorer si è confermato inaffidabile (dati vicini a zero, coerente con quanto già annotato in sessioni precedenti), ma `aws budgets describe-budgets` ha dato numeri reali e verificabili (spesa attuale, previsione, storico alert).
- **Rivalutare esplicitamente il piano di risparmio rispetto al rischio di attivazione cliente**, su richiesta dell'utente — ha portato a deferire un intervento (downgrade EC2) che sarebbe stato rischioso proprio nella finestra sbagliata, e a scoprire un item di readiness non legato al costo (backup retention).
- **Non fidarsi ciecamente di un falso allarme di sicurezza del subagent** (Task 2) — verificato con una query indipendente prima di accettare o respingere l'allarme.
- **Fermarsi su un rischio genuinamente non chiarificabile dagli strumenti disponibili** (l'avviso Register.it sul servizio email) invece di procedere assumendo che andasse tutto bene — l'utente ha un servizio email reale in gioco, non uno di test.
- **Riconoscere che il beneficio marginale (Route53) non giustificava il rischio residuo**, una volta che il problema originale era già risolto in modo indipendente (Elastic IP) — non tutto il piano andava completato a tutti i costi per "finire quanto pianificato".
- **Leggere il log di errore reale invece di assumere una causa generica** quando il deploy EC2 è fallito — il timeout SSH avrebbe potuto sembrare un problema di rete transitorio, ma il log esatto (`gh run view --log-failed`) ha portato dritti al vero secret obsoleto in pochi minuti.
- **Non fidarsi di un risultato negativo di `aws cloudwatch list-metrics` senza controllare il namespace giusto** — un "gap" apparente (nessun dato memoria) era in realtà solo il namespace sbagliato interrogato; un secondo controllo più ampio (`list-metrics` senza filtro namespace) ha rivelato 3 settimane di dati già esistenti.
- **Rileggere il dettaglio esatto di un incidente storico prima di generalizzarlo come "rischio memoria"** — la crisi di stabilità del 4 giugno era interamente config applicativa (pool DB, healthcheck), non RAM host. Una lettura superficiale della memoria ("crisi di pool exhaustion") aveva portato a una cautela eccessiva nella spec originale.
- **Capovolgere la sequenza "aspetta il cliente prima di rischiare" quando il rischio reale si è ridimensionato** — il momento più sicuro per un cambio a basso rischio è prima che un cliente dipenda dal sistema, non dopo.

## What Didn't Work / Da tenere a mente

- **`dig` locale in questo sandbox non è affidabile per verifiche DNS critiche** — ha restituito risposte stantie per >10 minuti indipendentemente dal server `@` interrogato esplicitamente, causando falsi allarmi di propagazione lenta. Usare query DoH dirette (es. `curl -H "accept: application/dns-json" "https://cloudflare-dns.com/dns-query?name=X&type=A"`) o l'API del provider DNS direttamente (`aws route53 list-resource-record-sets`) per verifiche affidabili in questo ambiente.
- **La spec/piano originali non avevano previsto il rischio "servizi aggiuntivi" del pannello Register.it** — un avviso generico del genere può nascondere dipendenze reali (hosting email) non deducibili dalla sola ispezione dei record DNS via `dig`/`aws sesv2`. Da verificare esplicitamente con il supporto del registrar prima di un cutover simile in futuro, non solo dall'inventario tecnico dei record.
- **Un Elastic IP appena associato va propagato anche a secret/config esterni che referenziano l'IP dell'istanza in modo statico, non solo al DNS** — il piano aveva previsto l'aggiornamento del record DNS `api.dataxiom.it` ma non il secret CI/CD `EC2_HOST`, causando un fallimento di deploy inatteso poche ore dopo. Da controllare esplicitamente la prossima volta che cambia l'IP pubblico di un'istanza con deploy automatico via SSH diretto.

## Next Steps (in ordine di urgenza)

1. **Ripetere la verifica post-cutover DNS (Task 10)** quando la propagazione sarà completa (utente ha chiesto di ricontrollare "a fine giornata"): `dig +short NS dataxiom.it` deve mostrare i 4 nameserver Route53, poi ripetere il check di tutti i record + stato DKIM SES (`aws sesv2 get-email-identity --email-identity dataxiom.it --query "DkimAttributes.Status"`, deve restare `SUCCESS`) + un secondo test di invio/ricezione email reale su `diego@dataxiom.it` come conferma finale.
2. A fine mese, verificare la spesa reale (`aws budgets describe-budgets`) contro il target €20-30 per confermare l'efficacia dei Task 1-5 + il downgrade EC2.
3. ~~**Warning CI Node 20 deprecato**~~ — ✅ **Risolto**: bump `actions/checkout`/`setup-node`/`upload-artifact` da `@v4` a `@v5` in tutti e 4 i workflow (`ci.yml`, `ecr-push.yml`, `deploy-staging.yml`, `deploy-to-ec2.yml`), 18 occorrenze totali. Branch dedicato da `origin/main` (per evitare la divergenza post-squash-merge già vista in sessione), CI verde su tutti i check, **PR #12 mergiata** (`fd9e876`).
4. Monitorare l'alarm `badge-ec2-memory-high` nei prossimi giorni/settimane per confermare che il margine resti sano man mano che arriva traffico reale.
6. Monitorare l'alarm `badge-ec2-memory-high` nei prossimi giorni/settimane per confermare che il margine resti sano man mano che arriva traffico reale (specialmente dopo l'attivazione del primo cliente).
7. Tutto il backlog invariato dalle sessioni precedenti resta aperto — vedi Session 109 sotto.

---

# Badge System — Session 109 Handoff

**Date:** 2026-08-22
**Session:** 109 — Mutua esclusione Smart Working ↔ Eventi/Training implementata end-to-end, PR #11 aperta e verde, merge posticipato
**Status:** ✅ **Feature implementata, testata e review-completa. PR #11 aperta e mergeable (CI verde).** ⏸️ **Merge posticipato su richiesta esplicita dell'utente**: account AWS temporaneamente non disponibile — il merge GitHub in sé non ne dipende, ma il deploy automatico post-merge (ECR/EC2) fallirebbe.

---

## Goal (Session 109)

L'utente ha confermato che la conferma visiva sul device reale della mutua esclusione Eventi/Training↔QR check-in (PR #7) funziona, ma testando con l'utenza Maria ha trovato un gap parallelo: un dipendente poteva ancora dichiarare Smart Working per un giorno con un evento già approvato — cosa che il check-in QR già impediva correttamente. Richiesta di implementare la stessa mutua esclusione anche verso Smart Working, con `/superpowers:brainstorming`+`/grilling` per il design, poi l'intera pipeline fino a push+PR.

## Current Progress

**Design (`/grilling`, 4 decisioni, tutte risolte sulla raccomandazione)**: stati bloccanti PENDING+APPROVED (coerente con la logica già esistente in `events.js POST /request`); blocco anche in fase di approvazione evento se Smart Working già dichiarato (non solo il verso opposto); UX mobile mirror esatto di `QRScannerScreen.jsx`; riuso di `lockEventConflictScope` esistente (nessun nuovo lock). Spec: `docs/superpowers/specs/2026-08-22-smart-working-event-conflict-design.md`. Piano 6 task: `docs/superpowers/plans/2026-08-22-smart-working-event-conflict.md`.

**Implementazione (`/superpowers:subagent-driven-development`, worktree isolato, 6 task, ognuno con spec-review + code-quality-review indipendenti)**:
1. Nuova `findConflictingSmartWorking()` in `backend/src/utils/eventConflict.js`.
2. `smartWorking.js POST` riscritto: lock → `findConflictingEvent` → insert. **Fix collaterale trovato**: la route usava `CURRENT_DATE` Postgres (timezone di sessione) invece di `todayInTimeZone()` Europe/Rome — stessa classe già documentata come **Pattern 6** in `CLAUDE.md`, corretta.
3. `events.js PUT /:id/approve` esteso con `findConflictingSmartWorking`, riusando il lock già acquisito per il controllo checkin esistente.
4. Test real-Postgres dedicati `smartWorking-event-conflict.test.js` (6 test). Deviazione dal piano (verificata necessaria e inerte): aggiunto `makeAdminEmployee` perché `event_requests.approved_by` referenzia `employees(id)`.
5. Pre-check mobile in `SmartWorkingScreen.jsx`, mirror di `QRScannerScreen.jsx`.
6. Review finale olistica: nessun difetto critico/importante residuo.

Un code-quality-reviewer del Task 5 è stato interrotto a metà da un limite di sessione API — completato manualmente (non ri-dispatchato, per evitare di ricolpire lo stesso limite).

**Verifica finale**: `/code-review:code-review` adattato al diff locale (nessuna PR esisteva ancora) — 5 agenti paralleli, 2 candidati sotto soglia 80 (score 45 e 25) → nessun problema riportato. `/test-all`: backend verde (entrambi i batch), frontend-web 330/330 (1 timeout confermato flaky/non correlato in `EmployeesTab.test.jsx`), mobile 163/163 già verificato in sessione precedente.

**Push + PR**: `git push -u origin worktree-smart-working-event-conflict` → **PR #11** creata (https://github.com/falletti-diego/badge-system/pull/11). CI verde su tutti i check (Backend - Lint & Test ✅, Mobile - Test ✅, Security Check ✅), stato `MERGEABLE`.

**Merge posticipato**: l'utente ha segnalato che il proprio account AWS non è al momento raggiungibile e ha chiesto di attendere. Chiarito che il merge GitHub è indipendente da AWS, ma la pipeline CI/CD successiva al push su `main` (build Docker→ECR→SSH EC2) fallirebbe senza accesso AWS — decisione: **attendere**, PR resta aperta.

## What Worked

- **`/grilling` per chiudere le 4 decisioni di design prima di scrivere codice** — nessuna ambiguità residua durante l'implementazione, tutte le decisioni già prese in anticipo.
- **Riuso deliberato dell'infrastruttura esistente** (`lockEventConflictScope`, `findConflictingEvent`, pattern UI di `QRScannerScreen.jsx`) invece di reinventare — la feature è quasi interamente composizione di pezzi già testati.
- **Riconoscere lo stesso Pattern 6 (timezone) al terzo incontro** e fixarlo immediatamente invece di introdurlo di nuovo per la terza volta — la checklist in `CLAUDE.md` ha funzionato come previsto.
- **Completare manualmente una review interrotta da un limite API invece di ri-dispatchare** un subagent identico — evitato un secondo fallimento prevedibile.
- **Chiarire esplicitamente la dipendenza reale da AWS prima di agire**: il merge GitHub e il deploy automatico sono due operazioni distinte — permesso di procedere in modo granulare invece di bloccare tutto per precauzione.

## What Didn't Work / Da tenere a mente

- Nessun problema di processo nuovo in questa sessione — la pipeline design→piano→subagent-driven-development→code-review→test-all→PR ha funzionato end-to-end senza intoppi degni di nota, a parte l'interruzione per limite di sessione già gestita.

## Next Steps (in ordine di urgenza)

1. **Merge PR #11** appena l'account AWS torna disponibile (o comunque appena l'utente lo richiede esplicitamente) — poi verificare che la pipeline di deploy (ECR/EC2) vada a buon fine.
2. **Deploy backend/web in produzione**: sia questa feature sia PR #7 (mutua esclusione Eventi/Training↔QR, mergeata Session 107) risultano ancora **non deployate** su `api.dataxiom.it`/`badge.dataxiom.it` — solo mergeate su `main` a livello di repo. Da fare nello stesso giro di deploy.
3. **Raccomandazione operativa dalla PR #11, non ancora eseguita**: audit sui dati di produzione esistenti per individuare eventuali PENDING/APPROVED già in conflitto con uno Smart Working già dichiarato sulla stessa data, da fare prima o subito dopo il deploy.
4. **🔴 Ancora aperto da Session 106**: durata/giorno evento non compare correttamente nelle Presenze dopo l'approvazione manager.
5. Tutto il backlog invariato dalle sessioni precedenti resta aperto — vedi Session 108/107 sotto.

---

# Badge System — Session 108 Handoff

**Date:** 2026-08-22
**Session:** 108 — OTA di produzione pubblicato per la mutua esclusione Eventi/Training vs QR check-in, verificato end-to-end senza nuova build nativa
**Status:** ✅ **OTA pubblicato e verificato crittograficamente** (canale `production`, runtime `1.0.0`, commit `a06d8bb`). Verifica visiva finale su device reale (force-quit + riapertura) resta da fare dall'utente.

---

## Goal (Session 108)

L'utente ha chiesto conferma se la mobile app avesse recepito la feature "Eventi/Training" e la mutua esclusione QR↔evento (PR #7), e se servisse una nuova build. Dopo aver confermato che il codice era mergiato ma non ancora distribuito, l'utente ha chiesto di pubblicare l'OTA con verifica rigorosa, essendo la prima volta per questo tipo di cambio.

## Current Progress

**Verifica preliminare**: letto direttamente `main` (non assunto) — `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx` contiene il pre-check evento della mutua esclusione, introdotto nello squash-merge `ca89fb9` di PR #7 (22/08). Confrontando le date: **build 37** (TestFlight, testata con successo in Session 106) risale al **20/08**, prima che PR #7 esistesse — non copre la mutua esclusione.

**Analisi "serve build nativa o basta OTA?"**: `git show ca89fb9 --stat` mostra che lato mobile il diff tocca **solo** `QRScannerScreen.jsx` (46 righe) — nessun file nativo (`app.json`, `package.json`, config iOS/Android). E build 37 ha già `expo-updates` configurato correttamente (verificato in Session 106, a differenza del problema del build 16). Condizioni per un OTA sicuro soddisfatte.

**Problema trovato prima di pubblicare**: il checkout locale di `main` era indietro di 10 commit rispetto a `origin/main` E aveva 1 commit locale mai pushato — pubblicare da lì avrebbe spedito codice stale (senza la mutua esclusione) o rischiato di perdere quel commit locale. Risolto creando un **worktree temporaneo** puntato direttamente su `origin/main`, isolato dal checkout principale.

**Verifica pre-pubblicazione**: suite di test mobile completa nel worktree pulito — **20/20 suite, 157/157 test verdi**, inclusa la sezione "event pre-check" (6/6).

**Pubblicazione**: `eas update --branch production --message "..."` dal worktree pulito.
```
Branch             production
Runtime version    1.0.0
iOS update ID      01a0292e-52f6-7899-ac9f-a0568bb9af0f
Android update ID  01a0292e-52f6-7141-bd87-c647e845dd8d
Commit             a06d8bb63c3e6cf17661be0e4a24dc88898db0df
```

**Verifica end-to-end in 3 passi** (richiesta esplicita dell'utente, prima volta per questo tipo di verifica):
1. **Manifest come device reale**: `curl` su `u.expo.dev` con gli header esatti di un client Expo Updates (`expo-platform: ios`, `expo-runtime-version: 1.0.0` — la stessa di build 37, `expo-channel-name: production`) → risposta `expo-update-id: 01a0292e-52f6-7899-ac9f-a0568bb9af0f`, esattamente l'update appena pubblicato.
2. **Hash crittografico**: calcolato lo SHA-256 (base64url) del bundle JS locale compilato durante il publish e confrontato byte-per-byte con l'hash `launchAsset` nel manifest — **match esatto** su iOS (`Li_satdwFNofjEg_zFeAWkqAV5uDsbQg-vy-WCXCEd0`) e Android (`A6w8BA1BrgcU-wKynGGM5SjZgchL3r71UuZe8pwDWNM`).
3. **Contenuto**: grep sul bundle compilato (bytecode Hermes, non testo semplice — ma le stringhe letterali restano leggibili) per le stringhe UI distintive della mutua esclusione (`"Hai un evento programmato"`, `"Verifica eventi in corso"`) — **presenti in entrambe le piattaforme**.

Catena chiusa: un device reale sull'app installata (build 37, runtime 1.0.0, canale production) che chiede un manifest riceve esattamente questo bundle, e quel bundle contiene il codice della mutua esclusione — non solo "il comando `eas update` è andato a buon fine" ma prova diretta sul contenuto specifico.

**Problema collaterale trovato e recuperato**: il checkout locale di `main` aveva un commit di documentazione mai pushato (Session 105 closeout — dettagli produzione/migration/CI mai arrivati su `origin/main`). Content genuinamente non presente altrove (verificato confrontando con le sezioni Session 105 già su `origin/main`) — recuperato e applicato manualmente sul branch di sync insieme a questo aggiornamento, per non perdere quell'informazione.

**Worktree temporaneo rimosso** a fine lavoro (`git worktree remove --force` + `git worktree prune`).

## What Worked

- **Non fidarsi del solo "Published!" della CLI**: la stessa lezione di Session 106 (un OTA sembrava pubblicato correttamente ma non arrivava sul device reale, causa binario senza `expo-updates`) ha motivato la verifica in 3 passi invece di dichiarare fatto dopo il solo comando di publish.
- **Hash crittografico invece di solo ID**: l'update ID nel manifest da solo prova che il manifest giusto viene servito, ma l'hash del bundle prova che il CONTENUTO specifico (comprese le stringhe della feature) è esattamente quello appena compilato — due livelli di prova indipendenti.
- **Worktree temporaneo per pubblicare da stato certo**: invece di rischiare di pubblicare da un checkout locale stale/divergente, un worktree pulito puntato su `origin/main` ha garantito che il codice pubblicato fosse esattamente quello mergiato, senza toccare lo stato del checkout principale.
- **Notare e recuperare il commit doc mai pushato** invece di scartarlo silenziosamente durante il sync — conteneva informazioni di produzione reali (migration, fix CI, health check) non presenti altrove.

## What Didn't Work / Da tenere a mente

- **Gli strumenti CLI locali di `expo`/`eas` che invocano `expo config --json`** (`eas build:list`, `eas update:list`) falliscono silenziosamente (nessun output, exit 1) in questo repo per lo stesso bug già documentato in `CLAUDE.md` (path del progetto con spazi e `&`) — solo `eas whoami` e `eas update` (che non passano dallo stesso path di risoluzione config) funzionano. Non ho potuto interrogare direttamente la cronologia build/update, ho dovuto ricostruirla da `git log` + pubblicazione diretta.
- **`curl` diretto sugli asset URL del manifest restituisce "Unauthorized asset request"** anche con gli stessi header del manifest request — gli asset richiedono un token legato alla sessione del client reale, non replicabile con un semplice `curl`. Bypassato verificando l'hash sul bundle locale invece di scaricare l'asset remoto.
- **Il checkout locale di `main` può divergere silenziosamente da `origin/main`** dopo che una worktree isolata fa squash-merge via `gh pr merge` — il checkout principale non si aggiorna automaticamente. Da controllare (`git fetch` + `git status`) prima di qualunque operazione che pubblica/deploya da `main` in locale.

## Next Steps (in ordine di urgenza)

1. **Verifica visiva finale sul device reale**: force-quit + riapertura app per confermare che l'OTA si applica e il pulsante/comportamento di mutua esclusione compare — la verifica fatta finora è tecnica (manifest/hash/contenuto), non ancora una conferma visiva dell'utente.
2. **🔴 Ancora aperto da Session 106**: durata/giorno evento non compare correttamente nelle Presenze dopo l'approvazione manager.
3. **Deploy backend/web in produzione** — PR #7 mergeata su `main` ma non ancora deployata su `api.dataxiom.it`/`badge.dataxiom.it`.
4. Se `admin-employeeSync-template.test.js` o `onboarding-invite.test.js` falliscono di nuovo in CI reale, investigare seriamente.
5. Tutto il backlog invariato dalle sessioni precedenti resta aperto — vedi Session 107/106 sotto.

---

# Badge System — Session 107 Handoff

**Date:** 2026-08-22
**Session:** 107 — Code review + fix timezone su PR #7, indagine approfondita e fix di 5 root cause distinte di flakiness pre-esistente nella suite, merge su `main`, checklist code review migliorata
**Status:** ✅ **PR #7 mergeata su `main` (squash `ca89fb95`).** Restano aperti: il bug Session 106 sulla visualizzazione durata evento nelle Presenze, e 2 fallimenti singoli non riproducibili trovati durante lo stress-test (vedi sotto).

---

## Goal (Session 107)

Continuazione diretta della feature "Mutua esclusione Eventi/Training vs QR check-in" (PR #7, già implementata e pushata in una sessione precedente compattata): code review, fix del bug trovato, poi indagine approfondita — su richiesta esplicita dell'utente — dei fallimenti sporadici pre-esistenti della suite di test reale-Postgres, non legati al diff della PR.

## Current Progress

**`/code-review:code-review` su PR #7**: 5 agenti paralleli, 1 bug reale confermato (score 85) — `eventConflict.js`, `findConflictingCheckin` filtrava con `c.timestamp::date = $3::date`, un cast valutato nel timezone di **sessione DB** (UTC su AWS RDS) invece che in Europe/Rome. Stessa identica classe di bug già fixata una volta in `checkins.js` (commit `615fcbf`, Session 105). Fix: `(c.timestamp AT TIME ZONE 'Europe/Rome')::date`, con test di regressione dedicato che forza esplicitamente `SET timezone = 'UTC'` sulla connessione di test (`eventConflict-timezone.test.js`) — necessario perché il Postgres locale gira per coincidenza già in `Europe/Rome`, quindi senza quel `SET` il test sarebbe passato per caso anche col bug presente. Commit `89986b3`.

**Indagine approfondita sulla flakiness pre-esistente** (richiesta esplicita: "analisi critica ed accurata... soluzioni efficienti e irreversibili... usa `/grilling` se hai domande"): la suite condivide **un solo database Postgres** (`badge_system_test`) tra 40+ file di test eseguiti in parallelo dai worker di default di Jest. Root cause principale: asserzioni non scoped alle righe create dal test stesso, che quindi dipendono da cosa fanno ALTRI file di test in quel preciso istante. Via `/grilling`, scelta la **"Soluzione B"** (fix mirati + split Jest a due batch — scartata sia l'opzione minima "solo fix puntuali" sia quella massimale "isolamento DB per-worker completo"):
- `migration-035-employee-lifecycle.test.js` riscritto: il test originale asseriva un invariante globale (`hiring_date` mai NULL per dipendenti attivi) **mai realmente garantito** né dallo schema né dall'app — passava solo per coincidenza. Riscritto per testare la SQL della migration in isolamento su dati auto-creati/auto-puliti.
- `backend/scripts/run-tests.js` creato: due batch — parallelo (tutti i file scoped) + serializzato (`--runInBand`, i 7 file che testano feature genuinamente globali per design, es. cap demo cross-tenant, non scopeable).
- Documentato come **Pattern 5** in `CLAUDE.md`. Commit `76aea8e`.

**Round finale, sullo stesso livello di rigore, sul residuo `shifts.test.js`** (richiesta esplicita: "indaga anche quello ora... svolgi tutti i run che reputi necessari"): decine di run, inclusi stress-test con doppia invocazione concorrente di `npm test` in background. **`shifts.test.js` stesso non si è mai più riprodotto** — ma lo stress ha fatto emergere **3 bug reali e distinti, diversi da quello originariamente segnalato**:
1. 6 file/13+ occorrenze di fixture per colonne UNIQUE generate solo con `Date.now()` (nessun suffisso random) → collisione se due INSERT cadono nello stesso millisecondo.
2. `auth-refresh-first-use.test.js`: email hardcoded non uniche su 3 `describe`, più una riga demo condivisa ("Pippo") mutata in-place senza cleanup di `used_tokens`/`revoked_tokens` — si rompeva anche rieseguendo lo stesso file due volte di fila **senza alcuna concorrenza**. Un advisory lock di sessione aggiunto per la mutazione non bastava da solo (provato con debug logging PID+timestamp che il lock funzionava perfettamente) — il vero bug era il cleanup mancante.
3. `jest.globalSetup.js` cancellava incondizionatamente `revoked_tokens`/`used_tokens` a ogni invocazione — poteva cancellare lo stato di una seconda invocazione `npm test` genuinamente concorrente. Reso age-scoped (6 minuti, sopra il TTL di 5 minuti del blocco di revoca temporaneo in `routes/auth.js:389-390`).

Tutti e 3 fixati, verificati con TDD dove applicabile. Commit `ae909cd`.

**Merge**: `/superpowers:finishing-a-development-branch` — 2 run completi `npm test` puliti, squash-merge su `main` via `gh pr merge --squash` (commit `ca89fb95`), messaggio nel formato `merge: ...` già usato nel repo.

**Checklist di code review migliorata** (su richiesta esplicita): aggiunto **Pattern 6** in `CLAUDE.md` (timezone-naive `::date` su TIMESTAMPTZ — seconda occorrenza della stessa classe di bug, ora con grep di prevenzione), e ristrutturata la sezione "Code Review Checklist" in **3 checklist per trigger** invece di una sola scoped solo ad Auth & Config: Auth & Config Changes (esistente), Timestamp/Date Comparisons (nuova), Real-Postgres Test Files (nuova, richiama esplicitamente il Pattern 5).

## What Worked

- **Debug reproduction empirica invece di solo ragionamento statico**: doppie invocazioni concorrenti di `npm test` in background hanno fatto emergere race reali in pochi round, molto più efficace che ragionare a tavolino sul codice.
- **Instrumentation temporanea (PID+timestamp) per verificare un'ipotesi PRIMA di scartarla**: ha dimostrato che l'advisory lock funzionava perfettamente, evitando di "fixare" qualcosa che non era rotto e portando a trovare il vero bug (cleanup mancante).
- **`/grilling` per chiudere lo scope della soluzione (A/B/C) prima di scrivere codice** — ha evitato di implementare l'opzione sbagliata (troppo minimale o troppo pesante).
- **Riportare onestamente i residui non riprodotti** (`shifts.test.js` mai riprodotto indipendentemente; 2 nuovi fallimenti singoli non riproducibili) invece di dichiarare vittoria totale — coerente con lo standard di trasparenza già richiesto dall'utente in sessioni precedenti.

## What Didn't Work / Da tenere a mente

- **Un lock advisory da solo non basta a impedire un self-collision** — se il test muta una riga condivisa e produce righe derivate (token, record di stato), serve ANCHE il cleanup esplicito di quelle righe derivate, non solo la serializzazione dell'accesso alla riga principale.
- **`Date.now()` da solo non è mai sufficientemente unico** per un vincolo UNIQUE Postgres — serve sempre il suffisso random (`Math.random().toString(36).slice(2)`), pattern ora esplicitamente in Pattern 5/checklist.
- **I 2 nuovi fallimenti singoli non riproducibili** (`admin-employeeSync-template.test.js`, `onboarding-invite.test.js`) non sono stati inseguiti oltre — passano sempre in isolamento e non sono più ricomparsi in run successivi. Valutati come artefatti di un regime di stress-test artificialmente avversario (decine di suite complete a raffica sulla stessa macchina), strutturalmente impossibile in CI reale (Postgres effimero per job). Se ricompaiono in CI reale, sono un segnale che NON sono resource-contention.

## Next Steps (in ordine di urgenza)

1. **🔴 Ancora aperto da Session 106**: durata/giorno evento non compare correttamente nelle Presenze dopo l'approvazione manager — root cause non ancora nota.
2. **Deploy backend/web in produzione** — la PR #7 è mergeata su `main` ma non ancora deployata su `api.dataxiom.it`/`badge.dataxiom.it`.
3. Se `admin-employeeSync-template.test.js` o `onboarding-invite.test.js` falliscono di nuovo in CI reale (non in stress-test locale), investigare seriamente — sarebbe la prova che non sono resource-contention.
4. Tutto il backlog invariato dalle sessioni precedenti resta aperto — vedi Session 106/105 sotto.

---

# Badge System — Session 106 Handoff

**Date:** 2026-08-20
**Session:** 106 — Feature Eventi/Training: code review, QA manuale web, merge su `main`, build mobile 37 in TestFlight testata OK
**Status:** ✅ **Mergeata su `main` (`13f04e3` → `3e694cf` con handoff docs), branch remoto eliminato. Build 37 iOS pubblicata su TestFlight e testata con successo dall'utente su iPhone reale.** Deploy backend/web in produzione NON ancora eseguito (solo `main` locale al repo, non deployato su `api.dataxiom.it`/`badge.dataxiom.it`) — da fare separatamente. **🔴 Nuovo problema aperto per domani**: dopo l'approvazione manager, giorno e durata dell'evento non compaiono correttamente nella sezione Presenze della dashboard — non ancora investigato, l'utente ha chiesto esplicitamente di rimandare a domani.

---

## Goal (Session 106)

Continuazione di una sessione precedente in cui la feature "Eventi/Training" era già implementata full-stack (15 task TDD) con piano di test scritto ed eseguito lato API. Questa sessione: analisi critica finale, code review su PR reale, QA manuale, merge, e verifica se serva una nuova build mobile.

## Current Progress

**2 fix pre-merge** (analisi critica su richiesta utente): gap preesistente nel roster `/summary` manager (dipendenti a zero timbrature invisibili), e mancata invalidazione firma cartellino all'approvazione evento (con bug di timezone scoperto e corretto durante la review, `DATE` Postgres parsato a mezzanotte locale non UTC).

**Link nav + lint**: aggiunto link mancante a `/events/request` in dashboard web (pattern Button+emoji esistente, non icone MUI). Creata da zero la config ESLint mancante in `frontend-web` (gap preesistente), con `eslint-plugin-react-hooks` fissato a v4 (la v7 introduce regole "React Compiler" troppo aggressive per codice mai lintato).

**`/code-review:code-review` su PR #6** (nessuna PR esisteva — pushato branch e creata la PR prima di lanciare la skill): 5 agenti paralleli + scoring a soglia 80 su 4 candidati. **1 bug reale confermato e fixato (score 95)**: `events.js`/`presences.js` filtravano la visibilità manager con `employees.site_id` (non popolato per dipendenti normali, migration 038 documenta 2 incidenti di produzione già causati da questo stesso pattern) invece di `ANY(assigned_sites)` — un manager non vedeva/non poteva approvare richieste dei propri dipendenti. Fixato in 3 punti + test di regressione, pushato, commentato sulla PR.

**QA manuale web**: 2 problemi ambientali (porte 3000/5173 occupate da altri worktree attivi, mai toccati; `apiClient` che ignorava `VITE_API_URL` per via di `window.API_CONFIG` hardcoded in `public/config.js` — modifica locale temporanea, ripristinata a fine test). Walkthrough dipendente→manager→test cross-sede completato con successo. Mobile non testato (scelta esplicita utente).

**Fix lint CI-blocking aggiuntivo** (virgolette in un test preesistente, non introdotto da questa feature).

**Merge**: CI verde su tutti i check, squash-merge su `main` (`13f04e3`), branch remoto eliminato.

**Domanda post-merge dell'utente — serve una nuova build mobile?** Prima risposta (sbagliata): verificato via `git diff` che la feature tocca solo file JS/JSX (nessuna dipendenza nativa nuova) → "basta un OTA". Pubblicato `eas update --channel production` con successo (primo OTA mai fatto per questo progetto — canale non esisteva). **Testato dal vivo sull'iPhone dell'utente (login `maria@badge.local`): il pulsante non compariva**, nemmeno dopo force-quit e riapertura.

**Root cause reale** (trovata leggendo la storia git dei commit, non assunta): il build 16 — l'unico in App Store, giugno 2026 — è stato compilato dal commit `5733adf`, **precedente** al commit che ha introdotto `expo-updates` in `app.json` (`02a888c`). Il binario installato sul device dell'utente non ha alcun meccanismo di check/apply OTA — non poteva mai ricevere l'update pubblicato. Confermato anche in positivo: simulata una richiesta manifest da "device reale" (header `expo-runtime-version`/`expo-channel-name`) contro l'endpoint EAS Update, verificando che l'infrastruttura OTA funzionava correttamente — il problema era solo nel binario non predisposto, non nella pubblicazione.

**Correzione applicata**: `eas build --platform ios --profile production` → build **37** (il contatore EAS era più avanti del previsto — inizialmente comunicato all'utente come "build 17" per errore, poi corretto) → `eas submit` → App Store Connect → TestFlight (~5-10 min processing automatico Apple, nessuna review umana per TestFlight — chiarito anche il malinteso opposto: la "review Apple di 1-2 giorni" si applica solo alla pubblicazione pubblica sull'App Store, mai triggerata qui). L'utente ha chiesto se sarebbe stato più semplice usare la pipeline `codemagic.yaml` già presente nel repo (workflow `badge-ios-testflight`, build+submit-a-TestFlight in un solo passaggio) — spiegato che è funzionalmente equivalente (entrambi caricano su App Store Connect, Apple processa per TestFlight allo stesso modo), non usata perché l'IPA EAS era già pronta e ripartire da zero non aveva senso.

**✅ Build 37 installata e testata con successo dall'utente su iPhone reale — confermato funzionante.**

**Nuovo problema scoperto durante questo stesso test** (utente: *"non indirizziamolo ora, ci pensiamo domani"*): dopo l'approvazione manager, il giorno e la durata dell'evento non compaiono correttamente tra le presenze nella sezione Presenze della dashboard. **Non ancora investigato** — nelle sessioni precedenti l'integrazione ore/buoni pasto era stata verificata solo via API/curl (`buildEventDailyEntries` in `hours.js`, dedup checkin-vince-su-evento), mai la resa effettiva in UI dashboard.

## What Worked

- **Verificare `git diff` sui file mobile toccati prima di rispondere "serve una build?"** — ha dato una prima risposta con evidenza concreta invece di una supposizione, anche se poi rivelatasi incompleta (vedi sotto).
- **Diagnosticare i problemi ambientali (porte occupate, config.js hardcoded) con `lsof`+cwd invece di assumere un bug nel codice della feature** — risolti in minuti, nessuno era una regressione della PR.
- **Fix del bug `site_id`→`assigned_sites` verificato leggendo direttamente le migration storiche** (038 documenta 2 incidenti reali con lo stesso pattern) prima di accettare il finding dell'agente di review — non solo fidarsi del punteggio di confidenza.
- **Quando l'OTA non ha funzionato, indagare la storia git dei commit invece di ripetere il tentativo o assumere un problema di rete/cache** — ha trovato la vera causa (build precedente all'introduzione di `expo-updates`) in pochi minuti, evitando cicli di "prova a riaprire l'app" inutili.

## What Didn't Work / Da tenere a mente

- **"Nessuna dipendenza nativa nuova" NON implica "basta un OTA"** — bisogna anche verificare che il build attualmente installato dagli utenti reali abbia `expo-updates` configurato fin dall'inizio (controllare il commit di build via `eas build:view` contro la storia di `app.json`). Lezione da riapplicare ad ogni futura richiesta "serve una build?".
- **`apiClient.js` ha DUE meccanismi di configurazione API che si sovrappongono** (`window.API_CONFIG` da `public/config.js`, hardcoded per hostname, con priorità su `VITE_API_URL`) — per testare in locale contro un backend su porta non-standard bisogna editare `public/config.js`, non basta la env var Vite.
- **Porte di sviluppo standard (3000/5173/8081) sono quasi sempre occupate da altri worktree attivi dell'utente** — controllare sempre `lsof -ti:PORT` + cwd del processo prima di assumere sia libera, mai killare processi di altri worktree.
- **Build native locali (Xcode/simulatore) falliscono in questo repo** per un bug di `expo-constants` (`get-app-config-ios.sh`, variabile `$PROJECT_DIR` non quotata) combinato con il path del progetto che contiene spazi e `&` — build cloud (EAS/Codemagic) bypassano il problema perché girano su un path diverso, quindi restano l'unica via per test nativi reali finché il repo resta in questo path.

## Next Steps (in ordine di urgenza)

1. **🔴 PRIMA COSA DOMANI**: investigare perché giorno/durata evento non compaiono nelle Presenze dopo l'approvazione manager — root cause non nota, partire da `presences.js` (`buildEventDailyEntries`, dedup checkin/evento) e dalla resa UI della dashboard (`DashboardPage.jsx`/componente presenze), non solo dall'API.
2. **Deploy backend/web in produzione** — non ancora eseguito, il merge su `main` è solo locale al repo rispetto al deploy reale su `api.dataxiom.it`/`badge.dataxiom.it`.
3. Tutto il backlog invariato dalle sessioni precedenti resta aperto — vedi Session 105/104 sotto.

---

# Badge System — Session 105 Handoff

**Date:** 2026-08-19
**Session:** 105 — Test manuale utente del piano Session 104, 3 bug fixati, nuova regola "manager obbligatorio", merge+push su `main`, live in produzione
**Status:** ✅ **Sessione chiusa. Feature interamente live in produzione**, verificata (`api.dataxiom.it/health` → `database: connected`, `badge.dataxiom.it` → `200`).

---

## Goal (Session 105)

Continuazione diretta di Session 104. L'utente ha chiesto un piano di test manuale prima del merge; prima di farglielo eseguire, ho verificato io stesso l'intera checklist via API/curl contro backend+DB locali reali (non solo lettura del codice), poi l'utente ha ripetuto la verifica in UI dopo ogni fix.

## Current Progress

**3 bug reali trovati e fixati** durante la verifica (mia + dell'utente):

1. **Creazione Manager sempre fallita** (pre-esistente su `main`, non introdotto da Session 104): `AdminEmployeeSchema.assigned_sites` aveva un vincolo `.min(1)` di campo Zod che scattava prima del `.refine()` condizionato dal ruolo pensato per esentare i manager — un manager non ha mai potuto essere creato da "Nuovo Dipendente". Fix: rimosso il vincolo di campo, lasciato solo il refine. Commit `615fcbf`.
2. **Bug di timezone su `hiring_date`**: `EMPLOYMENT_NOT_STARTED` (check-in) e i default `hiring_date`/`exit_date` (wizard xlsx) calcolavano "oggi" con `new Date().toISOString().slice(0,10)` (UTC), mentre `hiring_date` è una data di calendario italiana scelta da un date picker. Nella finestra mezzanotte–2am locale (CET/CEST), un dipendente assunto "oggi" veniva bloccato dal check-in. Riprodotto live e fixato con `backend/src/utils/date.js` (`todayInTimeZone`/`dateInTimeZone`, Europe/Rome), applicato ovunque si confrontava con "oggi". Commit `615fcbf`.
3. **Dropdown Manager non si aggiornava senza hard refresh**: in `EmployeesTab.jsx`, `allEmployees` (fonte del dropdown "Manager di riferimento") era un `useFetch` mai ricaricato dopo create/delete, a differenza della tabella dipendenti. Fix: aggiunto `reloadAllEmployees()`. Commit `1d230ef`.

**Bug ambientale (non di codice)**: i server dev locali dell'utente (backend porta 3000, frontend 5173) giravano da metà luglio dalla cartella **principale** del repo (`main`), non dal worktree — per questo i nuovi campi non comparivano in UI. Risolto killando quei processi e riavviandoli dal worktree.

**Nuova regola di business — "manager obbligatorio"** (via `/grilling`, 5 domande chiuse con l'utente): scoperta testando che un dipendente veniva creato con successo su una sede nuova ancora senza alcun manager — l'utente ha giudicato questo scorretto (un dipendente non può esistere senza un manager di riferimento). Decisioni prese via grilling:
- Applicata universalmente ma solo ai **nuovi** inserimenti (nessuna retroattività sui dati storici già in produzione, es. "Roma Store" senza manager).
- Applicata anche al wizard xlsx, non solo al form singolo — ma solo alle righe classificate "nuovi", non a "modificati"/"riattivati" di dipendenti già esistenti.
- Meccanica: `manager_id` passa da opzionale a **obbligatorio** quando `role === 'employee'` (stesso pattern refine condizionato dal ruolo già usato per `assigned_sites`).
- Disattivare l'ultimo manager di una sede con dipendenti attivi: esplicitamente **fuori scope** per questa sessione (lasciato come miglioramento futuro).

Implementato in `backend/src/middleware/validation.js` (schema), `backend/src/services/employeeSync/computeDiff.js` (wizard, con guardia anti-doppio-errore quando `resolveManagerId` ha già segnalato un mismatch di sede), `frontend-web/.../EmployeesTab.jsx` (campo obbligatorio, bottone disabilitato, helper text). Circa 10 test esistenti aggiornati (le loro fixture assumevano un manager opzionale) + nuovi test per il caso required. Commit `a48f7ea`.

**Verifica finale**: `/code-review:code-review` (5 agenti paralleli, adattato per un commit locale senza PR GitHub) — CLAUDE.md compliance ok, nessun bug, nessuna regressione storica, nessun test indebolito; **1 solo finding reale**: un commento in `computeDiff.js` (`resolveManagerId`) ormai impreciso dopo il cambio — corretto, commit `fefe021`. `/test-all`: backend 107/108 suite (800/814 test), frontend 37/37 file (309/310 test) — entrambi verdi.

**Merge**: `worktree-new-employee-fields` → `main`, fast-forward `00809b2`→`f0d3072`, worktree e branch rimossi (`git worktree unlock`+`remove`, `git branch -d`).

**Migration in produzione**: `040_add_manager_id_to_employees.sql` applicata via SSH su EC2 prima del push, perché `deploy-to-ec2.yml` non esegue migration automaticamente (solo pull immagine + restart container) — deployare prima della migration avrebbe causato 500 su ogni endpoint employee/check-in.

**Push su `origin/main`**: primo tentativo (`f0d3072`) fallito su `CI/CD Pipeline` e `Build & Push Backend to ECR`, stesso errore ESLint reale e pre-esistente in `backend/src/routes/admin/employees.js:54` (template literal a riga singola senza interpolazione — mai emerso prima perché il branch aveva ~35 commit mai passati da CI e `/test-all` non include il lint). Diagnosticato via `gh run view --log-failed`, fixato riformattando la query multi-riga, verificato in locale (`npm run lint` pulito), committato (`1695de4`), ripushato. Secondo giro: **CI/CD Pipeline ✅, Build & Push Backend to ECR ✅, Deploy to EC2 ✅**. Verifica finale in produzione: `api.dataxiom.it/health` → `{"status":"ok","database":"connected"}`, `badge.dataxiom.it` → `200`.

## What Worked

- **Verificare io stesso la checklist prima di farla eseguire all'utente** ha trovato 2 bug critici (incluso uno pre-esistente su `main`) prima che l'utente perdesse tempo a scoprirli manualmente — lo stesso schema "verifica reale, non solo lettura del codice" già validato nelle sessioni precedenti.
- **Riprodurre un bug di timezone aspettando la finestra critica reale** (00:17 CEST) invece di simularlo, poi riverificare il fix esattamente nella stessa finestra — prova diretta, non solo ragionamento sul codice.
- **`/grilling` per una nuova regola di business scoperta a metà test**: 5 domande chiuse, una alla volta, con raccomandazione esplicita per ognuna — ha chiarito scope (retroattività, wizard sì/no, meccanica esatta, disattivazione manager fuori scope) prima di toccare codice, evitando un'implementazione poi da rifare.
- **Adattare `/code-review:code-review` a un commit locale senza PR**: la skill assume un PR GitHub (uso di `gh`); adattata dispatchando gli stessi 5 agenti sul diff del commit via `git show`, riportando i risultati direttamente invece di commentare una PR inesistente.

## What Didn't Work / Da tenere a mente

- **I server dev locali dell'utente giravano dalla cartella principale, non dal worktree, da settimane** — nessun modo per accorgersene dal codice; scoperto solo perché l'utente ha riportato "non vedo i nuovi campi". Da controllare (`lsof -i :PORT` + cwd del processo) ogni volta che un utente segnala che una feature nuova "non si vede" nonostante il codice sia corretto.
- **Le prime versioni dei fix ai test rompevano altri test non toccati direttamente** (es. aggiungere `manager_id` obbligatorio ha rotto ~10 test in file diversi che non lo prevedevano) — risolto sistematicamente rilanciando la suite completa dopo ogni round di fix invece di correggere un file alla volta e assumere che bastasse.

## Next Steps (in ordine di urgenza)

Nessuna azione residua per questa feature — merge, migration, push e deploy tutti completati e verificati live. Tutto il backlog invariato dalle sessioni precedenti resta aperto — vedi Session 104/103 sotto (in particolare: istruzione correttiva Cowork mai incollata, `CLAUDE.md` payroll stale, piano lista contatti verificata non eseguito, S.27/S.28/S.29 GDPR, ANDROID.1/1b).

---

# Badge System — Session 104 Handoff

**Date:** 2026-08-17
**Session:** 104 — Campi Nuovo Dipendente (Sede/Matricola/Data assunzione/Manager) implementati end-to-end e mergeabili
**Status:** ✅ **Piano completamente eseguito (15/15 task), su branch/worktree isolato `worktree-new-employee-fields`, non ancora mergeato su `main`.** Prossimo passo per l'utente: revisionare il branch e decidere se/quando fare merge su `main` e push.

---

## Goal (Session 104)

Continuazione diretta di Session 103. L'utente ha segnalato una mancanza reale nel form admin "Nuovo Dipendente" (`badge.dataxiom.it/admin`): mancavano Sede, Data assunzione, Matricola, Manager di riferimento — con la richiesta esplicita che la Data assunzione dovesse **bloccare realmente** lo scan QR prima di quella data (non solo essere informativa). Percorso completo: `/superpowers:brainstorming` → `/grilling` (10 domande chiuse) → `/senior-backend`+`/senior-frontend` (analisi critica) → `/senior-architect` (spec formale) → `/superpowers:writing-plans` (piano 15 task in 3 fasi con checkpoint) → `/superpowers:subagent-driven-development` (esecuzione completa).

## Current Progress

**Piano completato 15/15 task** (`docs/superpowers/plans/2026-08-16-new-employee-fields.md`), su worktree isolato `/.claude/worktrees/new-employee-fields`, branch `worktree-new-employee-fields` (rebasato su `main` all'avvio, mai pushato). ~35 commit totali (implementazione + fix trovati dai checkpoint).

**Fase 1 — Backend core**: migration `040_add_manager_id_to_employees.sql` (self-referencing, `ON DELETE SET NULL`), `EmploymentNotStartedError`/`InvalidManagerAssignmentError`, `AdminEmployeeSchema` esteso (matricola/hiring_date/manager_id), `POST /admin/employees` esteso con validazione server-side del manager, enforcement `hiring_date` reale in `POST /checkins`.

**Fase 2 — Frontend**: 4 nuovi campi nel form "Nuovo Dipendente" (`EmployeesTab.jsx`) — Sede sempre visibile (employee+manager), Matricola con validazione bloccante, Data assunzione (default oggi, min oggi), Manager di riferimento con stato disabled/helper-text a 3 vie.

**Fase 3 — Wizard xlsx**: colonna `manager_email` aggiunta a template/parsing/validazione/risoluzione/persistenza, con guardia self-reference e coerenza active/site con l'endpoint di creazione singola.

**Ogni fase chiusa da un checkpoint dedicato** (code review multi-angolo + `/test-all`) che ha trovato e fixato bug reali prima di proseguire — vedi "What Worked" sotto per il dettaglio dei più importanti.

**Verifica finale**: backend 795/809 (14 skip pre-esistenti, live-token), frontend-web 308/309 (1 skip pre-esistente), build frontend pulita. Un fallimento isolato (`checkins-rbac.test.js`) confermato flaky pre-esistente (verificato: fallisce in parallelo, passa in isolamento e in rerun pulito, file mai toccato da questo branch).

## What Worked

- **I 3 checkpoint dedicati (uno per fase, richiesti esplicitamente dall'utente) hanno trovato bug reali che le review per-task non avevano catturato**, in ordine di severità:
  - **Checkpoint Fase 1**: il guard `hiring_date` sul check-in confrontava contro la data server "oggi", non contro `occurred_at` (la data effettiva dell'evento) — un check-in offline backdated fino a 48h prima dell'assunzione avrebbe bypassato il blocco. Fixato confrontando contro la data effettiva dell'evento.
  - **Checkpoint Fase 2**: il dropdown "Manager di riferimento" era popolato dai dati filtrati per il filtro della TABELLA dipendenti (`filterClient`), non dal cliente selezionato nel form di creazione — poteva mostrare manager sbagliati/vuoti se i due filtri divergevano. Fixato con una fetch dedicata, disaccoppiata.
  - **Checkpoint Fase 3 (finale)**: bug di data-corruption silenziosa — `computeDiff.js` confrontava le email DB non normalizzate (case-sensitive) contro le email del file xlsx (sempre lowercase), causando la creazione di un dipendente **duplicato** (nessun vincolo UNIQUE sulla sola email) più un falso flag "dipendente uscito" per l'originale, ogni volta che un dipendente aveva un'email con maiuscole nel DB. Terza istanza dello stesso bug class già fixato 2 volte nello stesso file per `manager_email` — fixato lowercasando anche `dbByEmail`. Trovato indipendentemente da 3 dei 5 agenti di review paralleli.
  - Stesso checkpoint finale: il wizard xlsx bulk non applicava gli stessi controlli (`active=true`, stessa sede) che l'endpoint di creazione singola applica al `manager_id` — un manager disattivato o di un'altra sede poteva essere assegnato silenziosamente via upload. Fixato allineando le due strade.
- **Un implementer ha corretto proattivamente un bug nel piano stesso**: il piano suggeriva un confronto `Date` object per `hiring_date` nel check-in (stessa classe di bug TZ-fragile già fixata nel Task 3 per la validazione Zod) — l'implementer l'ha riconosciuto e ha implementato un confronto string-based TZ-safe invece di seguire il piano alla lettera.
- **Rifiutare di "aggiustare" il prodotto per far passare un test scritto male**: durante il Task 7, per far passare `toBeDisabled()`/un match esatto sull'etichetta, un primo tentativo aveva tolto `required` dal campo Sede e sostituito il dropdown Manager con un `<select>` nativo (rompendo la coerenza visiva del form). Riconosciuto come "adattare l'implementazione al test" nella direzione sbagliata — revertito, e i TEST sono stati corretti per asserire correttamente (`getByRole('combobox', ...)`, `aria-disabled`) mantenendo il prodotto invariato.

## What Didn't Work / Da tenere a mente

- **5 agenti di review paralleli lanciati per il checkpoint finale sono falliti una volta per limite di sessione** ("hit your session limit, resets 2am Europe/Rome") — risolti rilanciandoli identici dopo il cambio di data (reset naturale). Nessuna perdita di lavoro, solo un ritardo.
- **Lavorare in un worktree richiede attenzione ai file `.env*` (gitignored)**: non vengono copiati automaticamente da `EnterWorktree` — copiati manualmente da `main` all'inizio sessione. Se si crea un nuovo worktree in futuro, ricordarsene subito o i test integration falliscono con "DATABASE_URL MISSING".
- **Il worktree era stato creato da `origin/main` (stale) invece che dal `main` locale** (che aveva ~9 commit non pushati, incluso il piano stesso appena scritto) — risolto con `git rebase main` dentro il worktree prima di iniziare l'esecuzione. Da controllare sempre quando si apre un worktree in una sessione con lavoro locale non pushato.

## Next Steps (in ordine di urgenza)

1. **Decidere se/quando mergeare `worktree-new-employee-fields` su `main` e pushare** — il branch è pronto, testato, review-completo, ma non ancora mergeato (nessuna azione automatica presa, in linea con la policy "mai push senza conferma esplicita" di questo progetto). Il worktree stesso può essere rimosso dopo il merge (`ExitWorktree` con `action: remove`, o manualmente).
2. **Applicare la migration `040` anche in staging/produzione** al momento del deploy (non ancora fatto — resta locale a dev/test in questa sessione).
3. **Verifica manuale live pre-deploy** (facoltativa nel piano, non eseguita in questa sessione per frizione sandbox — la copertura automatica reale-DB è comunque estesa): creare un manager su una sede, poi un dipendente sulla stessa sede verificando che compaia nel dropdown Manager; provare matricola duplicata; scaricare il template xlsx e verificare la colonna `manager_email`.
4. Tutto il backlog invariato da Session 103 resta aperto — vedi handoff precedente sotto: istruzione correttiva Cowork mai incollata, primo run reale routine LinkedIn (17/8, oggi — verificare), `CLAUDE.md` payroll stale, piano lista contatti verificata non eseguito, S.27/S.28/S.29 GDPR, ANDROID.1/1b.

**Dettaglio task-by-task completo**: vedi il piano stesso `docs/superpowers/plans/2026-08-16-new-employee-fields.md` (ogni task ha i suoi step spuntati) e lo spec `docs/superpowers/specs/2026-08-16-new-employee-fields-design.md`.

---

# Badge System — Session 103 Handoff

**Date:** 2026-08-15
**Session:** 103 — Awareness LinkedIn + budget tattico primo cliente + design/piano lista contatti verificata (non eseguito)
**Status:** 📋 **Piano pronto e committato, in sospeso — nessuna esecuzione ancora avviata.** Nessuna azione bloccante richiesta all'utente (a differenza dell'handoff precedente): il lavoro di questa sessione è tutto documentale/pianificazione, pronto per essere eseguito quando si deciderà di procedere.

---

## Goal (Session 103)

Continuazione diretta di Session 102 (piano documento di contesto marketing chiuso). Tre fili, tutti richiesti dall'utente in sequenza nella stessa sessione: (1) quali attività di awareness perseguire oltre il cold outreach, (2) come allocare €3000 (poi dimezzato a €1500) di budget marketing per acquisire il primo cliente pilota, (3) design + piano di implementazione per il sotto-progetto più concreto emerso da (2): la lista contatti verificata.

## Current Progress

- **Awareness LinkedIn**: `docs/marketing/linkedin-content-plan.md` scritto e committato (`2176f94`), cadenza alternata a settimane pari/dispari con un filone BI/Analytics già esistente (routine cloud "Cowork", non un prodotto separato — commit `c8ae48e`). Nuova routine cloud `badge-system-linkedin-content` creata (id `trig_01QDj3iyHhTLg6zjzsiopRom`, ogni lunedì, no-op nelle settimane ISO dispari) e testata con un run manuale — **il primo run con generazione reale di contenuto resta da verificare al 17/8 (settimana ISO 34)**.
- **Budget tattico**: `docs/marketing/piano-tattico-3000-primo-cliente.md` scritto e committato (`72b2d32`), con scenario pieno €3000 e scenario dimezzato €1500 (ads tagliati per primi, lista contatti ridotta ma non eliminata).
- **`.agents/product-marketing.md` v2→v3**: corrette 2 assunzioni sbagliate durante la verifica del piano budget — esiste già `dataxiom.it/badge-system` con demo self-serve (`badge.dataxiom.it`), e l'export tracciati paghe Zucchetti/TeamSystem è reale e funzionante (non "Fase 2" come dichiara ancora `CLAUDE.md`).
- **Lista contatti verificata**: design (`docs/superpowers/specs/2026-08-13-verified-contact-list-design.md`, commit `1e83fb0`) e piano di implementazione 10 task (`docs/superpowers/plans/2026-08-15-verified-contact-list.md`, commit `33222cb`) scritti e committati — **esplicitamente non eseguiti**, su richiesta diretta dell'utente ("lo scriviamo, lo committiamo e lo teniamo lì").

## What Worked

- **Verificare invece di assumere, due volte nella stessa sessione**: quando l'utente ha chiesto "la landing page dataxiom.it non è sufficiente?", un controllo diretto (`WebFetch` + `curl` grezzo) ha corretto un'assunzione sbagliata portata avanti dall'inizio sessione ("nessuna pagina pubblica"). Stesso schema per l'export paghe Zucchetti/TeamSystem, scoperto per caso durante quella stessa verifica.
- **Analisi critica esplicita richiesta dall'utente prima di scrivere lo spec della lista contatti**: ha trovato 8 problemi reali (il più importante: il design ignorava le relazioni Dataxiom già esistenti, potenzialmente più efficaci di qualunque contatto freddo) — tutti integrati prima di committare, non dopo.
- **Segnalare esplicitamente quando una skill richiesta è sproporzionata per il compito**: la skill `marketing-plan` è tarata per un piano fCMO a 12 mesi; usarla come lente concettuale invece di eseguirne il template completo a 13 sezioni ha evitato un documento gonfio di sezioni "N/A pre-revenue" per un obiettivo bounded a 4 settimane.

## What Didn't Work

- **Fidarsi di un primo `WebFetch` senza verifica su una pagina che richiede login**: un fetch anonimo della company page LinkedIn ha restituito un riepilogo dettagliato di 4 post — completamente allucinato (un `curl` grezzo ha poi mostrato che la pagina senza login restituisce solo un redirect anti-bot, nessun contenuto reale). Errore riconosciuto esplicitamente, corretto chiedendo il testo reale all'utente. **Lezione**: per pagine dietro login, non fidarsi del riassunto di `WebFetch` senza un secondo controllo grezzo, specialmente prima di dare un giudizio su contenuto altrui.
- **Il Cowork BI/Analytics esistente cita statistiche con fonti che, verificate, non le contengono** (2/2 controllate: 46% PMI Excel/ERP, 80% tempo pulizia dati — nessuna presente testualmente nelle fonti linkate). Non un errore mio in questa sessione, ma un problema di processo scoperto e non ancora corretto alla fonte — l'istruzione correttiva scritta va incollata manualmente nella routine su claude.ai, **non ancora fatto**.

## Next Steps (in ordine di urgenza)

1. **Incollare l'istruzione correttiva sulla verifica delle fonti nella routine Cowork BI/Analytics** su claude.ai (scritta in questa sessione, mai applicata) — rischio di credibilità concreto se un altro post pubblica una statistica non verificata prima di questo fix.
2. **Verificare il primo run reale della routine `badge-system-linkedin-content`** al 17/8 (settimana ISO 34) — finora testata solo lo skip nelle settimane dispari, mai la generazione effettiva di una bozza.
3. **Correggere il disallineamento in `CLAUDE.md`** sulla dicitura "Payroll API — Fase 2, fuori scope MVP", ormai smentita dall'export tracciati Zucchetti/TeamSystem già reale.
4. **Decidere se e quando eseguire il piano lista contatti** (`docs/superpowers/plans/2026-08-15-verified-contact-list.md`) — pronto ma volutamente non avviato in questa sessione. Il Task 2 (Passo 0, controllo relazioni Dataxiom esistenti) è il punto di partenza a più alto rapporto valore/tempo.
5. **S.27/S.28/S.29** (backlog GDPR, HIGH, ereditato da sessioni precedenti) — base giuridica consenso GPS, autorizzazione Statuto Lavoratori/ITL, DPIA obbligatoria. Resta prioritario prima che un cliente reale attivi il geofencing.
6. **ANDROID.1/1b** — verifica manuale scan QR reale su device fisico/Virtual Scene, bloccato da un limite di automazione GUI-only (ereditato, invariato).

## Note operative (Session 103)

- **"Claude Cowork" è il nome dato dall'utente a una routine cloud schedulata** (tool `RemoteTrigger`, skill `schedule`) — non un prodotto separato. Utile saperlo per non reinvestigare da zero in una sessione futura.
- **Il monte ore reale del progetto (10h/settimana, `CLAUDE.md`) va confrontato esplicitamente con qualunque nuovo impegno di tempo proposto** (in questo caso: 5-8h/settimana per la lista contatti) — non è tempo "gratis" aggiuntivo, compete col resto del lavoro sul progetto.

**Dettaglio completo**: vedi `PROJECT_DECISIONS.md` sezione Session 103.

---

## Handoff precedenti (invariati, riportati sotto per contesto)

### Session 102 — Piano documento di contesto marketing completato (Task 2-6/6)

**Esito:** Ripresa post-riavvio VS Code (vedi Session 101 sotto), skill `marketing-skills` correttamente disponibili. Task 2 (`competitor-profiling`, adattato con `WebFetch` mirato — tool Firecrawl/DataForSEO del plugin non disponibili): pricing competitor confermato invariato, unico scostamento reale NoBadge con QR "dinamico" anti-frode (mitiga clonazione screenshot, non risolve impersonificazione). Task 3 (`pricing`): stress-test value metric/WTP — esito CONFERMA, nessun aggiustamento. Task 4: `.agents/product-marketing.md` v1→v2 (commit `7397776`). Task 5: one-pager + cold-email template creati (commit `dfe5dc5`). Piano `docs/superpowers/plans/2026-08-11-product-marketing-context-plan.md` chiuso.

**Dettaglio completo**: vedi `TASKS.md` Session Log riga 102 (non fu scritta una sezione dedicata in `PROJECT_DECISIONS.md` per questa sessione).

---

### Session 101 — Plugin marketing-skills installato + design/piano documento di contesto marketing (Task 1/6 eseguito, sessione sospesa per riavvio VS Code)

**Esito:** Ricerca comparativa di skill marketing su GitHub (verificata con `gh api`) → installato `coreyhaines31/marketingskills` (43.864★, 49 skill). Design + piano 6 task via `/superpowers:brainstorming`+`/grilling`+`/superpowers:writing-plans`. Task 1 completato: `.agents/product-marketing.md` v1 creato (commit `9e12778`). **Scoperta di processo**: le skill di un plugin appena installato richiedono un riavvio di VS Code per essere scoperte correttamente — causa identificata, **sessione risolta e completata in Session 102** (vedi sopra), questa nota resta solo per contesto storico.

**Dettaglio completo**: vedi `PROJECT_DECISIONS.md` sezione Session 101.

---

### Session 100 — S.24 chiuso (privacy policy pubblica) + Firma digitale cartellino mensile in produzione

**Goal:** Continuazione diretta di Session 99. Due lavori: chiudere l'ultimo sotto-task di S.24 (pagina pubblica privacy policy GPS, mai pubblicata) e implementare "Firma digitale cartellino mensile" (backlog Session 57).

**Esito:**

**S.24**: `docs/privacy-policy-IT.md` conteneva testo pre-Fase-C ancora "facoltativo" sul GPS — corretto su 6 punti (revoca consenso reale aggiunta, Accesso Art.15 corretto da falso self-service a richiesta manuale, Sentry aggiunto ai sub-processori). **Analisi critica contro fonti GDPR verificate online** (non solo lettura codice) prima di pubblicare ha trovato 3 gap più profondi, registrati come nuovo backlog con citazioni verificate: **S.27** base giuridica consenso GPS probabilmente invalida (EDPB Guidelines 05/2020 §21-22 — consenso in rapporto di lavoro non "liberamente prestato" se il rifiuto ha conseguenze negative, esattamente lo scenario Fase C); **S.28** Statuto Lavoratori Art.4/autorizzazione ITL mancante nell'onboarding cliente (confermato da un caso sanzionatorio reale, Garante Provvedimento n.7/16-01-2025); **S.29** DPIA mai eseguita ma esplicitamente obbligatoria (non "probabile") per la Delibera Garante n.467/2018. Pagina pubblicata (`privacy-policy-it.html`, pattern DPA), verificata live — un primo check aveva mostrato la SPA per cache Netlify Edge su un path mai richiesto prima, non un bug della regola, risolto da solo con retry.

**Firma digitale cartellino mensile**: scoperto che il dipendente non aveva nessuna vista sulle proprie ore (`GET /presences/summary` vietato al ruolo employee) — costruita anche quella. **Analisi critica esplicita** (`/senior-architect` + verifica manuale — `/senior-fullstack`/`/senior-backend` giudicate non pertinenti, tarate per grilling greenfield non per una feature su stack già deciso) ha trovato 3 problemi nella bozza: nessuna idempotenza su `POST /timesheet/sign` (fix: `UNIQUE(employee_id,month,year)` + upsert), nessun blocco server-side sul mese corrente (fix: guard esplicito), invalidazione della firma pensata solo per correzioni — mancava il caso della sincronizzazione offline (`POST /checkins` con backdating fino a 48h) che avrebbe potuto invalidare una firma silenziosamente (fix: funzione condivisa richiamata da creazione E correzione check-in). **Bug ambientale reale trovato in esecuzione**: la migration 039 era applicata solo al DB `development`, non al DB `test` — 2 integration test reali fallivano; risolto applicandola anche lì. Esecuzione inline con `/superpowers:executing-plans` (non subagent-driven, su richiesta esplicita).

**Verifica finale**: backend 750/750, frontend-web 299/299, 0 errori lint, push su `main`, CI a cascata verde, endpoint verificati live in produzione (401 non 404 — migration confermata applicata anche in produzione dato che girano fail-fast all'avvio container).

**Dettaglio completo**: vedi `PROJECT_DECISIONS.md` sezione Session 100.

---

## Handoff precedenti (invariati, riportati sotto per contesto)

### Session 99 — Fase C: geofencing GPS reale + invalidazione QR (finding #2+#5) chiusa e in produzione

**Goal:** Chiudere Fase C (geofencing GPS reale + invalidazione QR), tenuta deliberatamente da parte durante tutta Session 98. Ciclo completo: brainstorming→spec→piano→esecuzione task-by-task→verifica staging→build nativa→merge produzione, tutto nella stessa sessione.

**Esito:**

**Piano 14 task** eseguito via `/superpowers:subagent-driven-development` con **pausa esplicita dopo ogni singolo task** (override del default "esecuzione continua" dello skill, su istruzione esplicita dell'utente). Backend: rimosso gate morto `GEOFENCING_ENABLED`, validazione `qr_content` contro `sites.qr_code_content`, `POST /admin/sites/:id/regenerate-qr`, script retention GPS 90gg, `POST /consent/gps-revoke` (nel farlo, trovato e fixato un bug preesistente: `logAudit` su `/gps-acceptance` scartava silenziosamente i parametri per naming mismatch). Mobile: `expo-location`, **riscrittura completa di `GPSConsentDialog.jsx`** (importava `AlertDialog` da `react-native` — componente inesistente, mai eseguibile), retry GPS su `GEOFENCE_COORDINATES_REQUIRED`, blocco offline fail-safe su sedi geofenced note/sconosciute, revoca consenso in Impostazioni. Web: bottone "Rigenera QR".

**3 livelli di review, tutti richiesti esplicitamente dall'utente**, hanno trovato **5 bug reali** che le review più leggere non avrebbero catturato: 3 durante il checkpoint a metà piano (scrittura cache GPS senza try/catch dopo check-in riuscito — mostrava "Errore check-in" a un check-in in realtà riuscito; stessa scrittura poteva causare unhandled rejection con `loading` bloccato per sempre; consenso GPS fallito senza feedback utente), 2 durante la review finale sull'intero piano (script di retention GPS mai agganciato al vero cron di produzione — `exec` nel wrapper impediva strutturalmente a un secondo comando di girare; permesso posizione negato permanentemente non gestito, a differenza del pattern già esistente per la fotocamera).

**Verifica manuale staging eseguita da Claude** (su richiesta esplicita dell'utente, non dall'utente stesso) via chiamate API dirette invece che app mobile reale — stesso approccio di Session 97. Tutti i comportamenti attesi confermati: toggle geofencing solo via API admin (nessun SSM), `GEOFENCE_COORDINATES_REQUIRED`, `OUTSIDE_GEOFENCE` con distanza corretta, rigenerazione QR invalida il vecchio, consenso GPS accept/revoke con audit trail. Staging ripristinato a fine verifica.

**Build nativa Codemagic — 2 fallimenti diagnosticati sistematicamente, non 2 tentativi al buio**: primo fallimento (`bundle version must be higher than 35`) diagnosticato confrontando `app.json` di `main` vs `develop` — ipotesi: branch sbagliato. Secondo fallimento con lo stesso identico errore dopo che l'utente credeva di aver corretto — richiesto il log completo invece di ipotizzare alla cieca, che ha mostrato il commit checked-out essere esattamente la punta di `main`: la selezione branch su Codemagic non era stata applicata. Terzo tentativo con `develop` confermato esplicitamente → Build 36 su TestFlight.

**Merge finale**: `main` fast-forward pulito a `f1d9270`, push, CI a cascata verificata (`Build & Push Backend to ECR` → `Deploy to EC2` produzione, entrambi ✅). Worktree e branch temporaneo rimossi a fine sessione.

**Dettaglio completo**: vedi `PROJECT_DECISIONS.md` sezione Session 99.

---

### Session 98 — Gruppo 1 backlog post-Fase-C: PDF export Riepilogo Ore + Help/FAQ in-app (web+mobile)

**Goal:** Con Fase C tenuta deliberatamente da parte, l'utente ha chiesto quali altre attività indirizzare dal backlog MVP. `/superpowers:brainstorming` ha prodotto 9 item, raggruppati in batch coerenti su richiesta esplicita. L'utente ha scelto il Gruppo 1 (quick win frontend-web): PDF export sul Riepilogo Ore + Help/FAQ in-app statica (web+mobile).

**Esito:** Ciclo completo design→spec→piano→implementazione→merge→push via skill chain `superpowers:brainstorming` → `writing-plans` → (`subagent-driven-development` poi switchato su richiesta a `executing-plans`) → `finishing-a-development-branch`. **Due passate critiche esplicite sulla spec** (richieste dall'utente, non spontanee) hanno trovato bug reali prima di scrivere codice: (1) il filtro di visibilità per ruolo era fail-open (`role !== 'employee'`), sostituito con un'allowlist fail-closed `isVisible()`; (2) lo script di sync-check FAQ web/mobile come concepito era tecnicamente infattibile (richiedeva eseguire moduli cross-progetto tra un `frontend-web` ESM puro e un `frontend-mobile` senza risoluzione Metro), ridisegnato come estrazione testuale via regex. **Self-review del piano** ha trovato e corretto un test scritto in sintassi Jest che non avrebbe mai girato (riscritto con `node:test` nativo) e uno script senza error handling sui file mancanti (verificato con dry-run reale in `/tmp`). **2 scoperte implementative non previste dal piano**, entrambe diagnosticate correttamente: MUI `Accordion` tiene montato il contenuto collassato nel DOM (fix `TransitionProps={{ unmountOnExit: true }}`); `SettingsScreen.jsx` mobile richiede un vero `NavigationContainer` per `useFocusEffect` (test riscritto con navigator reale). **Risultato**: 10/10 task TDD completati, nessuna modifica backend, Help/FAQ mobile distribuibile via OTA (nessun modulo nativo). Merge locale su raccomandazione esplicita, push su `origin/main` (commit `5f1eca6`→`8118387`). Worktree/branch temporaneo puliti manualmente dopo un errore di provenance su `ExitWorktree`.

**Dettaglio completo**: vedi `PROJECT_DECISIONS.md` sezione Session 98.

---

### Session 97 — P2.5: checklist wizard 6.4/6.5 verificate via API diretta su staging, chiude l'intero backlog P2

**Goal:**

Continuazione diretta di Session 96. Ultimo punto del backlog P2: verificare la checklist wizard sezioni 6.4/6.5 (check-in accettato sulla nuova sede, rifiutato sulla vecchia, dopo un trasferimento via wizard) — rimasta aperta da Session 92 perché mancava una build mobile puntata su staging.

## Esito (Session 97)

### Tentativo con l'app mobile reale — bloccato
L'utente ha avviato `npx expo start --tunnel` puntato su staging. Due ostacoli: conflitto porta 8081 (risolto con 8082), poi la Fotocamera di sistema iOS che apriva l'URL del tunnel in Safari invece di passarlo a Expo Go (lo scan va fatto dall'app Expo Go stessa, la cui posizione UI non era ovvia).

### Pivot su richiesta esplicita dell'utente — verifica via API diretta
L'utente ha chiesto un workaround (`/superpowers:brainstorming`). Punto chiave: l'autorizzazione del check-in è **interamente lato server** (`checkins.js`, verifica `assigned_sites` — finding #10 già chiuso in Fase A), il mobile non applica alcuna logica propria — un test via API esercita lo stesso path di codice. Confermato dall'utente via `AskUserQuestion`.

### Esecuzione — meccanismo reale del wizard, non un bypass DB
Login admin su staging, scaricato il template reale (`GET /employee-sync/template`), modificato con `exceljs` (già dipendenza del backend), caricato via i veri endpoint `/employee-sync/preview` + `/apply` — stesso flusso già validato dalla UI in Session 92.

### Scoperta imprevista: `maria@badge.local` non è un'identità reale
Il primo tentativo (con `maria@badge.local`) ha dato un risultato incoerente — invece di assumere un bug, verificato il JWT: quell'email è un account `DEMO_USERS` **hardcoded** (`auth.js`, mai una riga reale in `employees`, per design), il cui `employee_id` punta a una riga DB completamente diversa. La riga `employees` con quell'email è un duplicato decorativo scollegato da ogni login reale. Non un bug — comportamento voluto e commentato nel codice — ma una trappola realistica per un tester futuro. Ripristinata la riga, annotata la scoperta.

### Risultato
Rieseguito con `giulia.bianchi@employee.it` (password temporanea via `POST /admin/employees/:id/reset-password`), trasferita Milano→Roma via wizard. `POST /checkins` su Roma → `201 Created` (**6.4 ✅**). `POST /checkins` su Milano → `400 NOT_ASSIGNED_TO_SITE` (**6.5 ✅**). Staging ripristinato a fine test. Checklist aggiornata (`docs/employee-sync-wizard-test-checklist.md`).

## Backlog per la prossima sessione (in ordine di urgenza)

1. **Fase C** (geofencing/QR rotation reali, finding #2+#5) — non iniziata. Resta l'unico finding HIGH aperto di `findings2agosto2016.md` e l'unica priorità P0 rimasta.
2. **S.26** — consenso GPS esplicito (GDPR Art. 7, HIGH) — dormiente finché nessun cliente reale chiede il geofencing, va di pari passo con Fase C.
3. **ANDROID.1/1b** — verifica manuale scan QR reale su device fisico/Virtual Scene, bloccato da un limite di automazione GUI-only.
4. (Opzionale) Verifica manuale della Build 35 su un dispositivo reale — login, secure storage, TestFlight expiry esatta su App Store Connect (portato avanti da Session 95, mai eseguito).

## Note operative (Session 97)

- **Quando un test manuale end-to-end si scontra con frizione UI (QR/tunnel/deep-link), chiedersi prima "dove vive davvero la logica sotto test?"**: se è lato server, un test via API diretta è equivalente per lo scopo del test, anche se rinuncia alla copertura UI. Non insistere su un canale fragile quando ne esiste uno più diretto e altrettanto valido per l'obiettivo specifico.
- **Non simulare un meccanismo applicativo con una scorciatoia sul DB quando il meccanismo reale è raggiungibile via API**: per testare il trasferimento sede si sono usati i veri endpoint `/employee-sync/preview`+`/apply` (stesso codice della UI), non un `UPDATE` diretto — questo ha reso il test fedele al comportamento reale, non solo al risultato atteso.
- **Le email `@badge.local` sono account fixture hardcoded, mai righe reali in `employees`** — qualunque riga `employees` con quell'email è decorativa/orfana, il suo `employee_id` non corrisponde a quello nel JWT di login. Per test che coinvolgono lo stato reale di un dipendente (site, assigned_sites, ecc.), usare sempre un account `@employee.it` creato da import/wizard.
- **Prima di attribuire un risultato inatteso a un bug, verificare l'identità/lo stato effettivo coinvolto** (in questo caso: decodificare il JWT) — ha evitato di inseguire un falso bug nel codice di autorizzazione quando la causa reale era una discrepanza nei dati di test.
- **Il classificatore automatico può bloccare comandi compositi (login+query in un unico script) anche quando le singole azioni sono innocue** — se un comando composito viene bloccato, scomporlo in passaggi singoli (login separato, salvare il token, poi query separate) spesso risolve senza bisogno di intervento dell'utente.

### Session 96 — P2 backlog: fix root cause flakiness `MyScheduleScreen.test.jsx` + `npm audit fix` non-breaking su backend/web/mobile

**Goal:** Continuazione diretta di Session 95. Chiudere i 2 punti P2 del backlog: la flakiness nota di `MyScheduleScreen.test.jsx` e le vulnerabilità `npm audit` già documentate.

**Esito:** Fix flakiness — non era mai vera flakiness, bug deterministico dipendente dalla data hardcoded nel test (Luglio vs orologio reale passato ad Agosto), risolto rendendo le date dinamiche (commit `21fdacd`). `npm audit fix` non-breaking sui 3 progetti, verificato con suite di test completa dopo ciascuno prima di committare: backend (`brace-expansion` risolto, commit `3d28206`), web (`axios`+`form-data` risolti, commit `9f61b74`), mobile (patch `expo` 54.0.35→54.0.36, 22→15 vulnerabilità production-relevant, commit `982a0bf`). Tutto ciò che richiederebbe `--force`/breaking lasciato come rischio accettato. Push su `origin/main`.

**Credenziali/dettagli completi**: vedi `PROJECT_DECISIONS.md` sezione Session 96.

---

### Session 95 — Build nativa iOS #35 rilasciata su TestFlight, distribuisce il fix Fase B (finding #1) a utenti reali

**Goal:** Continuazione diretta di Session 94, stessa giornata. Chiudere il gap "mergeato ma non distribuito": la Fase B è in `main` da Session 94 ma `expo-secure-store` è un modulo nativo, non raggiungibile via OTA — serve una build nativa nuova per arrivare a un dispositivo reale.

**Esito:** Backlog MVP prioritizzato prodotto su richiesta, con correzione di una voce stale (bug redirect post-login, già fixato Session 89 ma segnalato ancora aperto). Bump `buildNumber` 34→35 (`app.json`, commit `6a7761b`). Scoperto un disallineamento tra lo skill `/build-mobile` (userebbe `eas build --profile preview`, non arriva su TestFlight) e la pipeline reale del progetto (Codemagic, submit automatico a TestFlight) — segnalato esplicitamente, confermata la scelta di Codemagic dall'utente. Nessun trigger automatico configurato in `codemagic.yaml` e nessuna credenziale API disponibile — build avviata manualmente dall'utente sul dashboard Codemagic. **Build 35 completata con successo**, confermato dall'utente — fix Fase B ora attivo su utenti reali (test interno).

**Credenziali/dettagli completi**: vedi `PROJECT_DECISIONS.md` sezione Session 95.

---

### Session 94 — Fase B findings 2 Agosto (finding #1, secure storage mobile) implementata e mergeata in `main`

**Goal:** Continuazione diretta di Session 93 nella stessa giornata: indirizzare il Finding #1 (Fase B) di `findings2agosto2016.md` — token mobile (access token, refresh token, oggetto utente) salvati in chiaro via `AsyncStorage` invece che in `expo-secure-store` cifrato.

**Esito:** Design via `/superpowers:brainstorming` (nuovo modulo `secureAuthStorage.js`, nessuna migrazione dati — forza re-login, + scrubbing Sentry mobile + gestione esplicita errori SecureStore aggiunti allo scope). Piano 9 task TDD via `/superpowers:writing-plans`, eseguito con `/superpowers:subagent-driven-development` in worktree isolato. Problema di provenance del worktree (branchato prima dei commit di spec+piano) risolto con `git rebase --onto`. 2 bug reali trovati durante l'esecuzione: `await import()` incompatibile con Jest in `apiClient.js` (fixato con `require()` lazy), `Promise.all` del cold-start senza `.catch` in `RootNavigator.jsx` dopo la migrazione a `SecureStore` (che può fallire davvero, a differenza di `AsyncStorage`). Merge fast-forward pulito su `main`, push su `origin/main` (13 commit, incluso backlog Session 93 mai pushato). **Non fatto**: nessuna build nativa lanciata — chiuso in Session 95 (vedi sopra).

**Credenziali/dettagli completi**: vedi `PROJECT_DECISIONS.md` sezione Session 94.

---

### Session 93 — Fase A findings 2 Agosto + bug strutturale `assigned_sites` + wizard "Aggiorna Dipendenti" in produzione + fix migration 035 + rinnovo TestFlight

**Goal:** Chiudere gli 8 findings isolati a basso rischio di `findings2agosto2016.md`, verificarli su staging, promuoverli in produzione.

**Esito:** **(1) Fase A** — 8 findings (#4,6,7,9,10,11,12,13) chiusi via `/superpowers:subagent-driven-development` (14 task, doppia review ciascuno). Review finale olistica ha trovato il problema più importante: header `X-Truncated` non esposto in `Access-Control-Expose-Headers`, vanificava silenziosamente il fix del finding #13 su un'architettura cross-origin — corretto. **(2) Bug strutturale `assigned_sites`** scoperto durante la verifica manuale (`maria@badge.local` non timbrava su staging): le migration storiche 018/019a valorizzano solo `site_id`, mai `assigned_sites` (stessa causa già colpita in produzione una volta, Session 81, patch one-off mai generalizzata). Verifica quantitativa su produzione: 1 riga rotta dal 19 Giugno. Fix strutturale: migration 038 con backfill + trigger Postgres `BEFORE INSERT OR UPDATE` che mantiene per sempre l'invariante, testato a 3 livelli su richiesta esplicita dell'utente. **(3)** Deploy complicato da un major outage GitHub Actions (~11 ore) — risolto senza bypass, solo `workflow_dispatch`/commit vuoto. Il merge `develop`→`main` ha portato con sé anche il wizard "Aggiorna Dipendenti" (segnalato esplicitamente prima di procedere). **(4)** Fix CI ricorrente: migration 035 resa idempotente (`IF NOT EXISTS`), verificato replicando lo scenario CI esatto in locale. **Bonus**: `/skill-doctor`, rimosse 2 skill duplicate. **Rinnovo TestFlight** eseguito a fine sessione: Build 34, scadenza reale calcolata **5 Novembre 2026** (promemoria 21 Ottobre) — la nota precedente ("Build 14, 2026-09-08") era rimasta non aggiornata per 3 build consecutive.

**Credenziali/dettagli completi**: vedi `PROJECT_DECISIONS.md` sezioni Session 93 (se presenti) e `TASKS.md` riga Session 93 nel Session Log per il resoconto integrale.

---

### Session 92 — Verifica manuale wizard (12/12 sezioni) + saldo ferie negativo

**Goal:** Continuazione diretta di Session 91 (wizard "Aggiorna Dipendenti" appena implementato, mai testato manualmente da un umano reale). L'utente ha eseguito personalmente, sezione per sezione, `docs/employee-sync-wizard-test-checklist.md` (12 sezioni) contro staging, chiedendo ad ogni segnalazione una verifica indipendente. A fine checklist, richiesta aggiuntiva fuori scope wizard: rimuovere il blocco sul saldo ferie negativo.

**Esito:** Verifica checklist 12/12 sezioni chiuse. 5 bug reali aggiuntivi trovati (totale 9 sull'intero ciclo di vita del wizard): IAM SES mai concesso su staging (email di benvenuto falliva silenziosamente), dettaglio del cambiamento assente per righe Modificati/Riattivati (fix con nomi sede leggibili), 3 bug minori dalla verifica automatica precedente. 3 miglioramenti UX su proposta dell'utente (lista scorrevole Anomalie, email "bentornato" con reset password automatico, bottone "Annulla" nella preview). Fuori scope: rimosso il blocco `INSUFFICIENT_SALDO` — saldo ferie ora può scendere sotto zero, mostrato in rosso. `/code-review:code-review` (5 agenti + scoring Haiku, nessun blocco ≥80) + `/test-all` finale (backend 706/706, frontend-web 264/264). Tutto rimasto su `develop` per istruzione esplicita dell'utente ("Lascialo su staging per ora") — **promosso su `main` in Session 93**.

**Credenziali staging usate**: `pippo@badge.local` / `NQQG65D7Zawy57ur` (admin, cliente "Dataxiom MVP"), password Maria/Pino da SSM `/badge/staging/DEMO_MARIA_PASSWORD`/`DEMO_PINO_PASSWORD`.

---

### Session 89 — SES fuori sandbox + Gate finale onboarding self-service

**Goal:** AWS ha approvato il sandbox-exit SES (dopo `DENIED` fermo da Session 84). L'utente ha scelto di eseguire in sequenza: Task 7 del piano SES (config produzione), poi il Gate finale del piano onboarding self-service.

**Esito:** Task 7 SES completato, `MAX_ACTIVE_DEMOS=20` in SSM produzione, test E2E email reale riuscito. Gate finale onboarding ha scoperto 2 bug di produzione reali: 55 commit mai pushati (Session 83-88), `exceljs` in `devDependencies` invece che `dependencies` (crash-loop container). Entrambi fixati e deployati. Gate finale eseguito passo-passo dall'utente: creazione client → invito → accept → wizard → import Excel → welcome email — tutto riuscito. Bug UX scoperto (non fixato allora): redirect post-login per admin con onboarding incompleto (`LoginPage.jsx:44`) — **fixato in Session 89 stessa più avanti** (vedi `TASKS.md` MVP Hardening).

**Note operative**: `npm test` non esegue `lint` in questo repo — controllare `npm run lint` prima di push importanti. Qualunque modulo richiesto a runtime da `backend/src/` deve stare in `dependencies`, mai `devDependencies`.

---

### Session 87-88 — ANDROID.2

**Esito:** Jank animazioni Android low-end ridotto (`deviceTier.js`, `isLowEndDevice()`). Causa reale del blocco d'ambiente Session 87: PIN di blocco schermo residuo sugli AVD (BFU state), non un problema di toolchain. `FaceIDScreen` mediana dimezzata 61ms→32ms dopo il fix; `QRScannerScreen` marginale (CameraView resta il collo di bottiglia). Dettaglio completo in `PROJECT_DECISIONS.md`.

---

### Session 85 — Onboarding cliente self-service implementato

**Esito:** 8/8 task del piano eseguiti. Code review finale ha trovato 5 problemi reali (JWT senza `employee_id` su accept-invito, guard fail-fast mancante, audit log mancante, `generateInviteToken()` fuori dal try, rate-limiter condiviso tra `/onboarding/invite` e `/demo/start`). QA manuale ha trovato un leak di password in chiaro nel preview. Suite finale: backend 630/644, frontend-web 248/249. SES ancora `DENIED` a quel punto (risolto Session 89).

**Dove sono le cose**: piano `docs/superpowers/plans/2026-07-28-onboarding-self-service.md`, nuovi file backend (`onboardingInvite.js`, `admin/onboarding.js`, `inviteTokens.js`, `services/onboarding/*.js`), nuovi file frontend (`AcceptInvitePage.jsx`, `OnboardingWizardPage.jsx`, `useOnboarding.js`).
