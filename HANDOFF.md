# Badge System — Session 121 Handoff

**Date:** 2026-09-13
**Session:** 121 — Upgrade RDS PostgreSQL 14→16 (evita Extended Support), pulizia repo, ONB.2 (mezze giornate Ferie) via `/superpowers:brainstorming`→`/superpowers:writing-plans`→`/superpowers:subagent-driven-development` (16 task), 3 bug reali di produzione trovati e fixati durante l'esecuzione, pipeline CI/CD sbloccata dopo il merge (4 problemi indipendenti da ONB.2)
**Status:** ✅ **Tutto mergiato su `main`, pushato, pipeline CI/CD verde, deploy EC2 completato, `/health` produzione verificato `200`/`database: connected`.** Nessun task pending residuo di questa sessione, salvo un follow-up non bloccante documentato (vedi Next Steps).

## Goal (Session 121)

Tre richieste distinte nella stessa sessione: (1) rispondere a una notifica AWS Health sulla fine del supporto standard PostgreSQL 14 e decidere/eseguire l'upgrade; (2) piccola manutenzione repo (`.DS_Store`, cartella `Cybersecurity/` fuori posto, un task di backlog con etichetta stale); (3) implementare ONB.2 (supporto mezze giornate nei saldi Ferie), una voce di backlog che l'utente ha chiesto di affrontare con un'analisi critica approfondita prima di scrivere qualunque codice.

## Current Progress

**AWS.1 — Upgrade RDS PostgreSQL 14→16**: notifica AWS Health (`AWS_RDS_PLANNED_LIFECYCLE_EVENT`) su fine supporto standard PG14 il 28/2/2027, dopo la quale scatterebbe l'Extended Support a pagamento (~$146/mese anni 1-2, ~$292/mese anno 3+, su questa istanza da 2 vCPU). Eseguito con approccio test-first: istanza di test ripristinata da uno snapshot recente (`badge-system-db-test-pg-upgrade`), upgrade verificato lì (PG14.22→16.15, nessun errore) prima di applicare lo stesso upgrade alla produzione (`badge-system-db`), poi istanza di test eliminata. Costo totale sostenuto: ~$2-3, una tantum.

**Pulizia repo**: `.DS_Store` (3 file, già tracciati per errore) rimossi dal tracking git + aggiunti a `.gitignore`. Cartella `Cybersecurity/` (Regolamento UE 2019/881 + note personali, non pertinente al codice del progetto) spostata fuori dal repo in `~/Documents/Cybersecurity_reference/`. Task 11 (Leave Management QA) in `TASKS.md` corretto da 🟡 a ✅ — il corpo della voce era completo dal Session 39 (giugno 2026), solo l'etichetta era rimasta stale.

**ONB.2 (mezze giornate Ferie)**: `leave_saldi`/`leave_requests` è un'area sempre-pesante secondo `CLAUDE.md` (Pattern 1/5/6, cronologia RBAC Sessioni 116-118) — passata per l'intero ciclo `/superpowers:brainstorming` → `/superpowers:writing-plans` → `/superpowers:subagent-driven-development`, non il percorso leggero. **Due round di analisi critica esplicitamente richiesti dall'utente** durante il brainstorming hanno trovato 7 problemi reali prima ancora di scrivere il piano: (1) l'ordine della migration è vincolato — Postgres rifiuta `ALTER COLUMN TYPE` su una colonna da cui dipende una `GENERATED ALWAYS`, va droppata e ricreata; (2) `node-postgres` restituisce NUMERIC come stringa JS, richiede normalizzazione centralizzata (non fix sparsi) per rispettare il formato di display deciso e non lasciare un footgun per confronti futuri; (3) bug reale pre-esistente in `parseWorkbook.js` — un saldo decimale importato veniva silenziosamente arrotondato (`normInt`); (4) 4 punti duplicati nel frontend (web+mobile) ricalcolavano il conteggio giorni dalle date invece di usare `num_days` dal backend, sempre sbagliato per una mezza giornata; (5) l'app mobile ha form di richiesta indipendenti dal web, nessun pacchetto condiviso; (6) il controllo di mutua esclusione Evento/Ferie/Malattia (Pattern 7) è basato solo su range di date — nessuna modifica necessaria, ma serve un test di blocco esplicito perché non è ovvio dal codice; (7) la Planning Page blocca l'intero giorno anche per mezza ferie (limitazione nota, accettata esplicitamente dall'utente, non risolta in questo lavoro). Spec: `docs/superpowers/specs/2026-09-12-onb2-half-day-leave-balances-design.md`. Piano: `docs/superpowers/plans/2026-09-13-onb2-half-day-leave-balances.md` (16 task TDD).

**Esecuzione** (worktree isolato via `EnterWorktree`, un subagent implementatore + due review indipendenti — spec-compliance poi code-quality — per task, 16 task in sequenza): migration 044 (`leave_saldi.total_days/used_days/remaining_days` e `leave_requests.num_days` → `NUMERIC(6,2)`, ordine drop/alter/recreate rispettato); validazione Zod `half_day` (solo giorno singolo, solo Ferie, mai MALATTIA); `numDays = half_day ? 0.5 : ...` + funzione `normalizeLeaveNumerics` applicata a tutti gli endpoint di `leaves.js` che restituiscono questi campi; fix `parseWorkbook.js` (`normInt`→`normDecimal`); toggle "Mezza giornata" su `EmployeeLeaveRequest.jsx`/`ManagerLeaveRequest.jsx`/`LeaveRequestScreen.jsx` (mobile), con rimozione dei 4 ricalcoli client-side duplicati in favore di `num_days` dal backend; utility `formatLeaveDays` duplicata intenzionalmente in web e mobile (nessun pacchetto condiviso, troppo piccola per giustificarne uno); primi test screen-level mai scritti per `LeaveRequestScreen.jsx`/`ManagerLeaveApprovalScreen.jsx` mobile (mock di `AsyncStorage`/`NetInfo`/`DateTimePicker` mai fatti prima per questi file); 2 test di regressione di blocco (half-day continua a generare conflitto Evento/Malattia; Planning Page blocca comunque l'intero giorno).

**3 bug reali di produzione trovati e fixati durante l'esecuzione, non nello scope originale**:
1. Un test in `AdminLeaveManagement.test.jsx`, scritto per bloccare la rimozione di un ricalcolo client-side duplicato, aveva una fixture il cui `num_days` coincideva esattamente con quanto il vecchio calcolo avrebbe prodotto — non avrebbe mai rilevato una regressione futura. Trovato dal reviewer chiedendosi esplicitamente "questo test fallirebbe se qualcuno reintroducesse il vecchio calcolo?" — corretto con un valore che diverge matematicamente, verificato per mutazione.
2. **Bug di produzione già live, scoperto per caso mentre si aggiungeva `formatLeaveDays`**: `ManagerLeaveApprovalScreen.jsx` (mobile) costruiva il plurale italiano concatenando le stringhe `"giorno" + "i"` invece di scegliere tra le due parole complete — ogni richiesta ferie multi-giorno mostrava "3 giornoi" invece di "3 giorni" ai manager, per tutto il tempo in cui questo schermo è esistito. Mai scoperto perché nessun test aveva mai verificato il testo pluralizzato con un confine di parola (`\b`) prima di questo task. Fixato con un ternario tra parole complete, non una concatenazione.
3. Una regressione reale causata dalla migration stessa: `illness-cascade-conflict.test.js` asseriva direttamente su `used_days` letto da una query SQL grezza (non passa da `leaves.js`'s `normalizeLeaveNumerics`) — dopo la migration, quel valore arriva come stringa, rompendo l'uguaglianza numerica. Trovato solo durante l'ultima esecuzione della suite completa (Task 16 del piano), fixato con `Number(...)` esplicito.

**Reviewer finale olistico**: "Ready to merge" dopo un controllo sull'intero diff (cross-cutting consistency, nessun debug residuo, scope discipline). Merge locale pulito su `main`, push su `origin/main`.

**Pipeline CI rossa dopo il push, per 4 motivi tutti indipendenti da ONB.2, diagnosticati e fixati in sequenza**:
1. 3 errori di lint (virgolette doppie invece di singole) in un mock aggiunto durante un fix di Task 1 — `eslint --fix`.
2. `events-request-timezone.test.js` usava una data hardcoded (`2026-09-05`) ormai nel passato rispetto a oggi (2026-09-13), scaduta silenziosamente — sostituita con date calcolate relativamente a "oggi" (`futureDateStr(daysFromNow)`), non può più ricapitare.
3. `npm audit --audit-level=high` falliva su una vulnerabilità alta (`js-yaml`, transitiva via `@istanbuljs/load-nyc-config`) mai notata prima — risolta con `npm audit fix` (nessun `--force`, nessun breaking change); restano 5 vulnerabilità moderate (richiedono bump major di `csv-parse`/`qs`/`uuid`), lasciate per una decisione separata e deliberata.
4. **La più seria**: il deploy in produzione falliva al bootstrap del container con `no pg_hba.conf entry ... no encryption`. Causa: l'upgrade RDS PG16 di questa stessa sessione ha messo l'istanza sul parameter group `default.postgres16`, che impone `rds.force_ssl=1` (diversamente da PG14). `scripts/run-migrations.js` costruiva il proprio `pg.Pool` senza alcuna configurazione SSL, a differenza del pool principale dell'app (`src/db/pool.js`, già corretto) — quindi ogni deploy dal momento dell'upgrade era rotto, semplicemente non ancora scoperto perché nessun deploy era stato eseguito nel frattempo. Fixato specchiando la stessa logica SSL in `run-migrations.js` (e per coerenza in `check-timestamptz-casts.js`, stesso pattern non ancora esercitato contro un'istanza reale ma stesso rischio latente).
5. (Minore, stesso giro) `node --test "scripts/__tests__/*.test.js"` in `ci.yml` funzionava in locale (Node 25) ma falliva su CI (Node 20, "Could not find" il glob letterale) — il supporto ai glob di `node:test` differisce tra versioni; corretto togliendo le virgolette così è bash a espandere il pattern prima che node lo veda.

Ogni fix verificato con esecuzione locale completa (backend/frontend-web/frontend-mobile) prima del push corrispondente. Pipeline finale: `CI/CD Pipeline`, `Build & Push Backend to ECR`, `Deploy to EC2` tutti `success`. `curl https://api.dataxiom.it/health` → `200`, `database: connected`.

## What Worked

- **Approccio test-first per l'upgrade RDS** (snapshot → istanza di test → verifica → produzione → cleanup) — ha eliminato il rischio di scoprire un problema di compatibilità direttamente sui dati reali, anche se non ha previsto (né avrebbe potuto, essendo un aspetto di rete/parametri non SQL) il problema SSL scoperto solo al primo deploy successivo.
- **Due round di analisi critica esplicitamente richiesti dall'utente** durante il brainstorming di ONB.2 hanno trovato 7 problemi reali (incluso un bug pre-esistente e due estensioni di scope legittime — mobile, Planning Page) prima ancora di scrivere il piano — molto più economico che scoprirli durante l'implementazione o dopo.
- **Non fidarsi di un test che "passa" senza chiedersi se catturerebbe davvero una regressione** — il reviewer del Task 10 ha esplicitamente verificato con l'aritmetica se il vecchio comportamento avrebbe prodotto lo stesso risultato del nuovo, trovando un test non discriminante che altrimenti sarebbe finito in produzione con una falsa sensazione di sicurezza.
- **Verificare la pipeline CI dopo un merge, non fermarsi al "i test locali passano"** — ha trovato un bug di produzione reale (SSL RDS) che nessuna suite locale avrebbe mai potuto scoprire, essendo specifico all'ambiente di deploy reale (container bootstrap contro RDS vero, non un Postgres locale/CI senza `force_ssl`).
- **Investigare la causa esatta invece di applicare il primo fix plausibile** — per il fallimento "Could not find" del glob, la tentazione sarebbe stata di riscrivere lo script; invece confrontare Node 25 (locale) vs Node 20 (CI) ha portato a un fix di una riga (togliere le virgolette) invece di una riscrittura non necessaria.

## What Didn't Work / Da tenere a mente

- **Un tentativo di ottenere lo scope `user` per `gh auth refresh`** (per controllare il billing Actions, prima di scoprire che il vero problema era un fallimento di pipeline, non un limite di spesa) è fallito con HTTP 500 — il flusso OAuth interattivo (browser/codice dispositivo) non è completabile da questo ambiente non interattivo. Se serve controllare billing/scope elevati in futuro, va fatto dall'utente stesso via browser, non delegato a `gh` da qui.
- **Un `EnterWorktree` con `isolation: "worktree"` dentro un Agent già dispatchato da un worktree isolato crea un SECONDO worktree separato**, non annidato nel primo — il commit del Task 1 è finito in un worktree diverso da quello che avevo preparato (con `.env` già copiati). Recuperato passando la sessione a quel worktree con `EnterWorktree({path: ...})` invece di ricominciare. **Lezione**: se la sessione è già in un worktree isolato, non passare `isolation: "worktree"` ai subagent successivi — lascia che operino nella stessa directory di lavoro già pronta.
- **Un worktree creato con `EnterWorktree({name: ...})` può branchare da `origin/main` (default `fresh`), non dal `main` locale** — il worktree di lavoro era 9 commit indietro rispetto al `main` locale (mancavano `check-timestamptz-casts.js` e i doc commit di questa stessa sessione), scoperto solo grazie a una nota di un code-quality reviewer che non trovava lo script. Risolto con un `git rebase main` pulito (nessun conflitto, i 4 commit del branch non toccavano nessuno dei 9 file). **Lezione**: dopo aver creato un worktree per un lavoro lungo, verificare subito `git log --oneline HEAD..main` prima di procedere con i task, non aspettare che un reviewer lo noti per caso.
- **Un `TASKS.md` modificato in precedenza nella stessa conversazione ma mai committato** è stato trovato come modifica non tracciata sul `main` locale proprio al momento del merge (l'utente aveva chiesto di aggiornare il file per il Task 11, poi la conversazione era passata direttamente a ONB.2 senza mai rispondere "sì, committa"). Committato separatamente prima del merge di ONB.2, per non perderlo né mischiarlo nel commit di merge.

## Next Steps

1. **Follow-up non bloccante documentato in `TASKS.md`**: `PUT /api/v1/leave/:id/approve` non normalizza ancora `num_days` (resta stringa NUMERIC grezza) — non visibile oggi (nessun consumer frontend legge questa risposta direttamente), ma un futuro consumer diretto rischierebbe lo stesso bug. Piccolo task quando comodo.
2. **5 vulnerabilità npm audit moderate rimaste aperte** (`csv-parse`, `qs`, `uuid`) — richiedono bump major (`npm audit fix --force`), lasciate per una decisione deliberata separata, non urgenti (nessuna è "high"/"critical").
3. **ONB.2b (futuro, non iniziato)**: Permessi/ROL in ore come nuovo tipo di assenza — richiede un design separato (nuovo `leaves.code`, form, blocco turni, saldi in ore), non un'estensione di ONB.2.
4. Backlog invariato dalle sessioni precedenti (outreach commerciale, S.27/S.28/S.29 legali, Auth0 reale).
5. Worktree/branch temporanei di questa sessione (`agent-acd7f6bf8591952c6`, `onb2-half-day-leave-balances`) rimossi a fine sessione — nessuna pulizia residua necessaria.

---

# Badge System — Session 120 Handoff

**Date:** 2026-09-02
**Session:** 120 — Build EAS + TestFlight per notifiche push, fix timezone bug reale in `events.js` scoperto durante test manuale, feature badge di assenza in "I Miei Turni" (spec→piano→subagent-driven-development), distribuzione OTA
**Status:** ✅ **Build EAS 40 riuscita e sottomessa a TestFlight** (2 fallimenti precedenti per capability Push Notifications mancante, risolti in sessione interattiva con l'utente). ✅ **Bug timezone reale fixato in `events.js`** (Pattern 6+7 di `CLAUDE.md`), commit `11c30e0`, pushato, CI verde — non era la causa dell'incidente segnalato dall'utente (una malattia legittima), ma un bug indipendente reale. ✅ **Feature badge di assenza completa**: spec, piano con 2 round di critica esplicitamente richiesti, implementazione a 3 task via `/superpowers:subagent-driven-development`, merge locale + push su `origin/main`, CI verde (`cc71f84`). ✅ **Distribuzione OTA completata** via `eas update --channel production`. ✅ **Documentazione di fine sessione aggiornata** (questo file, TASKS.md, PROJECT_DECISIONS.md).

## Goal (Session 120)

Continuazione diretta di Session 119 (stessa più ampia conversazione): completare il follow-up manuale rimasto aperto (build EAS + submission TestFlight per le notifiche push), poi rispondere a un bug reale segnalato dall'utente durante il test manuale su TestFlight ("con maria.rossi@torino.it, creare un evento per il 4/5 Settembre 2026 dà EVENT_DATE_CONFLICT ma non vedo nessuna presenza/assenza per quelle date"), e infine — scoperto durante l'indagine che "I Miei Turni" non mostra alcuna indicazione di malattia/ferie/evento quando manca un turno — costruire la feature dei badge di assenza end-to-end.

## Current Progress

**Build EAS + TestFlight**: 2 build fallite per assenza della capability "Push Notifications" sul provisioning profile iOS — non risolvibile senza una sessione interattiva reale (login Apple ID/2FA, rigenerazione credenziali). Guidato l'utente passo-passo attraverso `eas credentials`/`eas build` interattivi ("riusa il profilo originale? No" → "genera un nuovo provisioning profile? Sì"). Build 40 riuscita, sottomessa a TestFlight. `app.json`'s `ios.buildNumber` finale: 40 (commit `2d122e2`).

**Bug segnalato dall'utente — diagnosi**: senza accesso diretto al DB di produzione (RDS/EC2 ristretti all'IP dell'utente), ho fornito i comandi esatti da eseguire. Verificato che l'incidente specifico era causato da un record di malattia legittimo per Maria, non da un bug. **Bug reale trovato comunque**: `backend/src/routes/events.js` violava sia Pattern 6 (`::date` cast grezzo su `checkins.timestamp` TIMESTAMPTZ) sia Pattern 7 (query ad-hoc invece dei helper condivisi `eventConflict.js`) di `CLAUDE.md`. **Fix**: sostituita la query raw con 5 chiamate a `findConflictingCheckin`/`findConflictingSmartWorking`/`findConflictingEvent`/`findConflictingLeaveRange`/`findConflictingIllnessRange`. Aggiornati i 2 mock test esistenti (5 mock invece di 1 per il conflict-check) + nuovo `events-request-timezone.test.js` (route-level, non riprova l'edge case raw già coperto da `eventConflict-timezone.test.js` a livello di funzione unitaria, dato che il pool di connessione condiviso dell'app non è controllabile per-test via HTTP). Commit `11c30e0`, pushato, CI verificata verde. **Comunicato esplicitamente all'utente** che questo fix non risolveva l'incidente segnalato (causato dalla malattia legittima), per trasparenza.

**Gap UX scoperto durante lo stesso test**: "nell'area 'I miei turni' non c'è nulla relativo alla malattia" — un giorno con malattia/ferie/evento approvato ma senza turno assegnato mostra "—", indistinguibile da "non ancora pianificato".

**Brainstorming → Spec** (`/superpowers:brainstorming`): la schermata oggi chiama solo `GET /shifts/my-schedule`. Dati già disponibili via 3 endpoint self-service esistenti (`GET /illnesses/by-date-range`, `GET /leaves/my-requests`, `GET /events/my-requests`). **Round di critica UX esplicitamente richiesto dall'utente** sulla spec appena scritta: 4 fix applicati — colore Malattia cambiato da rosso-errore (`#DC2626`) ad arancione (`#EA580C`, un dipendente in malattia non ha commesso un errore); specificato comportamento di caricamento (loading unificato, niente flash); aggiunto non-goal esplicito su navigazione al dettaglio; un punto lasciato deliberatamente non affrontato per scelta esplicita dell'utente. Spec: `docs/superpowers/specs/2026-09-02-my-schedule-absence-badges-design.md`.

**Piano** (`/superpowers:writing-plans`): 3 task TDD, codice completo verbatim per ogni file. **Round di critica esplicitamente richiesto dall'utente** ("aggiungi un adeguato livello di test e di verifica, affinché non si introducano bug o si rompano dipendenze") ha aggiunto 4 test: turno-vince-su-malattia (component-level), contratto parametri per le 3 fetch, path di errore 500 reale, race-condition su cambio mese rapido — portando `MyScheduleScreen.test.jsx` da 5 a 9 test pianificati. Piano: `docs/superpowers/plans/2026-09-02-my-schedule-absence-badges.md`.

**Esecuzione** (`/superpowers:subagent-driven-development`, worktree isolato `my-schedule-absence-badges`, un subagent implementatore + due review indipendenti — spec-compliance poi code-quality — per task):
1. **Task 1**: `frontend-mobile/src/utils/absenceBadges.js` — `resolveAbsenceBadge(date, shiftValue, illnesses, leaves, events)`, logica pura: turno presente → nessun badge; malattia (qualunque stato attivo copre la data) → priorità massima; poi ferie/evento PENDING/APPROVED. 14 unit test. Report del subagent inizialmente evasivo ("13 test cases created and ready to run" invece di confermare un'esecuzione reale) — **non mi sono fidato**, ho eseguito i test io stesso e diffato il file byte-per-byte prima di procedere alla review formale. Code-quality review ha trovato duplicazione inline e mancanza di test di boundary — corretti con un refactor DRY (`coversDate`/`isActiveStatus` estratti) e un test di boundary aggiunto (commit `a435d70`, `0dde7eb`).
2. **Task 2**: `MyScheduleScreen.jsx` — `fetchSchedule` riscritta da promise-chain a `async`/`await`; fetch parallelo illnesses/leaves/events via `Promise.allSettled` (degrado silenzioso, un endpoint fallito non sopprime gli altri né mostra errore); nuovo stato `absences`; loading unificato (un solo `setLoading(false)` raggiunto solo dopo che sia turni che assenze sono risolti, elimina il flash UI); nuovo branch di render `absenceBadge ? (...)` nel `renderItem` della FlatList. **Correttezza AbortController deliberatamente rafforzata rispetto al pattern originale**: cattura `const { signal } = controller` come closure-local a inizio invocazione, controlla `signal.aborted` da quella closure-local (non da `abortControllerRef.current?.signal`, che riflette il controller CORRENTE al momento del check, non necessariamente quello a cui appartiene la richiesta in volo). Code-quality review ha trovato un gap minore: la scrittura cache `AsyncStorage.setItem` non aveva il guard `signal.aborted`, inconsistente col resto della funzione — fixato con un guard di una riga, verificato con `git show` che nessun altro cambio fosse presente, suite completa rieseguita (24/24, 201/201) per confermare nessuna regressione (commit `cc71f84`, unico cambio in quel commit rispetto a `be1db22`).
3. **Task 3**: verifica finale — suite mobile completa (24/24 suite, 201/201 test) eseguita ripetutamente, confronto manuale con la spec riga per riga. **Gap confermato pre-esistente, non introdotto da questa sessione**: `frontend-mobile` non ha mai avuto ESLint configurato (nessun `.eslintrc*`/`eslint.config.*`/script `lint` in `package.json`), verificato con `git log --all` sui path di config (nessun commit li ha mai introdotti) e per asimmetria con `backend`/`frontend-web` (entrambi con lint funzionante) — il piano stesso conteneva un errore (Step 5 assumeva ESLint disponibile), l'implementatore lo ha onestamente segnalato con `DONE_WITH_CONCERNS` invece di fabbricare un risultato.

**Merge + push**: merge locale pulito su `main` (nessun conflitto), push su `origin/main`, `gh run list --branch main --limit 3` conferma `CI/CD Pipeline` `success` (2m32s) sul commit head `cc71f84`.

**Distribuzione OTA**: `eas update --channel production --message "Badge di assenza (malattia/ferie/evento) in I Miei Turni"` pubblicato con successo — branch `production`, runtime version `1.0.0`, update group `f99cec0d-1910-4981-8687-db933b927795`, commit `cc71f84`. Raggiunge l'app installata via TestFlight (build 40, profilo/canale `production`) al prossimo check di aggiornamento, senza bisogno di una nuova build nativa essendo solo modifiche JS (nessuna dipendenza nativa nuova in questo diff).

## What Worked

- **Trasparenza sul fatto che il fix del bug timezone non risolveva l'incidente specifico segnalato dall'utente** (causato da una malattia legittima) — evitato di rivendicare un merito non dovuto, pur avendo comunque trovato e fixato un bug reale e indipendente della stessa classe già documentata (Pattern 6).
- **Non fidarsi del report evasivo di un subagent** ("ready to run" invece di confermare un'esecuzione reale) durante il Task 1 — verifica indipendente (esecuzione test + diff byte-per-byte) prima di procedere, disciplina esplicitamente richiesta dalla skill subagent-driven-development.
- **Due round di critica esplicitamente richiesti dall'utente** (uno sulla UX della spec, uno sulla test-coverage del piano) hanno prodotto fix concreti in entrambi i casi (colore badge, 4 test aggiuntivi) prima ancora di iniziare l'implementazione — più economico che scoprirli durante/dopo.
- **Rafforzare la correttezza dell'AbortController** (closure-local `signal` invece di `abortControllerRef.current?.signal.aborted`) durante l'implementazione stessa, non aspettare che un reviewer lo trovasse — una scelta di correttezza deliberata sul pattern preesistente.
- **Verificare che il gap ESLint di `frontend-mobile` fosse genuinamente pre-esistente** (via `git log --all`) prima di accettare il `DONE_WITH_CONCERNS` del subagent come non bloccante, invece di assumerlo o ignorarlo.

## What Didn't Work / Da tenere a mente

- **Il piano stesso conteneva un errore** (Task 2, Step 5 assumeva `npx eslint` funzionante su `frontend-mobile`) — un piano scritto con codice completo verbatim per ogni file non garantisce che ogni comando di verifica citato sia eseguibile nell'ambiente reale; vale la pena verificare la disponibilità degli strumenti di verifica (lint, coverage) prima di scriverli nel piano, non solo il codice applicativo.
- **Non posso fornire una vera TTY interattiva per `eas credentials`/`eas build`** quando serve login Apple ID/2FA o rigenerazione di credenziali — richiede sempre una sessione interattiva reale dell'utente, guidata passo-passo dal contenuto testuale dei prompt.

## Next Steps

1. Nessun task esplicitamente pending da questa sessione — feature ciclo completo (spec → piano → implementazione → merge → push → CI verde → OTA) chiuso.
2. Backlog invariato dalle sessioni precedenti (outreach commerciale, S.27/S.28/S.29 legali, Auth0 reale, follow-up Low su notifiche push — riassegnazione cross-tenant token, timeout chiamata Expo).
3. Se un cliente reale richiede coverage lint su `frontend-mobile`, considerare un piano dedicato (nessun `.eslintrc*`/`eslint.config.*` mai esistito in questo repo — gap pre-esistente, non urgente).
4. Branch/worktree `my-schedule-absence-badges` — verificare se ancora presenti sul disco/remoto e pulirli se non più necessari (gestiti dall'harness in questa sessione).

---

# Badge System — Session 119 Handoff

**Date:** 2026-09-01
**Session:** 119 — Notifiche push (Expo Push Service) progettate, pianificate e implementate end-to-end via `/superpowers:subagent-driven-development` in worktree isolato, mergiata su `main` in locale
**Status:** ✅ **Implementazione completa e mergiata su `main` (`0130451`)**, tutte le suite verdi (backend 970/984 — 14 skip; mobile 181/181; frontend-web 343/344 — 1 skip preesistente, invariato). ⚠️ **Non ancora pushata su `origin`/non deployata** — nessun `git push`, nessun deploy EC2 eseguito in questa sessione, solo merge locale. Due follow-up restano esplicitamente manuali (vedi Next Steps).

## Goal (Session 119)

Prima feature di notifiche push per il Badge System, richiesta e brainstormata nella parte iniziale di questa sessione (riassunta, non ripetuta qui): fino a questa sessione l'unico segnale di notifica esistente era una riga nella tabella `notifications`, mostrata solo in-app sul web (`NotificationBell`), generata solo dal cambio turno. Nessuna notifica per approvazione/rifiuto ferie, malattia, eventi; nessuna notifica su mobile. Spec e piano approvati dall'utente prima dell'esecuzione: `docs/superpowers/specs/2026-08-30-push-notifications-design.md`, `docs/superpowers/plans/2026-08-31-push-notifications.md` (17 task TDD).

## Current Progress

**Esecuzione** (`/superpowers:subagent-driven-development`, worktree isolato nativo `EnterWorktree`, branch `worktree-push-notifications`, un subagent implementatore + due review indipendenti — spec-compliance poi code-quality — per task, in sequenza su 17 task):

1. **Migration 043** — nuova tabella `device_push_tokens` (token Expo per employee/piattaforma), 4 test di vincolo.
2. **`backend/src/utils/pushNotifications.js`** — `notifyEmployee()` (fire-and-forget, wrappato internamente in `.catch()`, contratto "non lancia mai") + `sendPushToTokens()` + `isValidExpoPushToken()` (reimplementata a mano perché il mock di test di `expo-server-sdk` non esponeva il metodo statico reale `Expo.isExpoPushToken`, verificata byte-per-byte identica alla regex reale dal reviewer).
3. **`POST /api/v1/notifications/push-token`** — upsert `ON CONFLICT (token)`, fail-closed 403 `PUSH_TOKEN_NO_EMPLOYEE_PROFILE` se il chiamante non ha un profilo employee. La bozza del piano aveva 3 dettagli sbagliati (mount path, campo dell'errore, un helper `signAccessToken` inesistente) — l'implementatore li ha corretti investigando il codice reale, verificato indipendentemente dal reviewer.
4. **Wiring in `shifts.js`/`leaves.js`/`events.js`** (approvazione) — stesso pattern ovunque: chiamata fire-and-forget + try/catch difensivo al call site anche se la funzione è documentata per non lanciare mai. **Disciplina privacy verificata con mutation-test**: il corpo della push (`pushBody`) non contiene mai `rejection_reason` o altro dato sensibile leggibile su un telefono bloccato — solo il messaggio in-app (`inAppMessage`) può includerlo; il test è stato deliberatamente rotto e ripristinato per confermare che intercetta davvero la regressione, non solo che passa per caso.
5. **Lato mobile** — `app.json` (plugin `expo-notifications`), `pushNotificationsService.js` (permessi + registrazione token, un solo try/catch attorno a tutto il post-permesso), `PushConsentDialog.jsx` (opt-in esplicito, mostrato una sola volta, mirror di `GPSConsentDialog.jsx`), wiring in `RootNavigator.jsx` (gate per ruolo, stato `showPushConsent`), riga "Notifiche attive/disattivate" in `SettingsScreen.jsx` con percorso di recupero se l'utente ha negato il permesso.

**Bug collaterali risolti durante l'esecuzione:**
- `expo-server-sdk` (pacchetto ESM-only) rompeva il `require` transitivo di **~70 file di test** non correlati non appena `shifts.js` cominciava a importarlo — risolto con un automatic Jest mock (`backend/__mocks__/expo-server-sdk.js`), verificato da due reviewer indipendenti che non interferisce con i 3 override espliciti `jest.mock('expo-server-sdk', ...)` già presenti in test specifici (ogni file di test ha il proprio registro moduli).
- Un commento di 6 righe in italiano, verboso, copiato letteralmente dal piano (che è in italiano) in `shifts.js` altrimenti tutto-inglese-terso — colpa mia (piano scritto in italiano, l'implementatore lo ha copiato senza controllare la convenzione del file) — corretto a una riga in inglese; lo stesso fix di naming del log action (`notification_create_error` → `notify_employee_call_error`) propagato correttamente dagli implementatori successivi nei Task 8/9 senza bisogno di ripeterlo.
- Un test del Task 4 mockava solo la prima chiamata `pool.query` lasciando la seconda (lookup token) fallire per un motivo estraneo — gap di isolamento del test trovato dalla code-quality review, corretto.
- Il mock factory suggerito dal piano per il Task 15 (`jest.fn()` senza default) rompeva 2 describe block preesistenti in `SettingsScreen.test.jsx` — fix con un default `mockResolvedValue`, la cui necessità è stata verificata EMPIRICAMENTE dal reviewer (ha temporaneamente ripristinato la versione rotta, osservato il fallimento esatto, poi ripristinato il fix).

**Rate limit su un subagent implementatore** durante il Task 7 (`shifts.js`), interrotto subito dopo aver creato il mock `__mocks__/expo-server-sdk.js` non ancora committato — invece di ripartire da zero, ho ispezionato `git status`/`git log`, confermato che il commit della feature era già landed e che il mock file era genuinamente necessario, poi ripreso lo stesso subagent via `SendMessage` per fargli committare il mock e rieseguire la suite completa.

**Su richiesta esplicita dell'utente**, `/test-all` + `/code-review` (`code-reviewer` + `senior-backend`) ripetuti sull'intero diff prima di chiudere la sessione:
- **PR analyzer + code quality checker** (strumenti deterministici): 4 finding "critical" hardcoded-secret e 1 smell "94 righe" — **tutti falsi positivi verificati manualmente** (stringhe fixture `ExponentPushToken[...]` nei test, il nome della costante `NOTIFICATIONS_PUSH_TOKEN` contenente "TOKEN", e un naive brace-counter che confonde le `{}` di espressioni JSX in `RootNavigator.jsx` per corpo di funzione).
- **Revisione con lente `senior-backend` (subagent dedicato)** — ha trovato 3 problemi reali, non catturati dalle review a task:
  - 🟠 **Medium**: nessun rate limit dedicato su `POST /notifications/push-token` — un dipendente autenticato poteva far crescere `device_push_tokens` senza limite. **Fixato**: nuovo `pushTokenLimiter` (10 req/15min, stesso pattern degli altri limiter nominati).
  - 🟡 **Low**: nessuna validazione del formato token in ingresso (solo al momento dell'invio Expo). **Fixato**: schema Zod ora usa `.refine(isValidExpoPushToken)` (esportata dal Task 4).
  - 🟡 **Low residuo, deliberatamente non fixato**: riassegnazione cross-tenant di un token via upsert incondizionato; nessun timeout sulla chiamata Expo — entrambi richiedono una decisione di prodotto/architettura, non un fix meccanico, documentati come follow-up.
- Il fix del rate limiter ha richiesto di aggiungere `pushTokenLimiter: passThrough` al mock factory di **30 file di test** che mockano l'intero modulo `rateLimiter` (ogni file che lo mocka deve fornire ogni export nominato, altrimenti la destructuring a require-time in `app.js` lancia). **Un file legacy fuori da `src/__tests__/` è stato dimenticato dal subagent fix** (`backend/__tests__/middleware-checkRevoked.test.js`, 16 fallimenti) — il report finale del subagent era anomalo ("aspetterò la notifica del Monitor..."), non mi sono fidato, ho rieseguito la suite completa io stesso, trovato il file mancante, corretto con un `Edit` diretto, verificato con un grep comprensivo che nessun altro file fosse stato dimenticato.

**Merge**: dopo il rebase iniziale su `main` (il worktree era stato creato prima che 4 commit di documentazione atterrassero su `main` — rebase pulito, zero conflitti), merge locale finale pulito su `main` (fast-forward, zero conflitti, 57 file). **`node_modules` di `frontend-mobile` nella repo principale era disallineato** dal `package-lock.json` appena mergeato (mancavano `expo-notifications`, nuovo, e `expo-location`, preesistente ma mai installato in questo checkout) — causava 3 suite fallite con "Cannot find module"; risolto con `npm install`, suite mobile riverificata verde sul risultato mergeato (23/23 suite, 181/181 test). Backend riverificato verde sul risultato mergeato (entrambi i batch passati). Branch `worktree-push-notifications` e il worktree su disco (`.claude/worktrees/push-notifications`) **lasciati intatti** — gestiti dall'harness (`EnterWorktree`/`ExitWorktree`), non da Superpowers, non rimossi per policy (`git branch -d` si è anche rifiutato mentre il worktree esiste ancora).

## What Worked

- **Non fidarsi del report anomalo di un subagent** e rieseguire la suite completa io stesso ha trovato una regressione reale (il file di test legacy dimenticato) che sarebbe altrimenti finita mergiata su `main` rotta.
- **Automatic Jest mock come fix idiomatico** per un pacchetto ESM-only che rompe `require` transitivo — più pulito e meno fragile di mockare `expo-server-sdk` in ogni singolo file di test toccato indirettamente.
- **Mutation-testing la disciplina privacy** (rompere deliberatamente l'invariante "niente dati sensibili nel corpo della push" per verificare che il test lo catturi) invece di fidarsi che il test verde bastasse.
- **La lente `senior-backend` ha trovato problemi genuinamente nuovi** (rate limit mancante, validazione formato mancante) che né la review a task né gli strumenti deterministici avevano segnalato — un angolo di revisione diverso, non ridondante con quanto già fatto.

## What Didn't Work / Da tenere a mente

- Il piano scritto in italiano ha causato un commento in italiano copiato letteralmente in un file altrimenti tutto-inglese — se il piano è in italiano, ricordare esplicitamente all'implementatore di tradurre/adattare i commenti alla lingua del file, non solo alla logica.
- `node_modules` locale della repo principale può disallinearsi silenziosamente dal `package-lock.json` dopo un merge da un worktree che ha girato il proprio `npm install` — sempre rieseguire l'installazione e la suite dopo un merge che tocca `package.json`/`package-lock.json`, non fidarsi che "i test passavano nel worktree" implichi che passino anche nella repo principale.

## Next Steps

1. **Push su `origin/main`** e deploy — non ancora fatto in questa sessione (l'utente ha chiesto solo il merge locale). Prima del push, considerare se pulire branch/worktree `push-notifications` residui.
2. **Task 1 del piano (manuale, fuori scope codice)**: setup Firebase/FCM per il push su Android — richiesto da Expo Push Service per la consegna reale su dispositivi Android, mai eseguito in questa sessione.
3. **Task 17 del piano (manuale, fuori scope codice)**: build EAS + submission TestFlight per portare la feature su un device reale.
4. **Follow-up Low deliberatamente rimandati** (vedi sopra): decisione di prodotto su riassegnazione cross-tenant del token via upsert; timeout sulla chiamata Expo.
5. Backlog invariato dalle sessioni precedenti (outreach commerciale, S.27/S.28/S.29 legali, Auth0 reale).

---

# Badge System — Session 118 Handoff

**Date:** 2026-08-30
**Session:** 118 — Admin UI per la gerarchia ruoli (Senior Manager/Director) implementata end-to-end via `/superpowers:subagent-driven-development`, in produzione; onboarding cliente con saldi ferie iniziali riverificato E2E
**Status:** ✅ **Admin UI gerarchia ruoli mergiata su `main` (`1ad9bcb`), deployata, verificata funzionalmente E2E in locale contro Postgres reale**. ✅ **Onboarding cliente con saldi ferie iniziali confermato già funzionante**, nessuno sviluppo necessario. Nessun task pending residuo di questa sessione.

## Goal (Session 118)

Continuazione diretta di Session 117 (stessa conversazione): dopo aver chiuso i follow-up del backend, l'utente ha chiesto come un cliente/admin potesse effettivamente creare/promuovere `senior_manager`/`director` dalla UI — scoperto che non era possibile (nessun form, nessuna azione di modifica). Richiesta esplicita di analisi critica (`/superpowers:brainstorming`, 2 giri) prima di implementare, poi piano (`/superpowers:writing-plans`) ed esecuzione (`/superpowers:subagent-driven-development`). A seguire, due richieste separate nella stessa sessione: (1) verifica funzionale post-deploy con `/senior-frontend`, (2) una nuova feature ipotizzata (saldi ferie iniziali per dipendente in fase di onboarding cliente) che si è rivelata già esistente.

## Current Progress

**Brainstorming (2 giri di critica esplicitamente richiesti)**: primo giro ha ampliato lo scopo iniziale (solo azione di modifica) per includere anche il campo "Approvatore" nel form di creazione — coerenza tra i due punti di ingresso alla gerarchia. Secondo giro, mirato specificamente a verificare l'accuratezza della spec appena scritta, ha trovato un'imprecisione (il nuovo campo "Approvatore" era descritto come mirror esatto del campo "Manager" esistente quando in realtà quest'ultimo ha un comportamento leggermente diverso) e un **rischio reale non contemplato**: una retrocessione `director→senior_manager` nell'azione "Cambia ruolo" avrebbe potuto rompere l'invariante "approvatore di livello superiore" su un **terzo** dipendente — uno che già riporta al director in questione — perché nessun meccanismo esistente (incluso il vincolo FK `ON DELETE SET NULL`) intercetta questo caso, trattandosi di un `UPDATE` su una riga diversa da quella modificata, non di una cancellazione. **Decisione dell'utente**: rimuovere del tutto la retrocessione dallo scope (azione "Cambia ruolo" diventa promotion-only) invece di aggiungere il controllo cascata necessario per supportarla in sicurezza.

**Spec**: `docs/superpowers/specs/2026-08-30-role-hierarchy-admin-ui-design.md`. **Piano**: `docs/superpowers/plans/2026-08-30-role-hierarchy-admin-ui.md` (8 task TDD, self-review con un bug reale trovato e corretto prima ancora di iniziare l'esecuzione — un controllo `role === 'manager'` morto in una bozza di `ChangeRoleDialog.jsx`, dato che `'manager'` non è mai un valore raggiungibile in quel componente).

**Esecuzione** (`/superpowers:subagent-driven-development`, stesso worktree `quirky-gould-317e4e`, un subagent implementatore + due review indipendenti — spec-compliance poi code-quality — per task, in sequenza):
1. **Task 1**: refactor puro — `validateReportsTo` estratto come helper condiviso in `admin/employees.js` (prerequisito Task 3, Pattern 4 di `CLAUDE.md`). Un nit di code-quality (commento duplicato lasciato al call-site) corretto subito.
2. **Task 2**: schema Zod `AdminEmployeeRolePatchSchema` (role limitato a `senior_manager`/`director`, mai `manager`).
3. **Task 3**: nuovo endpoint `PATCH /api/admin/employees/:id/role` — solo promozioni, `reports_to_id` forzato a `null` per target `director` (difesa in profondità), controllo anti-ciclo riusando l'helper del Task 1 con un nuovo parametro `excludeId`. **Fix applicato in corsa durante l'implementazione stessa** (non un round di review separato): il controllo anti-ciclo dentro `validateReportsTo` doveva essere riordinato **prima** del controllo di livello, altrimenti un ciclo a pari livello veniva segnalato come generico errore di livello anziché come ciclo — scoperto scrivendo il test stesso, non da un revisore.
4. **Task 4**: `GET /api/admin/employees` estesa per includere `reports_to_id` (mancava, bloccava la pre-compilazione del dialog di modifica).
5. **Task 5**: form "Nuovo Dipendente" (`EmployeesTab.jsx`) esteso — nuovi ruoli nel dropdown, nuovo campo "Approvatore richieste personali" (pattern `disabled`-non-rimosso, coerente col campo "Manager di sede" già esistente, rinominato per disambiguazione). **Gap di code-quality trovato dal review e corretto con un round dedicato**: la logica di filtro degli approvatori — l'unica logica di business genuinamente nuova del task — non aveva alcuna asserzione sul contenuto reale del dropdown (solo sullo stato abilitato/disabilitato); e il test "si azzera al cambio ruolo" non distingueva un vero reset da un campo già vuoto in partenza. Corretti entrambi con test che aprono davvero il dropdown e selezionano un valore reale prima di verificare l'azzeramento.
6. **Task 6**: nuovo componente `ChangeRoleDialog.jsx`, isolato, non ancora collegato alla tabella.
7. **Task 7**: azione "Cambia ruolo" collegata in tabella (icona visibile solo per righe `manager`/`senior_manager`).
8. **Task 8**: verifica finale — backend 974/974 (14 skip preesistenti, 81% coverage righe), frontend 343/344 (1 skip preesistente, 42/42 file), lint 0 errori su entrambi.

**Su richiesta esplicita dell'utente**, `/test-all` + `/code-review` (`code-reviewer` + `senior-backend`) ripetuti sull'intero diff prima del merge, nonostante ogni singolo task avesse già superato due round di review indipendenti durante l'esecuzione: il PR analyzer automatico ha segnalato 1 "SQL injection" — **falso positivo** verificato manualmente (un URL REST in un template literal dentro un test frontend, nessuna query SQL coinvolta) — e nessun altro issue reale è sopravvissuto alla verifica, incluso un controllo mirato sulla coerenza del tenant-scoping del nuovo endpoint `PATCH` rispetto a `DELETE`/`reset-password` (stesso pattern pre-esistente, non una regressione).

**Merge + deploy**: merge locale pulito su `main` (nessun conflitto, 8 file, +632/-43), test rieseguiti sul risultato del merge (entrambe le suite verdi), push su `origin/main` (`1ad9bcb`). Worktree e branch feature lasciati intatti (worktree gestito dall'harness, sessione ancora attiva al suo interno). CI/CD Pipeline + Build&Push ECR + Deploy EC2 tutti `success` (verificato via `gh run list`/`gh run view --log`), health check del container confermato `HTTP 200` direttamente dai log dello step di deploy (`wait-healthy.sh`, 15s/120s).

**Verifica funzionale E2E post-deploy** (su richiesta esplicita, skill `/senior-frontend`): backend avviato in locale contro Postgres reale (non i mock dei test unitari), esercitate le stesse identiche chiamate API che la UI fa realmente — creazione Director/Manager con `reports_to_id` via `POST`, `GET` che restituisce il campo correttamente, promozione Manager→Senior Manager→Director via `PATCH` con azzeramento automatico dell'approvatore per il target `director`, blocco `ROLE_CHANGE_NOT_ALLOWED` da `director` e `ROLE_NOT_A_PROMOTION` per una ripromozione allo stesso livello, entrambi confermati dal vivo. **Scoperta positiva non anticipata**: un ciclo reale a 2 salti si è rivelato **non costruibile tramite scritture legittime** — ogni tentativo di far riportare un dipendente a un pari/inferiore livello viene già respinto dal controllo di livello stretto, prima ancora che lo stato incoerente possa esistere nel DB. Il controllo anti-ciclo è quindi vera difesa-in-profondità contro uno stato che le scritture reali non possono produrre, non una scorciatoia necessaria. Tutti i dati di test creati sono stati eliminati al termine.

**Richiesta separata nella stessa sessione — onboarding cliente con saldi ferie iniziali**: l'utente ha descritto un requisito (dipendenti con ore/giorni di ferie già maturati da caricare all'arruolamento di un nuovo cliente, "allineati" per dipendente) che sembrava una feature nuova. **Brainstorming ridotto a due domande** (giorni vs ore: confermato che giorni interi bastano; gap reale: l'utente ha chiesto solo una verifica) ha rivelato che **la feature esiste già** — il wizard `backend/scripts/onboard-client.js`/`admin/onboarding.js` (Session 41, ONB.1) ha da tempo esattamente 3 colonne nel template Excel (`ferie_giorni`/`permessi_giorni`/`exfestivita_giorni`) mappate a `leave_saldi`. **Verificato con un test E2E reale**: Excel a 3 fogli con 5 dipendenti a saldi distinti (30/20/4/26/15 ferie + permessi/ex-festività variabili) → dry-run → apply reale contro Postgres locale → verifica riga-per-riga in `leave_saldi` → simulazione dell'esatta query/trasformazione di `GET /admin/saldi` (l'endpoint dashboard) per confermare l'allineamento per dipendente nella forma finale servita al frontend. Nessun gap trovato, nessuno sviluppo necessario. Tutti i dati di test rimossi.

## What Worked

- **Il secondo giro di analisi critica esplicitamente richiesto sulla spec appena scritta** (non solo sui requisiti prima di scriverla) ha trovato un rischio di rottura di invariante su una riga diversa da quella modificata — esattamente il tipo di bug che un singolo giro di review "i requisiti sono tutti coperti?" non avrebbe intercettato, perché il rischio non era un requisito mancante ma un effetto collaterale di uno che sembrava già coperto (la retrocessione).
- **Self-review del piano prima di iniziare l'esecuzione** ha trovato un bug reale (branch morto `role === 'manager'`) senza bisogno di un ciclo implementazione→review→fix — più economico.
- **Fix applicati durante l'implementazione stessa, non solo nei round di review dedicati** (il riordino del controllo ciclo nel Task 3, le due asserzioni di test rafforzate nel Task 5) — la disciplina TDD del "verifica che il test fallisca per il motivo giusto" ha catturato entrambi prima che arrivassero a un revisore.
- **Verifica funzionale E2E con un backend reale dopo il deploy**, non solo la conferma che i test automatici passassero — ha prodotto un finding positivo genuino (il ciclo non è costruibile via API) che nessun test unitario avrebbe potuto dimostrare da solo, dato che i test unitari usano mock che possono rappresentare stati altrimenti irraggiungibili.
- **Chiedere "cosa manca davvero?" prima di brainstormare una feature apparentemente nuova** ha risparmiato un intero ciclo spec→piano→implementazione per una funzionalità già esistente e funzionante — la stessa disciplina di verifica-prima-di-costruire usata altrove nel progetto (vedi `CLAUDE.md`, "Prevention Checklist" varie).

## What Didn't Work / Da tenere a mente

- Nessun problema di processo rilevante in questa sessione. L'unico neo è stato l'iniziale falso positivo del PR analyzer automatico sulla "SQL injection" — richiede sempre una verifica manuale del contesto (era un test frontend, non un file toccante un DB), non un'accettazione cieca del punteggio dello strumento.

## Next Steps

Nessuno specifico a questa sessione. Backlog invariato dalle sessioni precedenti (outreach commerciale, S.27/S.28/S.29 legali, Auth0 reale). Nuovo backlog minor, non bloccante, documentato nella spec stessa: nessuna via di retrocessione per la gerarchia ruoli (scelta deliberata, richiederebbe una spec dedicata con controllo cascata se mai servirà); wizard Excel "Aggiorna Dipendenti" non esteso per i nuovi ruoli (bassa cardinalità, nessun cliente reale li usa ancora).

---

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

## 📦 Sessioni precedenti archiviate

Le sessioni 103-110 sono state spostate in [`docs/history/HANDOFF_ARCHIVE_103-110.md`](docs/history/HANDOFF_ARCHIVE_103-110.md) per ridurre la dimensione di questo file (2026-09-12). Nessuna informazione persa, solo rilocata.
