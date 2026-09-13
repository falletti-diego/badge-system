# Badge System — Decision Log & Architecture

**Last Updated:** 13 Settembre 2026 (Session 121 — Upgrade RDS PostgreSQL 14→16, ONB.2 mezze giornate ferie via subagent-driven-development, 3 bug reali di produzione trovati e fixati, pipeline CI sbloccata)  
**Status:** Deploy produzione ✅ LIVE (badge.dataxiom.it) | Landing dataxiom.it+badge-system.html ✅ LIVE, lancio LinkedIn ✅ pubblicato | Offline Mode Fase A (backend) ✅ LIVE | Offline Mode Fase B (mobile) ✅ codice completo, **in test su device reale (Task B6), Sezioni 1-8 testate almeno una volta, 8 bug totali trovati e fixati tra Session 80-81, Build 33 pronta per il retest finale** | Fix RBAC cross-tenant ✅ LIVE (`superadmin`, account `superuser@dataxiom.it`) | Demo Self-Service ✅ LIVE + form "Parliamo" ✅ funzionante (SES Sandbox, solo verso `diego@dataxiom.it`) | Cron cleanup demo ✅ VERIFICATO | Pipeline CI/CD ✅ (backend job con Postgres 14 reale + **nuovo job "Mobile - Test" bloccante**, 61 test RN) | `scripts/run-migrations.js`/`config-loader.js` ✅ FIXATI | **Infrastruttura di test mobile ✅ NUOVA** (Session 82): gap che aveva causato 8 bug reali (Session 80-81) ora colmato con 2 livelli — component test jest-expo+RNTL (61 test, CI bloccante) + Maestro E2E su simulatore iOS locale (2 flow verificati con esecuzioni ripetute reali)  
**MVP Launch Target:** Settembre 2026 | **Current Phase:** Validazione Android completa (Session 83). SES: DKIM verificato (`SUCCESS`), richiesta sandbox-exit `DENIED` dopo prima risposta — controreplica dettagliata inviata, da verificare l'esito (Session 84). Onboarding cliente self-service: ✅ 8/8 task implementati + code review finale (Session 85), resta solo il Gate finale E2E con SES reale. **Offline Mode Task B6: ✅ COMPLETATO (Session 86)** — retest finale su iPhone reale confermato funzionante dall'utente, Offline Mode ora interamente pronta per un cliente pilota. **Notifiche push (Expo): ✅ LIVE (Session 119-120)** — TestFlight build 40 con capability Push Notifications, distribuzione OTA attiva sul canale `production`. *(Nota: header sopra risale a Session 82, non aggiornato ad ogni sessione — vedi footer in fondo al file per lo stato più recente.)*

---

## Session 121 — Upgrade RDS PG14→16, ONB.2 mezze giornate ferie, 3 bug reali fixati, pipeline CI sbloccata (13 Settembre 2026)

### Contesto
Sessione avviata da una notifica AWS Health su fine supporto standard PostgreSQL 14 (28/2/2027), poi proseguita con un lavoro di feature (ONB.2) richiesto dall'utente dopo un'analisi del backlog, e chiusa con la scoperta e correzione di problemi reali emersi solo verificando la pipeline CI/CD dopo il merge.

### Decisione: upgrade RDS test-first, mai in produzione senza prima verificare su una copia
Data la cronologia di bug storici del progetto legati a schema/dati (Pattern 1/5/6), l'upgrade PG14→16 è stato eseguito prima su un'istanza di test ripristinata da uno snapshot recente, verificato lì senza errori, e solo dopo applicato all'istanza di produzione. Costo totale ~$2-3 (istanza di test, poi eliminata) contro un risparmio di ~$146-292/mese in Extended Support evitato a partire da marzo 2027.

### Decisione: ONB.2 scoped a sole mezze giornate Ferie, non Permessi/ROL in ore
Il backlog originale (`TASKS.md`) descriveva "mezze giornate ferie" e "Permessi/ROL in ore" come un'unica voce. Analizzando lo schema reale (`leaves` ha solo 4 codici: FERIE_1/2/3, MALATTIA), è emerso che le due cose hanno scope radicalmente diverso — le mezze giornate sono un cambio di granularità su un tipo esistente, mentre Permessi/ROL richiederebbe un nuovo tipo di assenza da zero (form, validazione, blocco turni, saldi in ore). Decomposto in ONB.2 (questo lavoro) e ONB.2b (futuro, non iniziato).

### Decisione: normalizzazione NUMERIC→Number centralizzata in un unico punto, non sparsa per endpoint
`node-postgres` restituisce le colonne NUMERIC come stringhe JS (per evitare perdita di precisione silenziosa), un pattern già presente altrove nel codebase (`meal_voucher_hours`) ma mai risolto sistematicamente. Invece di aggiungere `Number(...)` ad-hoc nei 2 endpoint saldi come proposto inizialmente, la normalizzazione è stata centralizzata in una singola funzione (`normalizeLeaveNumerics`) applicata a **tutti** gli endpoint di `leaves.js` che restituiscono questi campi — coerente con la disciplina già adottata nel progetto per Pattern 4 (singola fonte di verità) e Pattern 6 (check centralizzato invece di fix sparsi). Un endpoint (`PUT /:id/approve`) è stato lasciato non normalizzato deliberatamente, verificato non user-visible oggi, documentato come follow-up.

### Decisione: Planning Page blocca l'intero giorno anche per mezza ferie — limitazione nota, accettata esplicitamente
`PlanningPage.jsx` blocca l'assegnazione turni in modo binario per qualunque ferie approvata, senza distinguere mezza giornata da giornata intera — un manager non potrebbe assegnare un turno nemmeno per la metà lavorata. Estendere lo scope per risolvere questo avrebbe richiesto decisioni UI aggiuntive non pianificate. Decisione esplicita dell'utente: accettare la limitazione, nessuna modifica in questo lavoro, fissata con un test di regressione dedicato per evitare che un futuro refactor la "risolva" per caso senza una decisione consapevole.

### Scoperta operativa: 3 bug reali di produzione trovati e fixati durante l'esecuzione, non nello scope originale
(1) `backend/src/services/onboarding/parseWorkbook.js` arrotondava silenziosamente i saldi Ferie decimali importati dal cliente (`normInt`→`Math.round`) — un cliente che avesse fornito 19,5 giorni residui da un sistema precedente li avrebbe visti diventare 20 senza alcun avviso. (2) `frontend-mobile/src/screens/leave/ManagerLeaveApprovalScreen.jsx` costruiva il plurale italiano concatenando le stringhe "giorno"+"i" invece di scegliere tra le due parole complete — ogni richiesta ferie multi-giorno ha mostrato "3 giornoi" invece di "3 giorni" ai manager per tutto il tempo in cui questo schermo è esistito, mai scoperto perché nessun test verificava il testo pluralizzato con un confine di parola. (3) Un test in `AdminLeaveManagement.test.jsx`, scritto per bloccare la rimozione di un ricalcolo client-side duplicato, usava una fixture il cui valore coincideva esattamente con quanto il vecchio calcolo avrebbe prodotto — non avrebbe mai rilevato una regressione futura, corretto con un valore che diverge matematicamente e verificato per mutazione (temporaneamente reintrodotto il vecchio comportamento per confermare che il test lo cattura).

### Scoperta operativa: l'upgrade RDS PG16 ha silenziosamente rotto ogni deploy successivo — `rds.force_ssl=1` sul parameter group di default
Il parameter group `default.postgres16` (assegnato automaticamente durante l'upgrade dell'engine) impone `rds.force_ssl=1`, diversamente dal setup precedente su PG14. Lo script di bootstrap del container (`scripts/run-migrations.js`) costruiva il proprio `pg.Pool` senza alcuna configurazione SSL — a differenza del pool principale dell'app (`src/db/pool.js`, già corretto) — quindi ogni deploy dal momento dell'upgrade falliva al passo "Running database migrations..." con un rifiuto di connessione non cifrata. Non rilevato subito perché nessun deploy era stato eseguito tra l'upgrade RDS e il push di questa sessione. Fix: specchiata la stessa logica SSL di `pool.js` in `run-migrations.js` (e per coerenza in `check-timestamptz-casts.js`, stesso pattern non ancora esercitato contro un'istanza reale). Lezione: un cambio di versione engine RDS può cambiare il parameter group di default e quindi i requisiti di sicurezza della connessione, non solo la superficie SQL — da verificare esplicitamente in futuri upgrade, non solo "l'upgrade è andato a buon fine su un'istanza di test".

### Esito
ONB.2: 22 commit, ognuno con doppia review (spec + qualità), merge locale pulito su `main`, push su `origin/main`. Pipeline CI rossa dopo il push per 4 problemi indipendenti da ONB.2 (lint, data test scaduta, npm audit alto, SSL RDS) — tutti diagnosticati e fixati con commit dedicati, verificati con esecuzione locale completa prima di ogni push. Pipeline finale verde (CI/CD Pipeline, Build & Push ECR, Deploy to EC2 tutti `success`), `/health` produzione verificato `200`/`database: connected`. Dettaglio completo: [[HANDOFF.md]] Session 121.

---

## Session 120 — Fix timezone `events.js` + badge di assenza in "I Miei Turni", OTA update (2 Settembre 2026)

### Contesto
Continuazione diretta di Session 119: dopo il merge locale delle notifiche push, questa sessione ha completato il build EAS + submission TestFlight (2 fallimenti per capability "Push Notifications" mancante sul provisioning profile, risolti guidando l'utente attraverso `eas credentials` in sessione interattiva — build 40 riuscita). Durante il test manuale su TestFlight, l'utente ha segnalato un `EVENT_DATE_CONFLICT` apparentemente ingiustificato per `maria.rossi@torino.it`.

### Decisione: il bug segnalato dall'utente era in realtà un falso allarme (malattia legittima), ma l'indagine ha comunque trovato e fixato un bug timezone reale e indipendente
Verificato che la malattia di Maria per quelle date era un record legittimo, non un dato corrotto. Nell'indagine, però, è emerso che `backend/src/routes/events.js` violava sia il Pattern 6 (`::date` cast grezzo su `checkins.timestamp`, una colonna TIMESTAMPTZ, senza `AT TIME ZONE 'Europe/Rome'`) sia il Pattern 7 (query ad-hoc invece di riusare gli helper condivisi di `eventConflict.js`) di `CLAUDE.md`. Motivazione per il fix comunque: anche se non era la causa dell'incidente riportato, si trattava di un bug di classe già documentata e già costata due fix precedenti (`checkins.js`, `eventConflict.js`) — lasciarlo in piedi avrebbe garantito una terza occorrenza futura. Fix: sostituita la query raw con le 5 chiamate agli helper condivisi già esistenti (`findConflictingCheckin`/`findConflictingSmartWorking`/`findConflictingEvent`/`findConflictingLeaveRange`/`findConflictingIllnessRange`). Trasparenza verso l'utente: comunicato esplicitamente che questo fix non risolveva l'incidente specifico segnalato, per non rivendicare un merito non dovuto.

### Decisione: colore Malattia cambiato da rosso-errore (`#DC2626`) ad arancione (`#EA580C`) durante la revisione critica UX della spec
Un dipendente in malattia non ha commesso un errore — un badge rosso nella stessa palette usata per gli errori di rete/validazione avrebbe comunicato involontariamente un tono di colpa/urgenza negativa. Arancione mantiene la salienza visiva (distinto da Ferie verde ed Evento viola) senza il carico semantico del rosso.

### Decisione: "I Miei Turni" degrada silenziosamente se il fetch di assenze fallisce, non mostra un errore utente
Le 3 fetch di illnesses/leaves/events girano in parallelo via `Promise.allSettled`: se una fallisce, quel tipo di badge semplicemente non appare per quel periodo, ma i turni (dato primario della schermata) restano visibili e nessun errore blocca l'utente. Motivazione: i badge di assenza sono un arricchimento informativo, non il dato primario della schermata — un fallimento parziale non giustifica un errore bloccante o un banner, a differenza del fallimento del fetch turni stesso (quello sì mostra errore/usa cache offline).

### Decisione: azione "Cambia ruolo" — *(N/A qui, voce non pertinente a questa sessione; vedi Session 118)*

### Scoperta operativa: `frontend-mobile` non ha mai avuto ESLint configurato in questo repo
Il piano (Task 2, Step 5) prevedeva un comando `npx eslint ...` come parte della verifica — l'implementatore ha correttamente riportato `DONE_WITH_CONCERNS` invece di fabbricare un risultato. Verificato con `git log --all` sui path di config ESLint: nessun commit li ha mai introdotti in `frontend-mobile` (asimmetria con `backend`/`frontend-web`, entrambi con lint funzionante) — gap pre-esistente, non introdotto da questa sessione, non bloccante per il merge.

### Esito
Fix timezone: commit `11c30e0`, pushato, CI verde. Feature badge di assenza: 3 task via `/superpowers:subagent-driven-development`, ognuno con TDD + doppia review indipendente; fix di code quality applicato in corsa nel Task 2 (guard `signal.aborted` mancante sulla scrittura cache `AsyncStorage`, commit `cc71f84`). Suite finale: 24/24 suite mobile, 201/201 test, verificati ripetutamente prima e dopo il merge. Merge locale pulito su `main` + push su `origin/main`, `CI/CD Pipeline` confermato `success` (2m32s) su `cc71f84` via `gh run list`. Distribuzione OTA: `eas update --channel production` pubblicato (update group `f99cec0d-1910-4981-8687-db933b927795`), raggiunge l'app TestFlight (build 40) senza una nuova build nativa essendo solo modifiche JS. Dettaglio completo: [[HANDOFF.md]] Session 120.

---

## Session 119 — Notifiche push: Expo Push Service, privacy-by-design nel corpo della notifica, rate limit sul token intake (1 Settembre 2026)

### Contesto
Prima feature push del Badge System. Fino a questa sessione l'unico segnale esistente era una riga in-app web-only (`notifications`), generata solo dal cambio turno. Spec/piano approvati in una parte precedente della sessione: `docs/superpowers/specs/2026-08-30-push-notifications-design.md`, `docs/superpowers/plans/2026-08-31-push-notifications.md`.

### Decisione: il corpo della push non contiene mai dati sensibili — solo il messaggio in-app può
Un rifiuto ferie/malattia/evento genera sia una push (`pushBody`, testo generico "La tua richiesta è stata aggiornata") sia una riga `notifications` in-app (`inAppMessage`, che può includere `rejection_reason`). Motivazione: una notifica push può comparire sulla schermata di blocco del telefono, visibile a chiunque abbia accesso fisico al device, mentre il messaggio in-app richiede login. Verificato con un mutation-test deliberato (rotto temporaneamente l'invariante, confermato che il test lo cattura, ripristinato) invece di fidarsi che il test verde bastasse.

### Decisione: `notifyEmployee()` è fire-and-forget con un contratto "non lancia mai", ma ogni call site lo wrappa comunque in try/catch
La funzione cattura internamente ogni errore (rete Expo, token invalido, DB) e non propaga mai un'eccezione — un fallimento di notifica non deve mai bloccare l'operazione principale (approvazione ferie, assegnazione turno). Nonostante il contratto documentato, ogni chiamante (`shifts.js`/`leaves.js`/`events.js`, e lato mobile il service stesso) la wrappa comunque in un try/catch difensivo — "belt-and-suspenders" esplicitamente scelto: un contratto documentato può comunque essere violato da una futura modifica alla funzione stessa, e il costo di un try/catch extra è trascurabile rispetto al rischio di un'eccezione non gestita in un percorso critico.

### Decisione: rate limit dedicato su `POST /notifications/push-token`, aggiunto dopo la review, non nella spec originale
La revisione con lente `senior-backend` (richiesta esplicitamente dall'utente dopo l'implementazione, non parte del piano originale) ha trovato che l'endpoint di registrazione token non aveva un limiter dedicato — un dipendente autenticato poteva far crescere `device_push_tokens` senza limite chiamando l'endpoint ripetutamente. Fixato con `pushTokenLimiter` (10 richieste/15 minuti, stesso pattern named-limiter già in uso per `apiLimiter`/`authLimiter`/etc. in `rateLimiter.js`). Motivazione per non averlo previsto nella spec originale: la spec si è concentrata sul flusso funzionale (registrazione, invio, opt-in), non su un'analisi di abuso — un gap ragionevole per un endpoint nuovo, colmato dalla review dedicata invece che dalla progettazione iniziale.

### Decisione: validare il formato del token Expo in ingresso (Zod `.refine`), non solo al momento dell'invio
Stesso giro di review: prima del fix, un token malformato veniva accettato in scrittura e scartato solo al momento dell'invio Expo (silenziosamente, via `isValidExpoPushToken()` interna a `pushNotifications.js`). Fixato esportando `isValidExpoPushToken` e collegandola come `.refine()` nello schema Zod `PushTokenSchema` — fail-fast all'intake invece che al momento dell'uso, coerente con la convenzione Zod già in uso ovunque nel backend.

### Non-decisione (deliberata): riassegnazione cross-tenant del token e timeout della chiamata Expo restano aperti
La stessa review ha trovato 2 problemi Low aggiuntivi, **non fixati in questa sessione**: (1) l'upsert `ON CONFLICT (token) DO UPDATE` riassegna incondizionatamente un token a un nuovo employee/client se lo stesso device si riautentica sotto un account diverso — comportamento plausibilmente corretto (un device non dovrebbe ricevere notifiche per un account precedente) ma non è stato esplicitamente deciso essere quello voluto, richiede conferma di prodotto; (2) nessun timeout esplicito sulla chiamata a Expo Push Service — se Expo è lento, la richiesta fire-and-forget resta appesa più a lungo del necessario (basso impatto dato che è già fire-and-forget e non blocca la risposta HTTP). Entrambi documentati come follow-up, non bloccanti per il merge.

### Scoperta operativa: `node_modules` locale può disallinearsi dal `package-lock.json` dopo un merge da worktree
Il worktree isolato (`push-notifications`) aveva girato il proprio `npm install` su `frontend-mobile` includendo `expo-notifications` (nuovo) e già avendo `expo-location` installato. Dopo il merge locale su `main`, la repo principale aveva un `package-lock.json` aggiornato ma un `node_modules` mai reinstallato — 3 suite di test fallite con "Cannot find module" fino a un `npm install` esplicito nella repo principale. Non un problema di codice, ma una lezione operativa: dopo un merge che tocca `package.json`/`package-lock.json`, rieseguire sempre l'installazione e la suite nella working copy di destinazione, non fidarsi che "i test passavano nel worktree" implichi che passino anche lì.

### Esito
17 task del piano completati via `/superpowers:subagent-driven-development`, ognuno con TDD + doppia review indipendente (spec-compliance poi code-quality). Su richiesta esplicita dell'utente, `/test-all` + `/code-review` (`code-reviewer` + `senior-backend`) ripetuti sull'intero diff prima della chiusura: i finding degli strumenti deterministici erano tutti falsi positivi (verificati manualmente), la lente `senior-backend` ha trovato 3 problemi reali (2 fixati, 1 low residuo documentato come sopra). Un file di test legacy dimenticato dal fix del rate limiter (16 fallimenti) è stato trovato e corretto rieseguendo la suite completa invece di fidarsi del report del subagent. Merge locale pulito su `main`, non ancora pushato su `origin`, non deployato. Dettaglio completo: [[HANDOFF.md]] Session 119.

---

## Session 118 — Admin UI per la gerarchia ruoli: promotion-only per scelta deliberata, verifica E2E post-deploy (30 Agosto 2026)

### Contesto
Session 116-117 avevano reso `senior_manager`/`director` completamente funzionanti lato backend/RBAC, ma **senza alcuna superficie UI**: l'unico modo di crearli o assegnare `reports_to_id` era una chiamata API diretta. Questa sessione colma il gap con form di creazione esteso + nuova azione "Cambia ruolo".

### Decisione: azione "Cambia ruolo" è promotion-only, nessuna retrocessione — scelta deliberata, non un limite tecnico
Durante un secondo giro di analisi critica sulla spec già scritta (richiesto esplicitamente dall'utente), è emerso che una retrocessione `director→senior_manager` avrebbe potuto rompere l'invariante "l'approvatore ha un livello strettamente superiore" su un **terzo** dipendente — uno che già ha `reports_to_id` puntato a quel director. Nessun meccanismo esistente intercetta questo caso: il vincolo FK `ON DELETE SET NULL` scatta solo su una cancellazione, non su un `UPDATE` del ruolo. Costruire il controllo cascata necessario (verificare se qualcun altro riporta al dipendente che si sta retrocedendo, e decidere cosa fare se sì) è stato giudicato un lavoro a sé, non un dettaglio di questa feature — **su istruzione esplicita dell'utente**, la retrocessione è stata rimossa dallo scope invece di essere implementata con il controllo mancante. L'unica via per "annullare" una promozione oggi è disattivare e ricreare il dipendente.

### Decisione: il campo "Approvatore" nel form di creazione usa lo stesso meccanismo `disabled`-non-rimosso del campo "Manager" esistente, non un pattern diverso
Prima bozza della spec descriveva il nuovo campo come "mirror esatto" del campo Manager esistente — imprecisione corretta durante l'autoreview della spec: il campo Manager è *sempre* renderizzato e diventa `disabled` quando non applicabile (mai rimosso dal DOM), e il nuovo campo Approvatore segue esattamente lo stesso pattern per coerenza visiva, non perché "mirror" fosse già vero prima della correzione.

### Decisione: `validateReportsTo` riceve un parametro `excludeId` opzionale invece di una seconda funzione dedicata al controllo ciclo
Il controllo anti-ciclo (necessario solo per la modifica di un dipendente esistente, strutturalmente impossibile alla creazione) è stato aggiunto come parametro opzionale della stessa funzione già usata da `POST /`, non duplicato in una funzione parallela — coerente col Pattern 4 di `CLAUDE.md` (no duplicazione di logica di validazione). Il controllo ciclo deve girare **prima** del controllo di livello all'interno della funzione (altrimenti un ciclo a pari livello sarebbe silenziosamente segnalato come generico errore di livello) — scoperto scrivendo il test durante l'implementazione del Task 3, non da un revisore separato.

### Scoperta verificata E2E: il ciclo non è raggiungibile tramite scritture legittime
Durante la verifica funzionale post-deploy (backend locale contro Postgres reale, non solo test con mock), ho provato a costruire dal vivo lo scenario di ciclo a 2 salti testato a livello unitario. **Non è stato possibile**: ogni tentativo di far riportare un dipendente a un pari/inferiore livello viene già respinto dal controllo di livello stretto esistente, prima ancora che lo stato incoerente possa formarsi nel DB. Il controllo anti-ciclo in `validateReportsTo` resta quindi una difesa-in-profondità genuina — protegge contro uno stato che nessuna scrittura reale tramite l'API può produrre oggi, non contro uno scenario comune. Non cambia nulla nell'implementazione, ma conferma che il rischio era stato correttamente inquadrato come "difesa in profondità" nella spec, non come un gap facilmente sfruttabile.

### Non-decisione: onboarding cliente con saldi ferie iniziali — nessuna feature nuova necessaria
L'utente ha descritto un requisito (dipendenti con ferie/permessi già maturati da caricare all'arruolamento di un nuovo cliente) che sembrava richiedere sviluppo. Verificato che **esiste già da Session 41** (`ONB.1`): il wizard `onboard-client.js`/`admin/onboarding.js` ha 3 colonne Excel (`ferie_giorni`/`permessi_giorni`/`exfestivita_giorni`) mappate a `leave_saldi`, con upsert idempotente che non sovrascrive un saldo già in uso. Confermato con un test E2E reale a 5 dipendenti con saldi distinti. Nessuna decisione architetturale presa — la decisione è stata non costruire nulla.

### Esito
8 commit sul piano (Task 1-7 + 1 fix di code quality post-review su un commento duplicato), tutti verificati con TDD e doppia review indipendente (spec-compliance poi code-quality) prima di procedere al task successivo. Suite finale: backend 974/974 (14 skip preesistenti), frontend 343/344 (1 skip preesistente). Merge locale pulito su `main` (`1ad9bcb`), CI/CD + Build&Push ECR + Deploy EC2 verdi, health check `HTTP 200` confermato dai log del deploy. `/code-review` pre-merge ha prodotto un solo falso positivo (SQL injection su un URL REST in un test frontend) e nessun issue reale.

---

## Session 117 — Follow-up gerarchia ruoli chiusi con coordinamento cross-session, 2 finding aggiuntivi da code review (30 Agosto 2026)

### Contesto
Sessione ripresa dopo interruzione. L'utente ha segnalato che i due follow-up di Session 116 (`task_bceb920f`, `task_0e1577e8`) erano già stati avviati "via Claude Code web" — verificato via `git log`/`git worktree list`: il lavoro esisteva davvero, già mergiato in `main` **locale**, ma mai pushato su `origin`.

### Scoperta: 3 sessioni Claude concorrenti sullo stesso follow-up, ciascuna con metà fix incompleta
`ListAgents` ha rivelato 3 sessioni attive in parallelo su worktree condivisi. Contattate via `SendMessage` per evitare sovrapposizioni: una sessione (`a2`, stesso worktree di questa) aveva già applicato il "cancello" `isAdminEquivalent` a `presences.js` per un task separato; un'altra sessione (`lucid-curie-1d0c69-ca`, worktree diverso) aveva lavorato specificamente su `task_0e1577e8` con un fix più profondo (query roster allowlist **+** filtro di ruolo sul JOIN checkins) e un test real-Postgres — ma **senza il cancello**, rendendolo inerte nel suo checkout (senior_manager/director non raggiungevano mai quella query). **Nessuno dei due pezzi, da solo, produceva il comportamento corretto end-to-end.**

### Decisione: consolidare in un solo worktree, verificare indipendentemente, non fidarsi dei due self-report separati
Letti direttamente i diff di entrambi i worktree dal filesystem (stessa macchina), applicati insieme nello stesso worktree, eseguita la suite completa (non solo i file toccati) e confermato che il test real-Postgres del secondo contributo girasse per davvero (nessun `dbAvailable=false` silenzioso). Commit con co-authorship esplicita a entrambe le sessioni contributrici; le 3 sessioni notificate del consolidamento, una invitata a scartare la propria copia ormai ridondante (fatto da questa sessione stessa dopo che quella sessione era già terminata).

### `task_bceb920f` chiuso — e un secondo leak payroll trovato mentre lo si chiudeva
`buildScopedFilters` (`queryScope.js`) passato a `isAdminEquivalent(role)`. Rimuovere questo 403 fail-closed ha riesposto lo stesso problema appena chiuso in `presences.js`, ma in `export.js`: nulla impedisce a un senior_manager/director di timbrare (`POST /checkins` non ha restrizioni di ruolo), quindi il loro check-in reale sarebbe finito, senza filtro, nell'export CSV payroll (Zucchetti/TeamSystem). Stesso fix, stesso precedente: `AND e.role = 'employee'` sulla LEFT JOIN — anonimizza la riga esattamente come già succede per un dipendente disattivato (comportamento preesistente e già testato), non la elimina, per coerenza con quel design già in produzione.

### `/code-reviewer` + `/senior-backend` richiesti esplicitamente prima di aggiornare la documentazione — trovati 2 finding aggiuntivi
1. **`GET /events/approved`** (`events.js`) non era mai stato portato a `isAdminEquivalent` nel pass originale (a991d22) — sibling dimenticato di `GET /leave/approved` e `GET /illnesses/by-date-range`, entrambi già corretti. Stesso fix, stesso import già presente nel file.
2. **`isAdminEquivalent()` era una lista di nomi hardcoded**, non una soglia `role_level` — esattamente l'anti-pattern che la Session 116 stessa aveva già identificato come causa del bug di privilege-inversion di `checkins.js`. Refactored a `getRoleLevel(role) >= ROLE_LEVELS.senior_manager` — comportamento identico oggi (verificato: `viewer` resta escluso via il suo livello `-1`), ma un futuro ruolo aggiunto sopra `director` eredita ora il trattamento automaticamente, senza bisogno di ricordarsi di aggiornare una lista. Aggiunto un test di invarianza che blinda la proprietà.

### Esito
4 commit totali sul giorno, ognuno verificato con TDD rosso→verde, suite completa (964 test, 14 skip preesistenti — confermato su più run; 2 run hanno mostrato lo stesso flake pre-esistente inter-worker già noto dal progetto — Session 77 — su file estranei ai fix, mai riproducibile in isolamento) e lint pulito prima del push. CI/CD verde e deploy EC2 verificato (`/health` 200) dopo ciascun push. Nessun conflitto di merge nonostante lo sviluppo parallelo su worktree diversi.

---

## Session 116 — Gerarchia ruoli scalabile (senior_manager/director + reports_to_id): design, implementazione, 2 bug di autorizzazione trovati e fixati, merge (29 Agosto 2026)

### Contesto
Richiesta esplicita dell'utente (non un bug segnalato): il modello di ruoli oggi supporta solo `employee/manager/admin` (più `viewer`/`superadmin`), insufficiente per un cliente con più di 2 livelli organizzativi (es. store manager → area/senior manager → HR director) — nessun modo di modellare una catena di approvazione per le richieste personali (ferie, malattia, correzione cartellino) di un manager.

### Decisione: `role_level` come mappa costante nel codice, mai una colonna DB
`ROLE_LEVELS` vive solo in `backend/src/utils/roles.js` (`employee:0, manager:1, senior_manager:2, director:3, admin:99, superadmin:99, viewer:-1`). Estendere la gerarchia in futuro (es. un livello intermedio) significa editare solo questa mappa + il CHECK constraint di `employees.role` in una nuova migrazione additiva, zero migrazione di dati sulle righe esistenti.

### Decisione: `reports_to_id` come colonna nuova, non riuso di `manager_id`
Scoperta chiave durante l'esplorazione pre-piano: esisteva già una colonna self-referenziante `employees.manager_id` (migration 040), ma con una semantica diversa e già ben testata — "il manager della sede di un `employee`", validato con un vincolo stretto (`role='manager' AND site_id=<sede>`) e richiesto obbligatoriamente per ogni `employee`, usato anche dal CSV import (`services/employeeSync/*`). `reports_to_id` è concettualmente diverso — chi approva le richieste personali di un manager/senior_manager, mai scoped a una sede, mai obbligatorio (NULL è sempre valido, ricade su admin). Conflare le due semantiche nella stessa colonna avrebbe richiesto diramare per ruolo una validazione già delicata (proprio l'area dei bug storici Pattern 1 di `CLAUDE.md`, stringhe UUID hardcoded) — una colonna dedicata è stata giudicata più sicura da aggiungere in modo additivo, al costo di una colonna in più concettualmente simile a un'altra già esistente.

### Decisione: visibilità "pending" admin-equivalente per senior_manager/director, non una nuova funzionalità di scoping
`isAdminEquivalent(role)` tratta `senior_manager`/`director` come `admin` **solo** su 7 endpoint espliciti (liste pending + approvazione di eventi/ferie/malattie) — non su `routes/admin/*` (CRUD client/sedi), non su `DELETE /illnesses/:id`, non su `GET /illnesses/manager`, non su `POST /checkins`. Deliberatamente più permissivo del controllo usato per la correzione cartellino (vedi sotto), perché qui lo scopo è solo "vedi/approvi tutto il client come admin", non "sei lo specifico superiore di questa persona".

### Decisione: correzione cartellino usa una soglia `role_level`, non `isAdminEquivalent`
Per decidere chi può correggere il cartellino di un manager/senior_manager, `resolveIsApprover` usa `role_level >= ROLE_LEVELS.admin` (solo admin/superadmin bypassano) più un confronto esatto su `reports_to_id` — mai `isAdminEquivalent`, che avrebbe permesso a un qualunque senior_manager/director generico di correggere il cartellino di QUALSIASI manager, vanificando lo scopo della catena `reports_to_id`. Self-correction bloccata per `manager/senior_manager/director` (non per `admin/superadmin`, che non hanno un superiore che potrebbe farlo al loro posto).

### Processo: `/superpowers:subagent-driven-development` in worktree isolato, 6 task + review finale
Stesso pattern di Session 115 (implementer + task-reviewer indipendenti per task, fix-loop quando serve, review olistica finale prima del merge). Due fix-round minori durante i task (ordine parametri di `resolveIsApprover` invertito rispetto al piano nel Task 2; test non isolato correttamente nel Task 3). **La review finale whole-branch (Opus) ha trovato 1 bug di sicurezza reale**: la guardia gerarchica di `checkins.js` copriva solo `['manager','senior_manager']` come ruoli target, escludendo `director` — un senior_manager poteva correggere il cartellino di un director (privilege inversion), dovuto a una lista di nomi ruolo hardcoded invece di una soglia su `role_level` — fixato nello stesso giro insieme a 3 correzioni di accuratezza nella documentazione (la spec sovrastimava sia la retrocompatibilità per client a 2 livelli sia lo scope reale di `reports_to_id`).

### Decisione: `/test-all` + `/code-review` esplicitamente richiesti dall'utente prima del merge, anche dopo una review finale già pulita
Ha trovato un **secondo bug reale**, non catturato da nessuna delle review precedenti (task-level né whole-branch): `senior_manager`/`director` potevano correggere il cartellino di **qualsiasi dipendente comune, in qualsiasi sede**, perché cadevano nel varco tra la guardia di sede (`checkins.js`, applicata solo se `role==='manager'`) e la guardia gerarchica (applicata solo se il target è già manager+). Nessuna delle due guardie copriva il caso "chi corregge è senior_manager/director, il target è un `employee` qualunque". Fixato con un blocco esplicito (`FORBIDDEN_ROLE` per senior_manager/director su un target sotto il livello manager) + 4 test di regressione. **Lezione**: anche un piano ben specificato e più review indipendenti possono lasciar passare un gap che emerge solo combinando due condizioni previste separatamente (nuovo ruolo × target di livello più basso) — vale la pena mantenere il passaggio esplicito di `/code-review` prima del merge anche quando il processo interno ha già dichiarato "pulito".

### Follow-up deliberatamente non risolti (coerenti coi Non-Goals della spec) — ✅ chiusi in Session 117
Spawnati come task in background, avviati dall'utente in sessioni separate, poi chiusi con coordinamento cross-session — vedi la sezione Session 117 sopra e TASKS.md "Follow-up Gerarchia Ruoli":
- `task_bceb920f` — i nuovi ruoli ricevono 403 fail-closed su dashboard/stats/export CSV (`buildScopedFilters` in `queryScope.js` non li riconosce) — sicuro, ma li rende parzialmente inutilizzabili.
- `task_0e1577e8` — `presences.js` usa una denylist di ruoli (non un allowlist) che non esclude i nuovi ruoli, rischiando di farli comparire come dipendenti a zero ore in un export payroll — il più delicato dei due.

### Esito
Merge fast-forward pulito su `main` (`ce94beb`), nessun conflitto, worktree e branch rimossi. Suite riverificata verde sul risultato mergiato: backend 949/963 (14 skip preesistenti), frontend 331/332 (1 skip preesistente). Nessuna UI aggiunta (backend-only per design) — rischio di produzione quasi nullo finché un admin non crea effettivamente righe `senior_manager`/`director`.

---

## Session 115 — Mutua esclusione Evento/Ferie/Malattia: implementazione, race condition trovata pre-merge e fixata, deploy produzione (26 Agosto 2026)

### Contesto
Continuazione di Session 114 (design spec + piano approvati, esecuzione non iniziata). Bug reale in produzione: un dipendente poteva avere Evento/Training, Ferie e Malattia tutti approvati/pendenti simultaneamente per lo stesso giorno.

### Decisione: `/superpowers:subagent-driven-development` in worktree isolato, non inline
Piano da 8 task eseguito con implementer + spec-reviewer + code-quality-reviewer indipendenti per task, come raccomandato dall'handoff Session 114 (review a due stadi, non un solo giro a fine piano). Un implementer ha esaurito il proprio limite settimanale a metà Task 4 (guardia mancante in `events.js`) — il lavoro non committato è stato recuperato, verificato e completato manualmente dal controller invece di essere ri-dispatchato o scartato.

### Decisione: review olistica finale oltre alle review per-task
Dopo tutti gli 8 task, una review sull'intero diff (non solo task-per-task) ha trovato 2 gap di copertura test genuini (percorsi già corretti nel codice ma mai esercitati da un test: `leaves.js` approvazione↔malattia, cascata malattia↔ferie PENDING) — chiusi prima di aprire la PR. Stesso principio già applicato in Session 114 per `demoSeed.js` (una review non è mai "finita" al primo giro quando si tratta di completezza).

### Bug critico trovato da `/code-review:code-review` pre-merge (non dai reviewer per-task)
Richiesto esplicitamente dall'utente prima del merge: `/test-all` (verde) + `/code-review:code-review` (4 agenti paralleli). **Due agenti indipendenti hanno trovato la stessa root cause**: `lockEventConflictScope` (usato da `events.js`/`checkins.js`/`smartWorking.js`, chiave con `date`) e `lockAbsenceConflictScope` (usato da `leaves.js`/`illnesses.js`, chiave con suffisso `:absence` **deliberatamente** progettato per non collidere mai con l'altro) vivevano in due keyspace di advisory-lock Postgres disgiunti per lo stesso dipendente. Sotto READ COMMITTED (nessun isolation level esplicito in `db-transaction.js`), questo permetteva a un event-create e una leave-create/illness-report concorrenti di superare entrambi il proprio controllo di conflitto prima che l'altro committasse — vanificando la mutua esclusione proprio per le coppie Evento↔Ferie ed Evento↔Malattia (Ferie↔Malattia era già protetta, condividendo la stessa chiave). Un quarto agente ha trovato indipendentemente un secondo bug nella stessa area: le UPDATE della cascata "malattia vince sempre" non avevano guardia `WHERE status IN ('PENDING','APPROVED')`, con rischio di lost-update silenzioso su un'approvazione concorrente.

### Decisione: unificare il namespace dei lock invece di farli coesistere
Con `/senior-backend` + `/senior-architect` a inquadrare il principio (un solo meccanismo di serializzazione per un invariante condiviso, mai due namespace paralleli sulla stessa risorsa logica): entrambe le funzioni ora calcolano la stessa chiave hash per `(clientId, employeeId)`, ignorando la data — tutti e 5 i punti di scrittura (checkin, smart working, evento create/approve, ferie create/approve, malattia report) ora si serializzano a vicenda per lo stesso dipendente. Trade-off accettato consapevolmente: due date diverse per lo stesso dipendente ora si serializzano anch'esse (perdita di parallelismo intra-dipendente) — accettabile per una feature HR interna a bassissimo QPS (poche richieste/dipendente/giorno). In aggiunta: `illnesses.js` ora acquisisce il lock a inizio transazione (prima dell'INSERT della malattia, non a metà), e le UPDATE della cascata hanno la guardia di stato mancante.

### Verifica del fix (non solo "i test passano")
Il fix è stato verificato con test di concorrenza reali a due connessioni Postgres separate (stesso pattern già stabilito in `eventConflict-lock-race.test.js`), confermati esplicitamente a **fallire contro il codice pre-fix** (via `git stash`/checkout temporaneo) prima di essere accettati come regression test genuini — non solo test che passano per coincidenza. Una review indipendente post-fix ha trovato un ulteriore gap minore (il test del lost-update-guard non chiamava il codice reale di `illnesses.js`, solo una riscrittura letterale della SQL) — chiuso con un test "tripwire" che legge il sorgente reale del file e verifica che la clausola di guardia sia effettivamente presente.

### Esito
PR #17 mergiata (squash, `876f2db`), CI verde (Backend Lint&Test, Mobile, Security), deploy automatico EC2 completato e verificato (`/health` 200, container `healthy`). Worktree e branch (locale+remoto) ripuliti a fine sessione.

### Follow-up aperti (non bloccanti, documentati nella PR)
- `EVENT_DATE_CONFLICT` resta un codice condiviso tra 4 motivi di conflitto diversi in `events.js` — un client può distinguerli solo dal testo del messaggio.
- Una ferie che copre un intervallo passato-futuro viene rigettata (e il saldo ripristinato) per intero quando solo la porzione futura è in conflitto con una malattia — comportamento intenzionale del design, non un bug.
- `rejection_reason` non ha ancora una superficie UI dedicata (gap preesistente, non introdotto da questa sessione).
- ~~Cleanup del dato corrotto di Maria in produzione (25/08/2026)~~ — **non necessario**: Maria è un utente di test, non un cliente reale (chiarito dall'utente).

---

## Session 111-112 — Pacchetto "Sales-Ready" (readiness pre-primo-cliente) + chiusura DNS Route53 (23 Agosto 2026)

### Contesto
Su richiesta di un'analisi critica dello stato del progetto vista dal punto di vista dell'adozione del primo cliente pilota: prodotto tecnicamente completo, ma **zero clienti, zero contatti commerciali fatti** (outreach mai eseguito nonostante piano pronto da settimane), e 3 gap legali GDPR aperti da Session 100 mai indirizzati (S.27 base giuridica consenso GPS, S.28 autorizzazione Art.4 Statuto Lavoratori, S.29 DPIA obbligatoria).

### Decisione: readiness prima dell'outreach, non in parallelo
Via `/superpowers:brainstorming`, scelta tra 3 opzioni (solo blocchi legali / pacchetto sales-ready completo / tutto in parallelo con l'outreach): **pacchetto completo**, dando priorità alla chiusura dei gap prodotto/legale/commerciale prima di riprendere l'outreach. "Settembre 2026" (target MVP da `CLAUDE.md`) interpretato via `/grilling` come "pronti a vendere entro quella data", non "cliente firmato entro quella data" — l'outreach segue con la propria timeline separata.

### Correzione strutturale scoperta nel grilling
Il design iniziale assumeva un "wizard di onboarding" per attivare il gate Art.4 su un nuovo cliente. Verifica diretta del codice ha mostrato che **non esiste** — la creazione di un tenant è un form a 3 campi (`ClientsTab.jsx`) compilato da un superadmin Dataxiom, non un flusso self-service del cliente. Il gate è stato quindi riprogettato per agganciarsi al **tentativo di attivazione** in `SettingsTab.jsx` (dove è l'admin del cliente stesso a poter attestare l'autorizzazione), non alla creazione del tenant — con default `geofencing_feature_enabled=false` hardcoded per i nuovi clienti indipendentemente da chi li crea.

### Esecuzione — verifica progressiva per-task, non solo a fine piano
6 task (S.27 wording consenso GPS, S.29 template DPIA, S.28 gate Art.4+audit dedicato, fix dicitura stale `CLAUDE.md`, messaging Face ID in `/prova-demo`, modulo d'ordine commerciale) eseguiti inline via `/superpowers:executing-plans`, con un **subagent di review indipendente dopo ogni singolo task** (spec-review + code-quality-review) — pattern ibrido richiesto esplicitamente dall'utente, non solo una review finale. Ha trovato 4 finding reali corretti in corsa, tra cui un caso rilevante: la DPIA dichiarava il gate Art.4 "già in essere" prima che il task che lo implementa fosse stato eseguito — un documento a rilevanza legale che affermava qualcosa di non ancora vero al momento del proprio commit. Una **code review finale su tutto il diff** (5 angoli: CLAUDE.md, bug scan, git blame, code-comments compliance, verifica di un sospetto falso positivo) ha trovato altri 2 problemi minori, corretti, e confermato che un sospetto bug su `ValidationError`/`err.details` era in realtà il pattern già stabilito nel codebase (verificato leggendo `app.js` invece di fidarsi della segnalazione).

### Deploy e chiusura
PR #13 (fallita al primo giro CI per un errore ESLint reale mai controllato localmente prima del push, poi verde) mergiata e verificata live in produzione (`/health`, endpoint). Migrazione DNS Route53 (Task 10, sospesa da Session 110) verificata completamente propagata: 3 resolver DNS indipendenti, SOA/MX/DKIM/SES tutti confermati, tutti i siti HTTPS verificati 200/301 — routine di monitoraggio automatico disattivata.

**Lezione di processo su un worktree branch riusato per settimane**: chiudere la sessione (PR #15) ha rivelato che il branch di lavoro portava ancora 4 file workflow CI fermi a `actions/*@v4`, mentre `main` era già a `@v5` da una PR precedente mai arrivata su questo branch — se pushato così com'è avrebbe *revertito* quel fix. Sincronizzati prima del push. Anche dopo la sincronizzazione, `gh pr merge` ha riportato un conflitto nonostante un diff a 2 punti (`git diff origin/main..HEAD`) pulito — causa: il merge-base del branch con `main` risaliva a prima di molte squash-merge di sessioni precedenti, quindi GitHub tentava un vero merge a 3 vie sull'intera storia divergente. Risolto creando un branch pulito da `origin/main` e applicando solo la patch reale (`git apply`), non investigando il conflitto sul branch vecchio.

**Stato:** Pacchetto Sales-Ready live in produzione (PR #13). Task 10 chiuso (PR #15). `product-marketing.md` v3→v4. S.27/S.28/S.29 mitigati tecnicamente/documentalmente, non chiusi in senso legale formale (bozze, disclaimer esplicito, nessuna revisione legale esterna richiesta per scelta deliberata). Prossimo passo aperto: eseguire un batch ridotto di cold outreach (10-15 account, non i 100-150 del piano completo) — Dataxiom non ha relazioni clienti esistenti da cui partire con introduzioni calde, quindi si parte direttamente a freddo.

---

## Session 110 — AWS cost optimization eseguito, migrazione DNS a Route53 pausata per rischio email (23 Agosto 2026)

### Contesto
L'utente ha segnalato una spesa AWS insostenibile: budget configurato a $20/mese, spesa reale del mese $68.42, previsione $102.81. Richiesto `/superpowers:brainstorming` per una spending review accurata.

### Diagnosi reale (non stimata) via inventario AWS CLI
- **RDS staging (`db.t3.micro`) 24/7, non coperto da Free Tier** (~$15-16/mese) — il Free Tier copre solo 750h/mese cumulative nell'intero account, già saturate dall'istanza di produzione.
- **EC2 produzione `t3.small` 24/7** — CPU media reale 7gg: 1.07%, picco 32.6%, sovradimensionato.
- **2 snapshot RDS manuali dimenticati** da giugno (~$3.8/mese) — a differenza degli automatici (retention 1gg), non scadono mai da soli.
- **ECR senza lifecycle policy**: 181 immagini/~33GB accumulate, crescita illimitata a ogni push.
- **Log CloudWatch staging senza retention** (crescita illimitata, a differenza di prod che ha 30gg).
- Nota positiva: gli alert di budget (soglie 85%/100%) erano già configurati correttamente e in stato ALARM — non un gap di alerting, solo non notati in tempo.

### Revisione esplicita rispetto all'attivazione del cliente pilota (~1 mese)
Su richiesta dell'utente, il piano è stato rivalutato per non rischiare instabilità durante l'onboarding:
- **Downgrade EC2 prod (`t3.small`→`t3.micro`) deferito**, non eseguito — la CPU lo giustificherebbe ma la memoria (2GB→1GB) è un rischio concreto data una crisi di stabilità pregressa da pool exhaustion/OOM già documentata (`backend_stability_crisis_resolved.md`). Trigger per rivalutarlo: cliente pilota stabile da 2-4 settimane, più l'installazione di un CloudWatch Agent per dati di memoria reali (oggi assenti).
- **Nuovo item di readiness**: `BackupRetentionPeriod` RDS produzione alzato da 1 a 7 giorni — 1 giorno era troppo corto per un rollback realistico su dati di un cliente pagante.
- Nessun blocker di attivazione cliente non legato al costo trovato — l'onboarding self-service è già verificato end-to-end (Gate finale, Session 89).

### Migrazione DNS `dataxiom.it` — Soluzione A scelta, poi verificata via AWS CLI
`dataxiom.it` è registrato **e** gestito interamente da Register.it (nameserver `ns1/ns2.register.it`). Confermato via `aws route53domains`: il TLD `.it` è supportato da Route53 per il trasferimento di registrazione, ma scartato (Soluzione B) per il rischio di una procedura Nic.it a tempistiche non garantite a ridosso del lancio. Scelta la delega DNS via nameserver (Soluzione A): hosted zone Route53, registrazione invariata su Register.it.

Inventario record reale catturato via `dig`/`aws sesv2`: A/CNAME per root/www/api/badge, **MX `10 mail.register.it`** (caselle email reali ospitate a Register.it, non solo SES), TXT google-site-verification, **3 CNAME DKIM SES** (`aws sesv2 get-email-identity` — necessari per non rompere la verifica del dominio SES).

### Esecuzione — `/superpowers:subagent-driven-development` adattato a task infrastrutturali
Nessun codice da revisionare per stile in questo piano — adattamento: un subagent "executor" per task che esegue i comandi esatti del piano e riporta l'output reale, verifica diretta del controller (query `describe`/`get` di sola lettura) al posto della code-quality-review, dato che non c'è giudizio di qualità del codice da fare su comandi AWS CLI letterali.

**Eseguiti e verificati (Task 1-8/11):**
1. RDS staging fermato.
2. 2 snapshot manuali cancellati — un subagent ha sollevato un falso allarme di sicurezza ("unica risorsa di backup dell'account"), verificato e smentito controllando che i 6 snapshot automatici (il vero meccanismo di backup) fossero intatti.
3. Lifecycle policy ECR applicata (mantiene le 15 immagini più recenti, 166 marcate per scadenza).
4. Retention log staging impostata a 30gg.
5. Backup retention RDS prod alzata a 7gg.
6. **Elastic IP `52.19.238.50` allocato e associato** a `badge-system-api` — chiude alla radice l'incidente che ha aperto questa sessione (IP EC2 effimero, DNS rimasto stale dopo un riavvio), indipendentemente dalla sorte della migrazione Route53. Record A `api.dataxiom.it` aggiornato manualmente su Register.it dall'utente.
7. Hosted zone Route53 creata e popolata con tutti e 9 i record reali.
8. Verifica pre-cutover superata — tutti i record confermati corretti via `aws route53 list-resource-record-sets` (query diretta al control plane, non soggetta a cache DNS).

**Scoperta collaterale, non correlata al piano**: il resolver DNS locale del sandbox restituiva risposte stantie indipendentemente dal server `@` specificato in `dig` — ha causato falsi allarmi di "propagazione lenta" su Register.it che in realtà era già avvenuta. Diagnosticato e risolto verificando con query DoH dirette (Cloudflare, bypassa il resolver locale) e con l'API Route53 direttamente — entrambe affidabili indipendentemente dal problema locale. Lezione: non fidarsi di `dig` locale per verifiche DNS critiche in questo ambiente, preferire DoH o query dirette al control plane del provider.

### Task 9 (cutover nameserver) fermato dall'utente — rischio email non chiarito
Nel pannello "Cambio DNS" di Register.it è comparso un avviso non previsto nella spec: *"L'impostazione dei DNS esterni comporterà la disattivazione di tutti i servizi aggiuntivi legati al dominio."* L'utente ha una casella email reale e attiva **`diego@dataxiom.it`** ospitata a Register.it. Non è possibile determinare dagli strumenti disponibili se l'avviso riguardi solo componenti di pannello Register.it o disattivi il servizio email stesso, indipendentemente dal record MX (già replicato correttamente in Route53).

**Decisione**: dato che il problema originale (IP EC2 effimero) è già risolto autonomamente dal Task 6, il beneficio residuo della migrazione Route53 (gestione DNS via API) è stato giudicato insufficiente a giustificare il rischio concreto di perdere una casella email di lavoro attiva, senza prima una conferma esplicita dal supporto Register.it. **Il cutover è pausato, non abbandonato** — la hosted zone Route53 resta creata e verificata, pronta a riprendere dal Task 9 senza rifare il Task 7.

**Stato:** Task 1-8/11 completati e verificati. Target di risparmio (~€20-30/mese) già raggiunto dai Task 1-5, indipendentemente dall'esito della migrazione DNS. Task 9-10 in attesa di conferma Register.it sul servizio email.

### Addendum — merge PR #11 + effetto collaterale scoperto nel deploy (stesso giorno)

Dopo la chiusura del piano AWS cost optimization, l'utente ha chiesto di procedere con il merge di PR #11 (mutua esclusione Smart Working↔Eventi, Session 109, era in attesa perché AWS non era raggiungibile). Squash-merge eseguito (`3697b8e`) — pipeline CI/CD e Build&Push ECR verdi, ma **il job "Deploy to EC2" è fallito** al primo tentativo: `dial tcp ***:22: i/o timeout` nello step SCP.

**Root cause**: il secret GitHub Actions `EC2_HOST` (usato dal workflow `deploy-to-ec2.yml` per l'SSH verso l'istanza) era impostato dal 2 giugno 2026 — ancorato all'IP pubblico effimero originale, mai aggiornato. L'Elastic IP allocato oggi stesso nel Task 6 del piano di cost optimization ha reso quell'IP obsoleto, senza che il piano lo prevedesse (il secret non era nell'inventario delle risorse toccate). Fix: `gh secret set EC2_HOST --body "52.19.238.50"`, poi `gh run rerun` sul job fallito — secondo tentativo verde, `/health` confermato con database connesso.

**Lezione**: un Elastic IP appena associato va propagato anche a qualunque secret/config esterno che referenzi l'IP dell'istanza in modo statico (non solo il DNS) — in questo caso un secret CI/CD, non solo il record DNS di `api.dataxiom.it`. Da controllare esplicitamente la prossima volta che si tocca l'IP pubblico di un'istanza EC2 con un deploy automatico basato su SSH diretto.

### Addendum — Downgrade EC2 prod eseguito lo stesso giorno, dopo una rivalutazione approfondita

L'utente ha chiesto una nuova analisi via `/superpowers:brainstorming` sul downgrade EC2 prod, deferito nella spec originale. Dati reali raccolti via SSH diretto sull'istanza + query CloudWatch, non solo stime:

- **Il container usava solo 72MB** in una fotografia puntuale, ma serviva uno storico — trovato un **falso gap**: il CloudWatch Agent pubblicava correttamente `mem_used_percent` già da settimane, semplicemente sotto un namespace custom (`BadgeSystem/EC2`), non quello di default (`CWAgent`) interrogato inizialmente. Recuperate **3 settimane di dati reali** (1-23 agosto, 521 datapoint): memoria media 22.87%, **picco 32.37%** (~615MB su 1.9GiB); CPU media 1.09%, picco 32.59%.
- **Verifica cruciale che ha cambiato la valutazione del rischio**: riletto il dettaglio della crisi di stabilità storica (`backend_stability_crisis_resolved.md`, 4 giugno) — le cause erano **pool di connessioni DB troppo piccolo (min=1/max=5, poi fixato a 5/20), timeout di cold-start RDS troppo breve, healthcheck troppo rigido**. Nessuna di queste è legata alla RAM dell'host. La preoccupazione "rischio OOM" della spec originale era una generalizzazione eccessiva di un incidente che non era di memoria.
- Su un `t3.micro` (1GiB), il picco reale (615MB) sarebbe ~60% di utilizzo — margine sano, sotto l'85% dell'alarm.

**Decisione**: dato che il rischio tecnico è risultato più basso del previsto, e non c'è ancora un cliente reale (quindi qualunque problema imprevisto impatta solo traffico interno/demo), l'utente ha scelto di **capovolgere la logica della spec originale**: eseguire il downgrade ORA, nella finestra a più basso rischio possibile, invece di aspettare che un cliente pagante dipenda dal sistema.

**Eseguito** (via `/superpowers:subagent-driven-development`, un subagent executor per step + verifica indipendente del controller):
1. **Alarm CloudWatch `badge-ec2-memory-high`** creato (soglia 85%, stesso pattern degli alarm esistenti — SNS `badge-alerts`, Period 300, EvaluationPeriods 2).
2. **Downgrade `t3.small`→`t3.micro`** eseguito (stop → modify-instance-attribute → start → wait status-ok) — Elastic IP rimasto invariato automaticamente attraverso lo stop/start, nessun impatto DNS.
3. **Verifica post-downgrade** (fatta dal controller, non dal subagent, per indipendenza): `/health` → 200 con database connesso; container Docker `Up (healthy)`, **12.81% di memoria** (116.5MiB/909.5MiB), **RestartCount: 0**; alarm memoria in stato `OK` con dati reali (~19.7% di utilizzo).
4. Piano di rollback documentato (stesso pattern stop/modify/start, ~2 minuti) — non necessario, nessun problema riscontrato.

**Stato:** downgrade completato e verificato sano. Risparmio stimato ~$7-8/mese aggiuntivo rispetto ai Task 1-5 già eseguiti.

### Addendum — Task 9 (cutover DNS) eseguito dopo conferma Register.it

L'utente ha contattato il supporto Register.it, che ha confermato: il cambio DNS esterni non rompe la posta **a condizione che** MX e i relativi SPF/DKIM siano già presenti nel nuovo provider prima del cutover. Verificato che era già così — Task 7 aveva già replicato il record MX (`10 mail.register.it`) e i 3 CNAME DKIM SES nella hosted zone Route53; nessun record SPF esisteva originariamente (riconfermato via query DoH), quindi nulla mancava. Un test reale di invio email a `diego@dataxiom.it` (fatto dall'utente prima del cutover) ha confermato il funzionamento come baseline.

**Task 9 eseguito**: nameserver di `dataxiom.it` cambiati su Register.it dai 2 originali ai 4 di Route53. Il pannello conferma il salvataggio ("Le nostre configurazioni sono disabilitate"), ma la propagazione pubblica (verificata via DoH — ancora `ns1/ns2.register.it` al momento del controllo) richiede 24-48h più la validazione della Registration Authority italiana (Nic.it) sulla corretta configurazione tecnica dei nuovi DNS. Non un fallimento, un'attesa normale. **Task 10 (verifica finale) rimandato a fine giornata su richiesta dell'utente.**

### Addendum — Bug Session 106 (durata/giorno evento in Presenze) chiuso con verifica end-to-end via API

Investigato il bug mai risolto da Session 106 ("dopo l'approvazione manager, giorno e durata dell'evento non compaiono correttamente nella sezione Presenze"). Un agente Explore ha trovato che il codice era **già stato fixato** (commit `570c06b`, 21 agosto — nuovo endpoint `GET /api/v1/events/approved` + funzione `mapEventToPresenceRow` nel frontend) ma mai verificato a schermo — la root cause reale non era un mismatch di nomi di campo, ma un'assenza totale: la tabella Presenze non includeva affatto gli eventi prima del fix.

Confermato che il fix è live in produzione ispezionando direttamente il contenuto del bundle JS servito da `badge.dataxiom.it` (stesso metodo usato per la verifica OTA mobile in Session 108 — grep di stringhe distintive `events/approved`/`ore_label`/`is_event` nel bundle compilato, non solo il log del deploy).

**Verifica end-to-end reale via API**, richiesta esplicitamente dall'utente: creato un tenant demo isolato (`POST /demo/start`, pulizia automatica già verificata in Session 89), sottomesso un evento reale (`POST /events/request`) e approvato (`PUT /:id/approve`), chiamata la risposta reale dell'endpoint `GET /events/approved`, e passata quella risposta reale attraverso la funzione di mapping frontend vera (`mapEventToPresenceRow`, eseguita con Node — stesso codice sorgente che gira nel browser, non una simulazione). Risultato: `timestamp` corretto (evento del 24/8 09:00 Europe/Rome → `2026-08-24T07:00:00.000Z` UTC) e `ore_label: "8h"` corretto (09:00-17:00) — esattamente i due sintomi originariamente segnalati come rotti.

Nota collaterale trovata durante l'indagine (non parte del bug, non fixata): il ruolo `superadmin` non è tra i ruoli riconosciuti da `GET /events/approved` (solo `employee`/`manager`/`admin`/`viewer`) — un gap minore pre-esistente, irrilevante per Dataxiom staff dato che gestiscono clienti reali con account `admin` scoped al tenant, non `superadmin`.

**Stato:** bug chiuso, verificato con prova diretta end-to-end, non solo lettura del codice.

### Addendum — Warning CI Node 20 risolto (ultimo item pending della sessione)

Bump `actions/checkout`/`actions/setup-node`/`actions/upload-artifact` da `@v4` a `@v5` in tutti e 4 i workflow (`ci.yml`, `ecr-push.yml`, `deploy-staging.yml`, `deploy-to-ec2.yml`, 18 occorrenze totali) — GitHub aveva iniziato a forzare l'esecuzione di queste action su Node 24 con un warning ad ogni run, dato che `@v4` dichiara Node 20 (deprecato lato runner). Nessuna logica di workflow toccata, solo le versioni pinnate.

Branch dedicato creato da `origin/main` (non sul branch di questa sessione, già squash-mergiato — stesso pattern di divergenza post-squash-merge già documentato in sessioni precedenti, evitato ripartendo pulito). Tutti e 4 i file YAML validati (`yaml.safe_load`) prima del push. CI verde su tutti i check obbligatori. **PR #12 mergiata** (squash `fd9e876`).

**Stato:** tutti i task pending aperti in questa sessione risultano ora completati, ad eccezione del Task 10 (verifica finale post-cutover DNS), in attesa della propagazione dei nameserver Route53 (24-48h + validazione Nic.it) — da ripetere quando la propagazione sarà completa.

---

## Session 109 — Mutua esclusione Smart Working ↔ Eventi/Training, PR #11 aperta, merge posticipato (22 Agosto 2026)

### Contesto
L'utente ha confermato visivamente sul device reale che la mutua esclusione Eventi/Training ↔ QR check-in (PR #7, Session 106-108) funziona, ma ha segnalato un gap parallelo testando con l'utenza Maria: un dipendente poteva ancora dichiarare Smart Working per un giorno con un evento già approvato, mentre il check-in QR era già correttamente bloccato in quello scenario. Richiesta esplicita di usare `/superpowers:brainstorming` (con `/grilling` per le domande) per progettare la stessa mutua esclusione anche verso Smart Working.

### Design — 4 decisioni via `/grilling`
Tutte risolte sull'opzione raccomandata:
1. Stati evento bloccanti per Smart Working: PENDING e APPROVED (non solo APPROVED) — coerente con la logica già esistente in `events.js POST /request`, che blocca un nuovo evento se Smart Working esiste, usando la stessa soglia.
2. Approvare un evento deve fallire se il dipendente ha già dichiarato Smart Working per quella data (non solo il percorso inverso).
3. UX mobile: mirror esatto del pattern pre-check già in `QRScannerScreen.jsx`, non un pattern nuovo.
4. Riuso di `lockEventConflictScope` esistente (nessun nuovo lock advisory) — entrambi i nuovi controlli si trovano già dentro un percorso di codice che acquisisce quel lock per lo stesso scope `(clientId, employeeId, date)`.

Spec: `docs/superpowers/specs/2026-08-22-smart-working-event-conflict-design.md`. Piano: `docs/superpowers/plans/2026-08-22-smart-working-event-conflict.md` (6 task).

### Implementazione — `/superpowers:subagent-driven-development` in worktree isolato
- **Task 1**: nuova `findConflictingSmartWorking(client, {clientId, employeeId, date})` in `backend/src/utils/eventConflict.js` — query su `smart_working_days` (colonna `DATE` semplice, nessun rischio di timezone come le colonne `TIMESTAMPTZ`).
- **Task 2**: `smartWorking.js POST` riscritto per acquisire il lock, controllare `findConflictingEvent`, e solo poi inserire. **Fix collaterale trovato durante l'implementazione**: la route calcolava "oggi" con `CURRENT_DATE` di Postgres (timezone di sessione, UTC su AWS RDS) invece di `todayInTimeZone()` (Europe/Rome) — stessa classe di bug già documentata come **Pattern 6** in `CLAUDE.md` (trovata e fixata due volte in precedenza in `checkins.js` e `eventConflict.js`). Allineato.
- **Task 3**: `events.js PUT /:id/approve` esteso con il controllo `findConflictingSmartWorking` dentro il blocco `if (status === 'APPROVED')` esistente, riusando il lock già acquisito per il controllo checkin.
- **Task 4**: test real-Postgres dedicati `smartWorking-event-conflict.test.js` (6 test), stessa struttura di `checkins-event-conflict.test.js`. Deviazione dal piano: aggiunto un helper `makeAdminEmployee` perché `event_requests.approved_by` referenzia `employees(id)` (migration 041) — verificata come fix necessario e comportamentalmente inerte (l'approvazione è gated solo dal ruolo JWT, non da un lookup DB dell'approvatore).
- **Task 5**: pre-check mobile in `SmartWorkingScreen.jsx`, mirror esatto di `QRScannerScreen.jsx` (stesso pattern `cancelled` flag, stesso stile schermata di blocco).
- **Task 6**: review finale olistica sull'intera feature — nessun difetto critico/importante residuo.

Ogni task ha avuto spec-review e code-quality-review indipendenti dedicati (tutti "Ready to merge: Yes"). Un code-quality-reviewer del Task 5 è stato interrotto da un limite di sessione API a metà lavoro — completato manualmente invece di ri-dispatchare un nuovo subagent, per non rischiare di colpire di nuovo lo stesso limite.

### Verifica finale e PR
`/code-review:code-review` adattato al diff locale (nessuna PR ancora esistente al momento del lancio) — 5 agenti paralleli, 2 candidati (score 45 e 25, entrambi sotto la soglia 80) → nessun problema riportato. `/test-all`: backend (entrambi i batch), frontend-web (330/330, un timeout confermato flaky e non correlato in `EmployeesTab.test.jsx`), mobile (163/163 già verificato). Push + **PR #11** creata (https://github.com/falletti-diego/badge-system/pull/11) — CI verde su tutti i check (Backend - Lint & Test, Mobile - Test, Security Check), stato `MERGEABLE`.

### Merge posticipato — decisione esplicita dell'utente
L'utente ha segnalato che il proprio account AWS non è al momento raggiungibile e ha chiesto di attendere prima del merge. Chiarito che il merge su `main` è un'operazione solo GitHub, indipendente da AWS — ma lo step successivo della pipeline CI/CD (`git push main` → build Docker → push ECR → SSH EC2 per il deploy) fallirebbe senza accesso AWS. **Decisione: attendere.** PR #11 resta aperta, verde, pronta al merge quando l'utente lo richiederà.

**Stato:** PR #11 aperta e mergeable, merge non ancora eseguito su richiesta esplicita dell'utente (AWS non disponibile). Nessuna azione ulteriore in corso.

---

## Session 108 — OTA di produzione per la mutua esclusione Eventi/Training, verificato end-to-end (22 Agosto 2026)

### Contesto
L'utente ha chiesto conferma se la mobile app avesse recepito la feature "Eventi/Training" e la mutua esclusione QR↔evento (PR #7, Session 107), e se servisse una nuova build. Confermato che il codice era mergiato su `main` ma build 37 (TestFlight, Session 106) è precedente a PR #7 — nessuna distribuzione copriva ancora il cambio. Su richiesta dell'utente, pubblicato un OTA con verifica rigorosa (prima volta per questo tipo specifico di cambio).

### Analisi "OTA sufficiente o serve build nativa?"
`git show ca89fb9 --stat` conferma che lato mobile il diff tocca solo `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx` (46 righe) — nessun file nativo (`app.json`, `package.json`, config iOS/Android). Build 37 ha già `expo-updates` configurato correttamente (verificato in Session 106) — condizioni per un OTA sicuro soddisfatte, a differenza del problema del build 16 (Session 106: OTA pubblicato ma il binario installato non aveva alcun meccanismo di ricezione).

### Sync da uno stato certo, non dal checkout locale stale
Il checkout locale di `main` era indietro di 10 commit rispetto a `origin/main` (le squash-merge di PR #7/#9 fatte in Session 107 via `gh pr merge` non avevano aggiornato il checkout principale) e aveva anche 1 commit locale mai pushato. Pubblicare da lì avrebbe rischiato di spedire codice senza la mutua esclusione. Creato un worktree temporaneo puntato su `origin/main`, isolato dal checkout principale — suite di test mobile completa verde lì (20/20 suite, 157/157 test) prima di pubblicare.

### Pubblicazione e verifica end-to-end in 3 passi
`eas update --branch production` (iOS update ID `01a0292e-52f6-7899-ac9f-a0568bb9af0f`, runtime `1.0.0`, commit `a06d8bb`). Verifica esplicitamente richiesta dall'utente, in 3 passi indipendenti — non fidandosi del solo esito positivo del comando CLI (stessa lezione di Session 106, dove un OTA "pubblicato con successo" non arrivava sul device reale):
1. Richiesta manifest simulando un device reale (header `expo-platform`/`expo-runtime-version`/`expo-channel-name` uguali a build 37) → `expo-update-id` nella risposta combacia esattamente con l'update appena pubblicato.
2. SHA-256 (base64url) del bundle JS locale confrontato byte-per-byte con l'hash `launchAsset` del manifest → match esatto su iOS e Android.
3. Grep sul bundle compilato (bytecode Hermes) per le stringhe UI distintive della mutua esclusione (`"Hai un evento programmato"`, `"Verifica eventi in corso"`) → presenti su entrambe le piattaforme.

Prova diretta e non solo inferita: un device reale sul canale production con lo stesso runtime di build 37 riceve esattamente questo bundle, e quel bundle contiene il codice della feature.

### Problema collaterale trovato e recuperato
Il checkout locale di `main` aveva un commit di documentazione mai pushato (Session 105 closeout: dettagli produzione/migration/CI mai arrivati su `origin/main` — verificato confrontando col contenuto già presente lì, non era superato). Recuperato e applicato manualmente sul branch di sync insieme a questo aggiornamento, invece di scartarlo silenziosamente durante la risoluzione della divergenza.

**Stato:** OTA pubblicato e verificato crittograficamente/contenutisticamente. Resta da fare solo la conferma visiva sul device reale (force-quit + riapertura), non ancora eseguita in questa sessione.

---

## Session 107 — PR #7 code review, fix timezone, indagine e fix di 5 root cause di flakiness pre-esistente, merge su `main` (22 Agosto 2026)

### Contesto
Continuazione della feature "Mutua esclusione Eventi/Training vs QR check-in" (PR #7, già implementata e pushata in una sessione precedente). Questa sessione copre: `/code-review:code-review`, fix del bug trovato, indagine approfondita richiesta esplicitamente dall'utente sulla flakiness pre-esistente della suite, merge, e un miglioramento della checklist di code review.

### `/code-review:code-review` su PR #7 — bug timezone confermato e fixato
5 agenti paralleli, 1 finding reale (score 85): `eventConflict.js`/`findConflictingCheckin` filtrava con `c.timestamp::date = $3::date` — cast valutato nel timezone di **sessione DB** (UTC su AWS RDS, mai esplicitamente settato Europe/Rome da nessuna parte nel codebase) invece che nel timezone applicativo. Seconda occorrenza esatta della stessa classe di bug già fixata in `checkins.js` (commit `615fcbf`, Session 105). Fix: `(c.timestamp AT TIME ZONE 'Europe/Rome')::date`, con test di regressione (`eventConflict-timezone.test.js`) che forza esplicitamente `SET timezone = 'UTC'` sulla connessione — necessario perché il Postgres locale gira per coincidenza già in Europe/Rome, quindi senza quel `SET` il test sarebbe passato anche col bug presente. Commit `89986b3`.

### Indagine approfondita sulla flakiness pre-esistente — via `/grilling`, "Soluzione B"
Richiesta esplicita dell'utente: analisi critica, tabella problema/criticità/soluzione, soluzioni "efficienti e irreversibili". Root cause strutturale: 40+ file di test condividono un solo Postgres (`badge_system_test`), eseguiti in parallelo dai worker Jest di default — asserzioni non scoped alle righe create dal test dipendono da cosa fanno ALTRI file test in quell'istante. Tre opzioni presentate via `/grilling` (A: solo fix puntuali, B: fix mirati + split Jest a due batch, C: isolamento DB completo per-worker) — **scelta B**, motivata come compromesso tra costo di implementazione e robustezza strutturale, senza il costo/complessità di un DB-per-worker.

Interventi:
- `migration-035-employee-lifecycle.test.js` riscritto — il test asseriva un invariante globale (`hiring_date` mai NULL per attivi) **mai realmente garantito** da schema o app, passava solo per coincidenza storica dei dati esistenti. Riscritto per testare la SQL della migration in isolamento su dati auto-creati.
- `backend/scripts/run-tests.js` (nuovo): due batch — parallelo (file scoped) + serializzato `--runInBand` (7 file a stato genuinamente globale per design, es. cap demo cross-tenant, non scopeabile).
- Documentato come **Pattern 5** in `CLAUDE.md`. Commit `76aea8e`.

### Round finale — stesso rigore sul residuo `shifts.test.js`, 3 root cause aggiuntive trovate
Richiesta esplicita: "indaga anche quello ora... svolgi tutti i run che reputi necessari". Decine di run, inclusi stress-test con doppia invocazione concorrente di `npm test` in background. `shifts.test.js` **non si è mai più riprodotto** in nessun run successivo, ma lo stress ha fatto emergere 3 bug reali distinti (mai correlati a `shifts.test.js`):
1. **Fixture UNIQUE non abbastanza uniche**: 6 file/13+ occorrenze generavano valori per colonne UNIQUE con solo `Date.now()` (nessun suffisso random) — collisione se due INSERT cadono nello stesso millisecondo.
2. **`auth-refresh-first-use.test.js`**: email hardcoded non uniche su 3 `describe` block, più mutazione in-place della riga demo condivisa "Pippo" senza cleanup di `used_tokens`/`revoked_tokens` — si rompeva anche rieseguendo lo stesso file due volte di fila **senza alcuna concorrenza reale**. Un advisory lock di sessione (`pg_advisory_lock`/`pg_advisory_unlock`) aggiunto per la mutazione non bastava da solo — verificato con debug instrumentation temporanea (PID+timestamp) che il lock serializzava correttamente, prima di scoprire che il vero bug era il cleanup mancante dei token derivati.
3. **`jest.globalSetup.js`**: cancellava incondizionatamente `revoked_tokens`/`used_tokens` a ogni invocazione — poteva cancellare lo stato di una seconda invocazione `npm test` genuinamente concorrente sullo stesso DB locale. Reso age-scoped (soglia 6 minuti, sopra il TTL di 5 minuti del blocco di revoca temporaneo in `routes/auth.js:389-390`).

Tutti e 3 fixati con verifica TDD dove applicabile. Commit `ae909cd`.

**Residuo non risolto, riportato esplicitamente**: 2 fallimenti singoli non riproducibili emersi a fine stress-test (`admin-employeeSync-template.test.js`, `onboarding-invite.test.js`) — sempre verdi in isolamento, mai ricomparsi in run successivi. Valutati come artefatti di un regime di stress-test artificialmente avversario (decine di suite complete a raffica sulla stessa macchina in poco tempo), strutturalmente impossibile in CI reale (ogni job GitHub Actions ha un container Postgres effimero dedicato, mai condiviso tra run). Lasciati aperti con motivazione esplicita, non dichiarati falsamente risolti.

### Merge e checklist di code review migliorata
`/superpowers:finishing-a-development-branch`: 2 run completi `npm test` puliti prima del merge. **Squash-merge su `main`** via `gh pr merge --squash` (commit `ca89fb95`), seguendo la convenzione `merge: ...` già in uso nel repo (verificata sui merge commit delle PR precedenti prima di scegliere squash vs merge-commit vero).

Checklist di code review migliorata su richiesta esplicita: aggiunto **Pattern 6** (timezone-naive `::date` su TIMESTAMPTZ — seconda occorrenza reale della stessa classe di bug, con grep di prevenzione) e ristrutturata la sezione "Code Review Checklist" da un'unica checklist scoped solo ad Auth & Config in **3 checklist per trigger**: Auth & Config Changes (esistente), Timestamp/Date Comparisons (nuova), Real-Postgres Test Files (nuova, richiama esplicitamente Pattern 5).

**Stato:** PR #7 ✅ mergeata su `main` (deploy backend/web in produzione ancora da fare, non eseguito in questa sessione). Bug Session 106 (durata evento non visibile nelle Presenze) ancora aperto.

---

## Session 106 — Feature Eventi/Training, code review con 1 bug fixato, QA manuale, merge su `main` (20 Agosto 2026)

### Contesto
Continuazione di una sessione precedente: feature "Eventi/Training" (richiesta di autorizzazione per una giornata di evento/congresso/formazione esterna, approvata dal manager come le Ferie, conteggiata in ore lavorate/buoni pasto) già implementata full-stack (backend/mobile/web, 15 task TDD) e piano di test già scritto ed eseguito lato API. Questa sessione copre: analisi critica finale, `/code-review:code-review` su PR GitHub, QA manuale, merge.

### Analisi critica pre-merge (su richiesta esplicita dell'utente)
Due fix aggiuntivi trovati con un'indagine mirata (rate limiting, firma cartellino, GDPR export, audit log):
1. **Gap preesistente, non introdotto da questa feature**: il roster `/summary` del manager perdeva i dipendenti a zero timbrature nel mese non appena un collega della stessa sede aveva almeno una timbratura — rilevante perché un mese interamente coperto da un evento approvato è ora uno scenario reale.
2. **Gap introdotto da questa feature**: approvare un evento cambiava le ore calcolate del mese ma non invalidava un cartellino già firmato (a differenza delle correzioni di check-in). Nel fixare questo, un reviewer ha trovato un **bug di timezone**: la colonna `event_date` (tipo `DATE` di Postgres) viene parsata da `pg` a mezzanotte **locale**, non UTC — un evento del 1° del mese poteva essere attribuito al mese sbagliato su un server non-UTC. Corretto e verificato con mutation-testing su timezone estreme (UTC+14, UTC-12).

### Link di navigazione mancante e config ESLint
- Aggiunto il link "🎓 Eventi/Training" mancante nella navbar web (`/frontend-design`, con analisi della UI esistente per coerenza — la navbar usa `Button`+emoji, non icone MUI, quindi il nuovo link segue lo stesso pattern anziché introdurne uno diverso).
- `frontend-web` non aveva alcuna config ESLint (`npm run lint` falliva sempre) — creata da zero rispecchiando quella del backend. `eslint-plugin-react-hooks` era referenziato da commenti `eslint-disable-line` nel codice ma mai installato; la v7 (ultima) introduce le nuove regole "React Compiler" troppo aggressive per codice mai lintato (26 errori sparsi non pertinenti) — fissata la v4, coerente con quanto il codice già presupponeva. `eslint --fix` ha sistemato ~250 problemi di indentazione preesistenti (nessuna modifica logica).

### `/code-review:code-review` su PR #6 — 1 bug reale trovato e fixato
Nessuna PR esisteva ancora per questo branch (mai pushato) — pushato e creata PR #6 prima di lanciare la skill (skill richiede una PR GitHub reale, non lavora su branch locali). 5 agenti paralleli (CLAUDE.md compliance, bug scan, storia git, commenti PR precedenti, coerenza commenti nel codice) + scoring di confidenza (soglia 80) su 4 candidati:
- **Confermato (score 95)**: `events.js` (`GET /pending`, `PUT /:id/approve`) e il nuovo join eventi in `presences.js` (`GET /summary`) filtravano la visibilità del manager con `employees.site_id` invece del pattern consolidato `ANY(assigned_sites)` già usato altrove nello stesso file. `site_id` è documentato come "solo per i manager" (migration 006) e la migration 038 documenta **due incidenti di produzione già causati esattamente da questo pattern** per i check-in. Effetto pratico: un manager non vedeva le richieste evento pendenti dei propri dipendenti, non poteva approvarle (403), e gli eventi approvati sparivano dal riepilogo mensile — per qualsiasi dipendente con `site_id` NULL (il caso comune). Fixato nei 3 punti, con test di regressione dedicato (manager approva un evento di un dipendente raggiungibile solo via `assigned_sites`).
- **Scartati sotto soglia**: race condition su approvazioni evento concorrenti (70 — pattern architetturale identico a `leave_requests`, non una nuova regressione), TASKS.md/HANDOFF.md non aggiornati (30 — guidance di processo, non criterio di code-review), piano di test disallineato dopo l'aggiunta del link nav (68 — solo documentale).

### QA manuale web — 2 problemi ambientali risolti in corsa
- Porta 3000 (backend) e 5173 (frontend) occupate da **altri worktree attivi** dell'utente (main checkout e `worktree-new-employee-fields`) — mai toccati, avviato questo worktree su 3099/5174 invece.
- `Not Found` su "Invia Richiesta": `apiClient.js` non passa dal proxy Vite per le chiamate API, usa `window.API_CONFIG?.API_URL` (letto da `public/config.js`, hardcodato a `localhost:3000` per qualsiasi hostname locale) con priorità su `VITE_API_URL` — la variabile d'ambiente veniva quindi ignorata. Modificata temporaneamente la porta in `config.js` per il test, **ripristinata a fine QA, mai committata**.
- Walkthrough dipendente (crea richiesta) → manager (approva) → test negativo cross-sede (manager di un'altra sede non vede la richiesta — verifica diretta della fix `assigned_sites`) completato con successo. Mobile saltato su scelta esplicita dell'utente.

### Fix lint CI-blocking
Un errore di lint preesistente (virgolette singole, in `events.test.js`, non introdotto da questa feature) bloccava la pipeline CI — corretto anche se fuori scope, perché impediva il merge.

### Verifica finale e merge
Backend 823/838 (14 skip, 1 test flaky pre-esistente non correlato — `demo-switch-role.test.js`, verde in isolamento), frontend-web 324/324. CI verde su tutti i check. **Squash-merge su `main`** (commit `13f04e3`), branch remoto `worktree-eventi-training` eliminato.

### Build mobile — dall'ipotesi "basta un OTA" alla build nativa reale
Dopo il merge, l'utente ha chiesto se servisse una nuova build mobile. Prima risposta (sbagliata): verificato via `git diff` che la feature tocca solo file JS/JSX (nessuna dipendenza nativa nuova) → conclusione "basta un `eas update` OTA". Pubblicato su `production` con successo (primo OTA mai fatto per questo progetto — il canale non esisteva ancora). **Testato dal vivo sull'iPhone dell'utente: il pulsante non compariva**, nonostante force-quit e riapertura.

**Root cause reale** (trovata leggendo la storia git, non assunta): il build 16 — l'unico presente in App Store, di giugno 2026 — è stato compilato dal commit `5733adf`, **precedente** al commit che ha introdotto `expo-updates` in `app.json` (`02a888c`). Il binario installato sul device dell'utente non ha alcun meccanismo di check/apply OTA — non poteva ricevere l'update pubblicato, a prescindere da quante volte veniva riaperta l'app. Verificato concretamente simulando una richiesta manifest da device reale (header `expo-runtime-version`/`expo-channel-name`) contro l'endpoint EAS Update, confermando che l'infrastruttura OTA di per sé funzionava correttamente — il problema era esclusivamente nel binario non predisposto.

**Correzione**: `eas build --platform ios --profile production` (build **37** — il contatore EAS era più avanti del previsto, non 17 come inizialmente assunto dal numero di build precedente) → `eas submit` → App Store Connect → TestFlight (~5-10 min di processing automatico Apple, nessuna review umana per TestFlight — chiarito anche il malinteso opposto, cioè che la "review Apple di 1-2 giorni" si applica solo alla pubblicazione pubblica sull'App Store, un passo manuale separato che non è mai stato triggerato). L'utente ha chiesto se sarebbe stato più semplice usare la pipeline `codemagic.yaml` già presente nel repo (build+submit-a-TestFlight in un solo workflow) — spiegato che è funzionalmente equivalente a `eas build`+`eas submit` (entrambi caricano su App Store Connect, Apple elabora per TestFlight allo stesso modo), non riutilizzata perché l'IPA EAS era già pronta.

**✅ Build 37 installata e testata con successo dall'utente su iPhone reale** — confermato funzionante.

**Nuovo problema aperto** (utente: "non indirizziamolo ora, ci pensiamo domani"): dopo l'approvazione manager, il giorno e la durata dell'evento non compaiono correttamente nella sezione Presenze della dashboard. Root cause non ancora indagata — nelle sessioni precedenti la corretta integrazione ore/buoni pasto era stata verificata solo via API/curl, mai la resa effettiva in UI.

**Stato:** Feature Eventi/Training ✅ LIVE su `main` (deploy backend/web in produzione da confermare separatamente — non eseguito in questa sessione) + ✅ LIVE su TestFlight (build 37, mobile). **Da fixare domani**: bug di visualizzazione presenze post-approvazione.

---

## Session 105 — Test manuale Campi Nuovo Dipendente, 3 bug fixati, regola "manager obbligatorio", merge su `main` (18-19 Agosto 2026)

### Contesto
Continuazione diretta di Session 104 (piano Campi Nuovo Dipendente completato 15/15 task, non ancora mergeato). L'utente ha chiesto un piano di test manuale prima del merge.

### Verifica proattiva prima di far testare l'utente
Invece di consegnare solo la checklist, ho eseguito io stesso ogni sezione via `curl`/API contro backend+DB locali reali, trovando 2 bug prima ancora che l'utente iniziasse:

1. **Creazione Manager sempre fallita, bug pre-esistente su `main`** (non introdotto da Session 104): `AdminEmployeeSchema.assigned_sites` aveva un vincolo `.min(1)` di campo che scattava prima del `.refine()` condizionato dal ruolo, pensato per esentare i manager — quel refine era codice morto, un manager non ha mai potuto essere creato da "Nuovo Dipendente". Fix mirato: rimosso il vincolo di campo, lasciato solo il refine (stesso pattern già corretto).

2. **Bug di timezone**: sia il guard `EMPLOYMENT_NOT_STARTED` sul check-in sia i default `hiring_date`/`exit_date` del wizard xlsx calcolavano "oggi" con `new Date().toISOString().slice(0,10)` (UTC), mentre `hiring_date` è una data di calendario italiana scelta da un date picker o da un file caricato. Nella finestra mezzanotte–2am ora locale (CET/CEST) — quando la data UTC è ancora "ieri" — un dipendente assunto "oggi" veniva bloccato dal check-in. **Riprodotto dal vivo** (00:17 CEST) e fixato con un helper condiviso `todayInTimeZone()`/`dateInTimeZone()` (Europe/Rome), applicato ai 3 punti coinvolti più ai fixture di test che condividevano lo stesso calcolo UTC (altrimenti sarebbero rimasti intermittenti nella stessa finestra oraria).

### Bug trovati dall'utente in UI
Dopo i due fix sopra, l'utente ha testato in UI e trovato altri due problemi:
- **Ambientale, non di codice**: i server dev locali (backend 3000, frontend 5173) giravano da metà luglio dalla cartella **principale** del repo, non dal worktree — per questo i nuovi campi non comparivano. Nessun modo di scoprirlo dal codice; risolto killando quei processi e riavviandoli dal worktree.
- **Dropdown Manager non si aggiornava senza hard refresh**: in `EmployeesTab.jsx`, la lista `allEmployees` (fonte del dropdown "Manager di riferimento") era un `useFetch` mai ricaricato dopo create/delete, a differenza della tabella dipendenti sottostante. Fix: aggiunto `reloadAllEmployees()` dopo ogni create/delete.

### Nuova regola di business — "manager obbligatorio", via `/grilling`
Testando, l'utente ha scoperto che un dipendente poteva essere creato con successo su una sede **nuova**, ancora senza alcun manager — giudicato scorretto: un dipendente non dovrebbe poter esistere senza un manager di riferimento. Sessione `/grilling` dedicata (5 domande chiuse, una alla volta, con raccomandazione esplicita per ognuna) ha fissato lo scope prima di toccare codice:
- Regola universale ma **solo per i nuovi inserimenti** — nessuna retroattività sui dati storici già in produzione (es. "Roma Store", che oggi non ha un manager).
- Applicata anche al **wizard xlsx**, non solo al form singolo, ma solo alle righe classificate "nuovi" — le righe "modificati"/"riattivati" di dipendenti già esistenti restano invariate.
- Meccanica: `manager_id` passa da opzionale a **obbligatorio** quando `role === 'employee'`, riusando lo stesso pattern refine condizionato dal ruolo già corretto per `assigned_sites` nello stesso branch.
- **Disattivare l'ultimo manager di una sede con dipendenti attivi**: esplicitamente giudicato fuori scope per questa sessione (toccherebbe un flusso diverso, `DELETE /admin/employees/:id`) — rimandato come possibile miglioramento futuro.

Implementato su tutti e 3 gli strati (schema Zod, `computeDiff.js` del wizard con guardia anti-doppio-errore quando `resolveManagerId` ha già segnalato un mismatch di sede, UI con campo obbligatorio/bottone disabilitato/helper text). Circa 10 test esistenti in file diversi assumevano un manager opzionale ed è stato necessario aggiornarli — scoperto rilanciando la suite completa dopo ogni round di fix, non correggendo un file alla volta assumendo che bastasse.

### Verifica finale
`/code-review:code-review` adattato a un commit locale senza PR GitHub (5 agenti paralleli dispatchati sul diff via `git show` invece che su una PR, risultati riportati direttamente invece che commentati su GitHub) — CLAUDE.md compliance ok, nessun bug, nessuna regressione rispetto allo storico del branch, nessun test indebolito per far passare la suite; **1 solo finding reale**, un commento (`resolveManagerId` in `computeDiff.js`) diventato impreciso dopo il cambio — corretto immediatamente. `/test-all`: backend 107/108 suite (800/814 test), frontend 37/37 file (309/310 test), entrambi verdi.

**Stato:** `worktree-new-employee-fields` mergeato su `main` (fast-forward `00809b2`→`f0d3072`), worktree e branch rimossi. Migration `040` (`manager_id`) applicata in produzione via SSH su EC2 prima del push, per rispettare l'ordine deploy-dopo-migration (`deploy-to-ec2.yml` non esegue migration automaticamente, solo pull immagine + restart container).

### Push e deploy in produzione

Primo push (`f0d3072`) fallito su entrambi `CI/CD Pipeline` e `Build & Push Backend to ECR`, allo stesso passo lint: `backend/src/routes/admin/employees.js:54` — `Strings must use singlequote quotes` su un template literal a riga singola senza interpolazione (la query di lookup del manager). Bug reale e pre-esistente al lavoro di questa sessione, mai emerso prima perché questo branch aveva ~35 commit accumulati localmente senza mai passare da CI, e `/test-all` non include il lint. Diagnosticato leggendo `gh run view --log-failed` di entrambi i workflow (stessa causa identica), fixato riformattando la query su più righe (stessa convenzione già usata altrove nel file), verificato con `npm run lint` locale (0 errori), committato (`1695de4`) e ripushato.

Secondo giro: `CI/CD Pipeline` ✅, `Build & Push Backend to ECR` ✅, `Deploy to EC2` ✅ — tutti verdi. Verifica diretta in produzione dopo il deploy: `curl https://api.dataxiom.it/health` → `{"status":"ok","database":"connected","db_query_time_ms":3}`, `curl -o /dev/null -w "%{http_code}" https://badge.dataxiom.it/` → `200`. La feature "Campi Nuovo Dipendente" (incluso il vincolo `manager_id` obbligatorio) è interamente live.

---

## Session 103 — Awareness LinkedIn + budget tattico primo cliente + design/piano lista contatti verificata, non eseguito (11-15 Agosto 2026)

### Contesto
Continuazione diretta di Session 102 (piano documento di contesto marketing chiuso, Task 2-6/6). L'utente ha chiesto quali altre attività operative di awareness perseguire oltre il cold outreach, poi ha posto una domanda strategica più ampia: come allocare €3000 di budget marketing per acquisire il primo cliente pilota.

### Parte 1 — Awareness LinkedIn e correzione del "Claude Cowork"

Proposte iniziali (LinkedIn, community marketing, lead magnet) — gli ultimi due segnalati come bloccati dall'assenza di una landing page pubblica, un'assunzione rivelatasi **sbagliata** più avanti nella sessione (vedi Parte 2). L'utente ha chiesto di verificare un "Claude Cowork" che genera già contenuti LinkedIn per Dataxiom — investigazione ha rivelato che è una **routine cloud schedulata** (tool `RemoteTrigger`, skill `schedule`), non un prodotto separato.

Ho commesso un errore diretto in questa sessione: un primo `WebFetch` sulla pagina company LinkedIn (senza login) ha restituito un riepilogo dettagliato di 4 post — **completamente allucinato**, non contenuto reale (verificato con un `curl` grezzo: la pagina senza login restituisce solo un redirect anti-bot con JS offuscato, nessun contenuto). Errore riconosciuto esplicitamente all'utente, corretto chiedendo il testo reale dei post incollato a mano.

Sui post reali incollati dall'utente (filone BI/Analytics generico, non Badge System): **verificate 2 statistiche citate "con fonte"** (46% PMI Excel/ERP da webeconomico.it, 80% tempo pulizia dati da bnova.it) — **nessuna delle due fonti conteneva effettivamente il numero citato** (verificato con `WebFetch` mirato su ciascuna fonte). Pattern 2/2, giudicato sufficiente dall'utente senza verificare le altre 2 fonti. Scritta un'istruzione correttiva esplicita (procedura: citare solo statistiche verificate testualmente nella fonte) — **da incollare manualmente dall'utente nella routine su claude.ai, non ancora fatto**.

`docs/marketing/linkedin-content-plan.md` creato (3 pillar: educational compliance/time-theft, behind-the-scenes, personale/POV — coerenti col vincolo di onestà zero-clienti-reali) e committato (`2176f94`). Scoperto che il Cowork produce già ~1 post/settimana sul filone BI/Analytics — cadenza rivista per **alternare** settimane pari/dispari tra i due filoni invece di sommarsi a 2 post/settimana (commit `c8ae48e`).

Creata una nuova routine cloud `badge-system-linkedin-content` (skill `schedule`, id `trig_01QDj3iyHhTLg6zjzsiopRom`) via `RemoteTrigger`: gira ogni lunedì, calcola la settimana ISO e produce una bozza solo nelle settimane pari (Badge System), skip nelle dispari (riservate al Cowork BI/Analytics). Primo tentativo di creazione bloccato da `401` (GitHub non collegato all'account claude.ai per le routine) — risolto dall'utente collegando la GitHub App. Test manuale (`RemoteTrigger action:"run"`) eseguito: nessun commit prodotto nel repo dopo l'attesa — **verificato che è il comportamento corretto** (oggi è la settimana ISO 33, dispari) calcolando `date -u +%V` in locale, non un errore della routine. **Il primo run con generazione reale di una bozza (settimana 34, 17/8) resta da verificare** in una sessione futura.

### Parte 2 — Budget tattico €3000 → €1500 per il primo cliente pilota

Su richiesta esplicita, catena di skill `/superpowers:brainstorming` → `marketing-ideas` → `marketing-plan` → `product-marketing`. **Giudizio esplicito sulla skill `marketing-plan`**: è tarata per un piano fCMO a 12 mesi (8-12k parole, AARRR completo, sezioni retention/referral/revenue) — con zero ricavi e un obiettivo bounded a 4 settimane, la sua stessa documentazione sconsiglia l'uso per un compito tattico a canale singolo. Usata come lente concettuale (AARRR/budget-planning), non eseguito il template completo a 13 sezioni — segnalato esplicitamente all'utente prima di procedere, per non produrre un documento sproporzionato pieno di sezioni "N/A pre-revenue".

Tre approcci proposti (A: outbound puro, B: ads come motore, C: ibrido outbound+ads mirati sugli stessi account) — **raccomandato e scelto C**, motivato dal fatto che un acquisto B2B che tocca compliance/dati biometrici raramente si chiude da un click pubblicitario freddo in 4 settimane senza landing page né case study.

**Verifica diretta, non assunta, di due fatti prima di finalizzare il piano** — entrambi hanno corretto assunzioni sbagliate fatte in precedenza nella sessione:
1. L'utente ha chiesto "la landing page dataxiom.it non è sufficiente?" — verificato con `WebFetch` + `curl` grezzo (dato il precedente errore di allucinazione LinkedIn, non ci si è fidati del solo `WebFetch`): **`dataxiom.it/badge-system` esiste davvero**, con hero, positioning privacy solido, e una **demo self-serve attiva su `badge.dataxiom.it`** — asset di vendita concreto non presente nel contesto marketing esistente. La riga di budget "pagina pubblica minima" (~€300-500) è stata rimossa dal piano.
2. La stessa pagina menziona un **export tracciati paghe compatibile Zucchetti/TeamSystem** — non presente in `.agents/product-marketing.md`, che anzi (ereditando da `CLAUDE.md`) dichiara l'integrazione payroll "Fase 2, fuori scope MVP". **Confermato dall'utente** come feature reale e funzionante, non pianificata. Aggiunto come differenziatore reale in `.agents/product-marketing.md` v3, con una nota esplicita di disallineamento verso `CLAUDE.md` — **non ancora corretto in `CLAUDE.md` stesso**, resta un gap aperto tra sito pubblico e documentazione interna.

`.agents/product-marketing.md` aggiornato v2→v3 con questi due fatti (changelog aggiornato). Piano tattico finale (`docs/marketing/piano-tattico-3000-primo-cliente.md`, commit `72b2d32`): allocazione €3000 con lista contatti verificata/Sales Navigator/tool sequencing/ads mirati/incentivo pilota, timeline 4-5 settimane, criteri di successo/kill espliciti. **Scenario dimezzato €1500** prodotto su richiesta successiva: tagliati per primi gli ads (€700→€0, supporto non motore), non la lista contatti (collo di bottiglia reale, ridotta solo in scope 900€→600€) — riserva incentivo pilota ridotta ma non azzerata (leva di chiusura, non solo di scoperta).

### Parte 3 — Lista contatti verificata: design + piano, esplicitamente non eseguiti

Sotto-progetto della voce di budget "lista contatti" (€600 nello scenario €1500). Ciclo completo `/superpowers:brainstorming`: esplorato contesto, chiarito con l'utente (costruzione fai-da-te con Sales Navigator, nessuna banca dati camerale disponibile, 5-8h/settimana disponibili), proposti 3 approcci (sequenziale, a batch/rolling, scope ridotto) — **scelto approccio a batch/rolling** su mia raccomandazione, per non bloccare l'intero piano sul completamento della lista.

**Analisi critica richiesta esplicitamente dall'utente** prima di scrivere lo spec ha trovato 8 problemi reali, tutti integrati nel design prima della scrittura:
1. **Il design ignorava le relazioni Dataxiom esistenti** (clienti BI/Analytics) — potenzialmente più efficace di qualunque contatto freddo, aggiunto come "Passo 0" prioritario
2. Timeline "25-30 contatti in 3-4 giorni" matematicamente irrealistica per 5-8h/settimana partendo da zero (10-20 min/contatto realistici) — ridimensionato a 10-15/batch
3. Le 5-8h/settimana competono con l'intero monte ore di progetto (10h/settimana, `CLAUDE.md`) — reso esplicito, non più implicito
4. Limiti InMail di Sales Navigator (~50/mese) non considerati — aggiunto fallback connessione+messaggio
5. Criterio di kill "5% su un campione di 25-30" troppo rumoroso (1-2 risposte decidono tutto) — spostata la valutazione a batch 1+2 combinati
6. Nessun backup del CSV (giustamente escluso da git per GDPR, ma zero backup) — aggiunta copia su cloud privato
7. Nessuno stato di outreach tracciato nel CSV — aggiunte colonne canale/data contatto/risposta/esito
8. Targeting "retail" generico — aggiunta priorità esplicita a GDO/supermercati (pain-fit più alto sul buddy punching)

Spec finale committata (`docs/superpowers/specs/2026-08-13-verified-contact-list-design.md`, commit `1e83fb0`). Piano di implementazione (10 task: scaffolding, Passo 0, sourcing/verifica/outreach batch 1, batch 2 in parallelo, valutazione kill combinata, batch 3+ condizionale, backup) scritto via `/superpowers:writing-plans` e committato (`docs/superpowers/plans/2026-08-15-verified-contact-list.md`, commit `33222cb`) — **esplicitamente non eseguito**, su istruzione diretta dell'utente ("lo scriviamo, lo committiamo e lo teniamo lì").

### Stato a fine sessione

Nessun contatto reale ancora costruito, nessuna routine LinkedIn Badge System ancora testata con generazione reale di contenuto, nessuna correzione ancora incollata nel Cowork esistente, nessuna correzione ancora applicata a `CLAUDE.md` sul disallineamento payroll. Tutto il lavoro è documentale/pianificazione, pronto per esecuzione in una sessione futura.

---

## Session 101 — Plugin marketing-skills installato + design/piano documento di contesto marketing (Task 1/6 eseguito, sessione sospesa per restart VS Code) (11 Agosto 2026)

### Contesto
Continuazione diretta di Session 100. Con S.24 e la firma digitale cartellino chiusi, l'utente ha chiesto una valutazione di cosa manca per un MVP "solido e vendibile" — la risposta ha identificato che il collo di bottiglia più grande non è più codice ma validazione di mercato: pricing/posizionamento mai testati con un prospect reale. L'utente ha spostato l'attenzione su marketing: ricerca di skill Claude Code per una campagna marketing, poi costruzione del documento di contesto marketing fondativo (`product-marketing`).

### Parte 1 — Ricerca skill marketing e installazione

Ricerca comparativa richiesta esplicitamente con verifica **dati reali via GitHub API**, non fidandosi dei riassunti di ricerca web (che hanno riportato star count palesemente gonfiati per alcuni mega-repo di liste curate). Confrontati 8 repository, scelto **`coreyhaines31/marketingskills`** (43.864★ verificate via `gh api`, 49 skill: positioning, pricing, cold-email, sales-enablement, competitor-profiling, copy, SEO, ads — copre l'intero funnel B2B SaaS) su `OpenClaudia/openclaudia-skills` (75 skill ma richiede credenziali API a pagamento SEMrush/Ahrefs, prematuro senza budget marketing) e `alirezarezvani/claude-skills` (24.268★ ma marketing è solo una categoria tra 345 skill generaliste, troppo diluito). Installato via `/plugin marketplace add` + `/plugin install marketing-skills` — stesso pattern già usato per `superpowers`, scope `user` (disponibile in tutte le sessioni, non solo questo progetto).

### Parte 2 — Design e piano per il documento di contesto marketing

Via `/superpowers:brainstorming` + `/grilling`: scoperto che questo repo ha già uno **spec di positioning/pricing approvato** (`docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md`, analisi competitiva reale su 5 player — NoBadge, Zucchetti/TeamSystem, Factorial, Personio, Deputy — pricing a scaglioni €8/7/6,50, messaging commerciale) — questo ha cambiato l'approccio da "auto-draft generico dal codebase" (inutile per un tool interno senza landing page pubblica) a **auto-draft pilotato esplicitamente su quello spec + `CLAUDE.md`**.

Due round di analisi critica richiesti esplicitamente dall'utente prima di scrivere la spec, entrambi hanno esteso lo scope in modo mirato:
1. **"verifica se possiamo migliorare l'attuale positioning/pricing"** → aggiunta una verifica di seconda mano con le skill dedicate appena installate (`competitor-profiling`, `pricing`), non solo il ragionamento manuale già fatto il 26/7 — con vincolo esplicito che un eventuale scostamento trovato produce solo una **proposta di revisione** dello spec approvato (sezione aggiuntiva "Revisione [data]"), mai una sovrascrittura silenziosa delle conclusioni già prese.
2. **"verifica se possiamo implementare qualcos'altro prima di scrivere la spec"** → osservazione critica: nessuna delle fasi pianificate produceva un artefatto *prospect-facing* — solo documentazione interna — nonostante la priorità già stabilita fosse "andare a validare con un prospect reale". Aggiunta una Fase 5 (`sales-enablement` per un one-pager, `cold-email` per un template di outreach generico, dato che non esiste ancora un prospect nominato).

**Spec** (`docs/superpowers/specs/2026-08-11-product-marketing-context-design.md`) e **piano** (`docs/superpowers/plans/2026-08-11-product-marketing-context-plan.md`, 6 task) scritti e committati direttamente su `main` (lavoro documentale, nessun rischio di regressione a un sistema in produzione — deciso esplicitamente nel piano).

### Parte 3 — Esecuzione Subagent-Driven, Task 1 completato

L'utente ha scelto **Subagent-Driven** nonostante la mia raccomandazione per l'esecuzione inline (motivata dal fatto che ogni fase del piano richiede revisione umana del *contenuto*, non solo compliance di spec/qualità automatica — tensione nota ma non bloccante, gestita facendo io da controller la revisione di merito tra un task subagent e l'altro).

**Task 1** (bozza v1 `.agents/product-marketing.md`) dispatchato a un subagent generico. **Scoperta di processo**: il subagent ha riportato che il tool Skill non riconosceva `product-marketing` come skill invocabile nel suo contesto isolato, nonostante il plugin fosse installato su disco — ha letto `SKILL.md` manualmente e ne ha replicato il workflow a mano. **Causa identificata dall'utente**: la scoperta di nuove skill installate richiede un **riavvio di Visual Studio Code** — il plugin era stato installato a metà di questa sessione, quindi nessuna sotto-sessione (incluse quelle dei subagent) lo vedeva ancora nell'elenco skill caricato.

Contenuto comunque verificato di buona qualità tramite compliance-check manuale (fatto da me, con lo spec completo in contesto, invece di dispatchare un secondo subagent reviewer per un semplice documento): ogni sezione traccia a una fonte o è marcata esplicitamente "non validato — zero clienti reali", pricing riprodotto esatto senza arrotondamenti, path/versione/changelog conformi. Il subagent ha aggiunto di iniziativa una sezione "Rischi noti sul posizionamento" non prevista dal template standard — estensione trasparente e ragionevole, non un'invenzione. Commit `9e12778`.

### Stato a fine sessione

**Sessione sospesa qui su richiesta esplicita dell'utente**, in attesa del riavvio di VS Code necessario perché la skill `product-marketing` (e le altre 4 del piano: `competitor-profiling`, `pricing`, `sales-enablement`, `cold-email`) diventino invocabili correttamente nei prossimi task. Restano da eseguire i Task 2-6 del piano (verifica competitor fresca, stress-test pricing, sintesi in v2 + eventuale proposta di revisione allo spec 26/7, one-pager + email di outreach, chiusura). Todo list della sessione preservata con Task 1 completato, Task 2-6 pending.

---

## Session 100 — S.24 chiuso (privacy policy pubblica) + Firma digitale cartellino mensile in produzione (11 Agosto 2026)

### Contesto
Continuazione diretta di Session 99. Due lavori distinti, entrambi via ciclo completo brainstorming→spec→plan→esecuzione: chiudere l'ultimo sotto-task di S.24 (pagina pubblica privacy policy GPS) e implementare "Firma digitale cartellino mensile" (backlog Session 57, "Medio impatto, Basso-Medio sforzo").

### Parte 1 — S.24: pagina pubblica privacy policy GPS

**Scoperta durante il brainstorming, prima di scrivere codice**: `docs/privacy-policy-IT.md` (contenuto sorgente da pubblicare) era scritto per il comportamento GPS *pre-Fase-C* — diceva più volte che il dipendente poteva rifiutare il geofencing e continuare a timbrare senza GPS ("check-in senza GPS, se facoltativo"), un diritto che il sistema non concede più da quando Fase C ha reso il GPS obbligatorio su sedi con verifica attiva. Pubblicare il testo così com'era avrebbe dichiarato pubblicamente un diritto inesistente — peggio che non pubblicare affatto. Corrette 4 sezioni (poi 6 — il subagent che ha implementato la correzione ha trovato, nella propria verifica finale, 2 occorrenze aggiuntive non coperte dagli step espliciti del piano, corrette sul posto): diritto di revoca consenso aggiunto (reale, endpoint `/consent/gps-revoke` di Fase C), meccanismo di Accesso Art. 15 corretto da "self-service API/CSV" (verificato in codice: le coordinate GPS non sono mai esposte da nessun endpoint) a richiesta manuale, Sentry aggiunto ai sub-processori, un dettaglio minore corretto ("cron via AWS Lambda" → il meccanismo reale è un cron sul server EC2).

**Analisi critica richiesta esplicitamente contro fonti GDPR verificate online** (non solo lettura del codice) prima della pubblicazione ha trovato 3 gap più profondi, deliberatamente lasciati fuori scope della pagina e registrati come nuovo backlog GDPR con citazioni verificate:
- **S.27** — la base giuridica del consenso GPS è probabilmente invalida: **EDPB Guidelines 05/2020 on consent, §21-22 ca.** stabilisce che il consenso in un rapporto di lavoro non è "liberamente prestato" quando il rifiuto ha conseguenze negative — esattamente lo scenario introdotto da Fase C (rifiuto → check-in bloccato). Servirebbe Art. 6(1)(b) o 6(1)(f) invece di Art. 7.
- **S.28** — Statuto dei Lavoratori Art. 4 (L. 300/1970): uno strumento di geolocalizzazione dipendenti richiede accordo sindacale o autorizzazione ITL **prima** dell'attivazione, obbligo del cliente non comunicato in nessun punto dell'onboarding. Confermato da un caso reale: **Garante Privacy, Provvedimento n. 7 del 16 gennaio 2025** (sanzione per geolocalizzazione difforme da autorizzazione ITL). Nota positiva: il nostro sistema cattura GPS solo al momento del check-in, mai in background — già allineato alla mitigazione che il Garante richiede in questi casi.
- **S.29** — DPIA (Art. 35 GDPR) mai eseguita, ma **esplicitamente obbligatoria**, non "probabile": **Delibera Garante Privacy n. 467/2018** (elenco vincolante dei trattamenti soggetti a DPIA) include testualmente la geolocalizzazione dipendenti che consente controllo a distanza. Obbligo del Titolare (cliente), ma probabilmente serve un template DPIA precompilato da Dataxiom, stesso pattern del DPA (S.25).

**Pubblicazione**: `frontend-web/public/privacy-policy-it.html` (stesso pattern CSS/struttura di `dpa-template-it.html`, senza le sezioni firma/parti — non è un documento bilaterale), redirect `_redirects`. **Un controllo post-deploy ha inizialmente mostrato la SPA invece della pagina statica** — non un bug della regola di redirect (identica a quella, già funzionante, del DPA) ma una cache Netlify Edge che aveva memorizzato una risposta "not found→SPA" per quel path specifico, mai richiesto prima d'ora. Confermato con richieste cache-bypass (contenuto corretto immediato), poi riverificato che l'URL esatto senza trucchi risolvesse correttamente — nessuna azione correttiva necessaria, solo propagazione cache.

### Parte 2 — Firma digitale cartellino mensile

**Fatto strutturale scoperto esplorando il codice prima del design**: il dipendente non aveva **nessuna pagina web** dove vedere il proprio riepilogo ore mensile — `GET /presences/summary` vieta esplicitamente il ruolo `employee` (`ForbiddenError`), e comunque mostra la tabella aggregata di tutti i dipendenti di una sede, non un cartellino individuale. La feature ha dovuto costruire quella vista mancante, non solo aggiungere una firma a qualcosa che già esisteva.

**Decisioni di scope** (via `AskUserQuestion`): firma come click-to-accept con audit trail, non firma grafica disegnata (nessun valore legale aggiuntivo, molta più complessità); solo web dashboard, non mobile (il dipendente ha già accesso al dashboard web per ferie/malattia); correzione di un check-in su un mese già firmato invalida automaticamente la firma (snapshot immutabile + stato `invalidated`, non blocco rigido delle correzioni né firma-indipendente-dai-dati); vista admin/manager dello stato firma inclusa (estende `SummaryPage.jsx` esistente, non una pagina nuova).

**Analisi critica esplicita richiesta con `/senior-architect` + verifica manuale contro il codice** (le skill `/senior-fullstack`/`/senior-backend` invocate insieme sono risultate non pertinenti — tarate per grilling di scaffolding greenfield su stack non ancora deciso, non per una feature su uno stack già scelto e in produzione da mesi; applicato lo spirito critico direttamente) ha trovato 3 problemi nella bozza iniziale del design, tutti incorporati prima di scrivere la spec:
1. **Nessuna idempotenza** su `POST /timesheet/sign` — un doppio tap con una `INSERT` naive avrebbe creato righe duplicate o stato ambiguo. Fix: `UNIQUE (employee_id, month, year)` + `INSERT ... ON CONFLICT DO UPDATE`.
2. **Nessun blocco server-side sulla firma del mese corrente** — un client bugato/malevolo avrebbe potuto firmare un mese ancora in corso, con uno snapshot necessariamente incompleto. Fix: guard esplicito in `POST /timesheet/sign` (400 `CANNOT_SIGN_CURRENT_MONTH`), non solo un bottone disabilitato lato UI.
3. **Il punto più sottile**: l'invalidazione della firma era pensata solo per le correzioni di check-in (`PUT /checkins/:id`), ma `validation.js` accetta `occurred_at` fino a **48 ore nel passato** per il sync offline (`POST /checkins`, non `PUT`) — un check-in offline dell'ultimo giorno del mese appena firmato, sincronizzato 1-2 giorni dopo, non avrebbe mai invalidato la firma con un hook posizionato solo sulla correzione. Fix: funzione condivisa `invalidateSignatureIfExists()`, richiamata da **entrambi** i path che scrivono un `checkin.timestamp` (creazione e correzione), non due logiche duplicate.

**Decisione esplicita da preservare**: lo snapshot delle ore al momento della firma non viene mai ricalcolato retroattivamente, nemmeno se `utils/hours.js` cambia logica in futuro — una firma deve rappresentare esattamente cosa il dipendente ha visto e approvato, altrimenti perde valore probatorio.

**Esecuzione** (`/superpowers:executing-plans`, inline in sessione su richiesta esplicita, non subagent-driven questa volta): 10 task TDD, tutti verdi al primo giro tranne un bug ambientale reale scoperto durante il Task 3 — `checkins-active-employee.test.js` e `checkins-assigned-sites-backfill.test.js` sono integration test contro un DB Postgres reale (non mockato), e la migration 039 (`timesheet_signatures`) era stata applicata solo al DB `development`, non al DB `test` — `relation "timesheet_signatures" does not exist`. Fix: applicata la migration anche al DB test prima di proseguire, non uno sviluppo comportamentale del codice applicativo.

**File nuovi**: `backend/migrations/039_add_timesheet_signatures.sql`, `backend/src/utils/timesheetSignature.js`, `backend/src/routes/timesheet.js`, `frontend-web/src/pages/MySummaryPage.jsx` (+ test relativi). **Modificati**: `backend/src/routes/checkins.js` (hook invalidazione su create+correct), `backend/src/routes/presences.js` (`GET /my-summary` nuovo, colonna firma su `GET /summary`), `backend/src/middleware/validation.js`, `backend/src/app.js`, `frontend-web/src/App.jsx`, `frontend-web/src/pages/SummaryPage.jsx`.

### Risultato
Backend 750/750 test, frontend-web 299/299, 0 errori lint (backend — frontend-web lint resta senza config ESLint, gap infrastrutturale preesistente non introdotto qui). Push su `main`, CI a cascata verde (`CI/CD Pipeline` → `Build & Push Backend to ECR` → `Deploy to EC2`), endpoint verificati live in produzione (401 su entrambi i nuovi endpoint senza auth, non 404 — le migration girano automaticamente e fail-fast all'avvio del container, quindi il deploy riuscito conferma anche la migration 039 applicata in produzione). Chiude S.24 e il primo item del Gruppo 2+ del backlog post-Fase-C (firma digitale). Backlog GDPR S.27/S.28/S.29 aperto per una futura sessione dedicata con `/grilling`, prima che un cliente reale attivi il geofencing.

---

## 📦 Sessioni precedenti e documento di architettura originale — archiviati

Le sessioni 62-99, più il documento di architettura/planning originale del progetto (Project Overview, Tech Stack, Fasi di Sviluppo, Decision Points, Risk Register, ecc.), sono stati spostati in [`docs/history/PROJECT_DECISIONS_ARCHIVE_62-99.md`](docs/history/PROJECT_DECISIONS_ARCHIVE_62-99.md) per ridurre la dimensione di questo file (2026-09-12). Nessuna informazione persa, solo rilocata.
