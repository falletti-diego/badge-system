# Badge System — Task Tracker

**Target:** MVP Lancio Settembre 2026 · 10h/week · ~150 ore totali  
**Last Updated:** 2026-07-14 (Session 63: hotfix Session 62 mergiato su main + verificato live in produzione, poi assorbito nel branch demo self-service — **Task 3/9 (`POST /demo/start`) completato e chiuso**)  
**Production:** https://badge.dataxiom.it · API: https://api.dataxiom.it

---

## 📋 Session Log

| Sessione | Data | Sintesi |
|---|---|---|
| 63 | 2026-07-14 | **✅ Hotfix Session 62 mergiato + verificato in produzione, poi assorbito nel branch demo self-service — Task 3/9 chiuso** — Merge/PR (`#2`, commit `e2d1380`) dell'hotfix `POST /auth/refresh` su `main`, deploy CI/CD automatico verificato. **Verifica live in produzione**: login + primo refresh con un account cliente reale (`maria.rossi@torino.it`, password resettata via endpoint admin per il test) → **200** (prima 401), poi replay del token già consumato → **401 SESSION_REVOKED** corretto, confermando che il fix per la collisione id con `DEMO_USERS` funziona anche in produzione nonostante l'id di Maria coincida con la fixture `maria@badge.local`. **Nota FYI, fuori scope**: il token rinnovato di Maria porta ancora l'identità della fixture demo (branch `demoUser` id-based nella costruzione del payload, non toccato da questo hotfix) — bug pre-esistente indipendente, da un ticket separato. Rientrati poi nel worktree `demo-self-service` per riprendere il **Task 3/9** in pausa dalla Session 61: trovato che `main` locale era stale (mancava il merge del PR, serviva `git fetch` + merge di `origin/main`, non solo `main`) — mergiato correttamente, portando il fix di `auth.js` nel branch demo. Questo era un gap reale: `POST /demo/start` emette un `refresh_token` (implementato prima di questa sessione, commit `9474913`) che passa dallo stesso `/auth/refresh` bacato — senza il merge, il primo refresh di ogni sessione demo avrebbe fallito allo stesso modo. Un-skippato il test che documentava esattamente questo (`demo-start.test.js`, `it.skip('BLOCKED (pre-existing auth.js bug...')`), verificato GREEN (7/7 in quel file). Rivisti tutti i checkpoint di sicurezza del piano per il Task 3 (`docs/superpowers/plans` via `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md`): rate-limit 4° tentativo bloccato, tetto `MAX_ACTIVE_DEMOS` con boundary esatto, i 3 percorsi email-duplicata (resume attiva, riavvio-contatore-in-grazia via cap-bypass, rifiuto cliente reale), race condition su richieste parallele, nessun campo iniettabile oltre `email`, audit log su creazione/resume, scoping del `23505` alla sola constraint `clients_email_key` — tutti già coperti da test reali su Postgres locale, nessun gap trovato. Suite backend completa: 522/536 verdi, 14 skip noti, 0 falliti. **Task 3/9 chiuso.** Prossimo: Task 4/9 (`POST /demo/switch-role`). |
| 62 | 2026-07-14 | **🔴 HOTFIX (pronto, non ancora mergiato) — `POST /auth/refresh` rifiutava il primo refresh di ogni cliente reale** — Bug di produzione scoperto per caso durante il Task 3/9 della Session 61 (testando il refresh_token della demo self-service). Causa: due commit già su `main` avevano lasciato la logica anti-replay incoerente — `907a6fb` (12/6) aveva rimosso l'INSERT del `jti` al login per sbloccare il primo refresh, ma `6abb03f` (14/6, poche ore dopo) lo aveva reintrodotto per chiudere una race condition sul primo utilizzo di un token, **senza invertire la logica del controllo**: il codice continuava a trattare "jti trovato in `used_tokens`" come prova di replay, mentre col nuovo design significa "token corrente valido, non ancora consumato". Risultato: il primo refresh di **ogni cliente reale** (non-`@badge.local`) falliva con `401 SESSION_REVOKED`, 100% riproducibile, invisibile nei test perché l'unico test end-to-end del flusso usa solo account demo (che saltano il tracking jti). Pianificato con `/superpowers:writing-plans` (piano: `docs/superpowers/plans/2026-07-14-refresh-replay-detection-hotfix.md`), eseguito in **worktree isolato dedicato `.claude/worktrees/hotfix-refresh-replay-detection`** (branch `worktree-hotfix-refresh-replay-detection`, base `main` — **non** il branch demo self-service, per poter shippare indipendentemente) con `/superpowers:test-driven-development` diretto (non subagent-driven): test di regressione reale su Postgres verificato RED (401 invece di 200) poi fix (inversione semantica trovato/non-trovato + esenzione sessioni `@badge.local`) verificato GREEN, poi corretti i test mockati preesistenti (`auth-refresh-race.test.js`, `auth-refresh-concurrent-stress.test.js`) che codificavano la vecchia semantica sbagliata. **Code review approfondita** (`/code-review`, 6 agenti in parallelo su altrettanti angoli) ha trovato **2 regressioni reali nella fix stessa**, entrambe verificate col codice reale e poi corrette con lo stesso ciclo TDD: (1) l'esenzione `!demoUser` identificava le sessioni demo cercando l'id in `DEMO_USERS` — ma `maria.rossi@torino.it` (dipendente reale, login via DB) condivide intenzionalmente l'id con la fixture `maria@badge.local` (migration 022), quindi la sua sessione reale veniva scambiata per demo e la protezione anti-replay disattivata silenziosamente sul suo account; fix: l'esenzione ora si basa sul dominio email nel payload del token (aggiunto `email` al refresh token emesso al login), non più su un id-lookup soggetto a collisioni. (2) il controllo anti-replay girava **prima** del controllo `revoked_tokens`: dopo una revoca amministrativa permanente (`POST /revoke-session`, che cancella le righe `used_tokens` dell'utente), il refresh residuo dell'utente revocato veniva classificato come "replay" invece che "sessione revocata", e l'`INSERT ... ON CONFLICT DO UPDATE` del ramo replay **declassava silenziosamente la revoca permanente a 5 minuti** — l'utente revocato riguadagnava accesso da solo dopo 5 minuti; fix: riordinato il controllo `revoked_tokens` prima del replay-check. Aggiunto anche un terzo touch-point mancante (INSERT finale del nuovo jti non esentato per sessioni demo → righe orfane accumulate in `used_tokens`). Suite finale: backend 492/506 verdi (14 skip noti, 0 falliti), lint pulito, 1 test frontend isolato eseguito per verificare la toolchain (8/8 verdi, hotfix è backend-only). Commits sul branch: `8c5f2fb`, `c8664af`, `2d31e85`, `ae92741`. **Prossimo step**: merge/PR su `main`, poi riprendere Task 3/9 della Ambiente Demo Self-Service (Session 61, `.claude/worktrees/demo-self-service`). |
| 61 | 2026-07-13 | **⏸️ IN CORSO (in pausa) — Ambiente Demo Self-Service: pianificazione + Task 1-2/9** — Su richiesta utente ("prossima feature a minimo sforzo/massima resa"), scelto "Ambiente demo self-service" dal backlog MVP Hardening (Session 57) sulle altre opzioni (PDF Riepilogo Ore, ecc.) per il maggior valore commerciale. Pianificato con `/superpowers:writing-plans` + `/grilling` (13 domande sequenziali: scope solo web/no mobile — TestFlight-only oggi, nessun canale pubblico Expo Go/Android reale —, pagina pubblica dentro badge.dataxiom.it, solo email richiesta, login automatico senza password, 7gg + 7gg di grazia, dataset fisso relativo a "oggi" non a un mese fisso, 3 ruoli via selettore in-app anziché 3 credenziali separate, tour guidato leggero, CTA+form contatto via nuova email AWS SES, rate-limit+tetto attive anziché CAPTCHA, EventBridge Scheduler per la pulizia, direzione visiva "vetrina" più audace dello stesso design system). **Autocritica del piano** (su richiesta esplicita utente, `/grilling` con se stesso): trovato un bug reale non gestito (email duplicata avrebbe violato `clients.email UNIQUE` — nessun path di errore pulito), corretto con 3 percorsi espliciti (resume demo attiva, riavvio contatore per demo scaduta-in-grazia, rifiuto per cliente reale) + difesa in profondità contro race condition; aggiunta vista admin `GET /api/admin/demo-tenants`, nota GDPR minimale, tetto demo abbassato a 20; aggiunti 13 test mirati a scenari di rottura concreti. Piano finale: `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md`. **Esecuzione**: worktree isolato `.claude/worktrees/demo-self-service` (branch `worktree-demo-self-service`), `subagent-driven-development` con pausa esplicita e via libera dell'utente dopo ogni task (non esecuzione continua di default) — Task 1/9 (migration `028`/`029`: campi demo su `clients` + tabella `demo_contact_requests`; review ha trovato un indice mancante su `(is_demo, demo_expires_at)`, corretto) e Task 2/9 (`demoSeed.js`, generazione dati parametrizzata; review ha trovato un design a doppia modalità Pool/Client superfluo e rischioso, semplificato ad un solo contratto) entrambi completati con implementer + 2 review (spec-compliance + code-quality) + fix loop, verificati anche con test reali su Postgres locale (non solo mock). Suite backend: 502/502 verdi (+14 test nuovi rispetto alla baseline Session 60). **Nota aperta per l'utente**: la pipeline CI GitHub Actions non ha un servizio Postgres reale, quindi i test DB-dipendenti (compresi quelli critici del Task 3, es. race condition su email duplicata) passano solo in locale, non in CI — decisione da prendere se aggiungere un servizio Postgres a CI prima del Task 3. **Nessun merge su main** — tutto il lavoro resta sul branch del worktree, non ancora toccato da main. **Da riprendere: Task 3/9** (`POST /demo/start`, l'endpoint pubblico più delicato del piano). |
| 60 | 2026-07-13 | **Dropdown Sede in Dashboard + dati demo maggio 2026 + fix CSV export** — Su richiesta utente, 3 interventi via `/grilling`. (1) **Dropdown Sede**: `FilterBar.jsx` — sostituito il campo testo libero con una select popolata da `GET /api/v1/sites` (RBAC già esistente riusato: admin vede "Tutte le sedi" + ogni sede, manager la vede disabilitata e pre-selezionata sulla propria). (2) **Dati demo maggio 2026** (produzione): verificato via SSH+psql che non esistessero già dati reali per quel periodo (zero check-in/ferie/malattie per i 3 account demo), poi creati 8 dipendenti fittizi con dominio riconoscibile `@demo-maggio.local` (4 Torino, 4 Milano), 310 check-in sui 21 giorni lavorativi di maggio con straordinari sparsi, 3 ferie approvate + 2 malattie per generare assenteismo realistico. Script salvati in `backend/scripts/seed-may-2026-demo.sql` + `cleanup-may-2026-demo.sql` (quest'ultimo pronto per la cancellazione mirata futura, nessun rischio per altri dati — cascade su checkins/illnesses/leave_requests). **Scoperta importante**: i Grafici Trend (feature Session 58) mostrano sempre gli ultimi 30 giorni fissi da oggi per design, quindi non mostreranno mai maggio — confermato con l'utente di lasciare il comportamento invariato; KPI Card e tabella presenze (che rispettano il filtro Da/A) restano il modo corretto per vedere il mese demo. (3) **Fix bug reale**: l'export CSV formato "generico" mostrava epoch millisecondi grezzi (es. `1777618800000`) invece di data/ora nelle colonne "Check-in Time"/"Last Modified" — causa: `csv-stringify` converte i `Date` object non gestiti in epoch ms quando manca un `cast.date` esplicito (i formati Zucchetti/TeamSystem non ne erano affetti perché già formattavano le date manualmente). Fix: aggiunto `cast.date` → `DD/MM/YYYY HH:MM`. Verificato: build frontend pulita, 191/192 test frontend, 488/502 backend (nessuna regressione), endpoint testato live in produzione via curl con token reale. Deploy: backend via CI/CD (2 push, entrambi verdi), frontend via `netlify deploy --prod`. Commits: `5cfbf52`, `0857cbc`. |
| 59 | 2026-07-12 | **Fix 2 fallimenti pre-esistenti in LeaveCalendar** — Su richiesta utente, indagati e risolti i 2 fallimenti frontend lasciati come baseline nota nelle Session 55-58. Causa reale (non solo di test): `LeaveCalendar.jsx` `handleDateClick` chiamava `stringToDate(endDate)` senza verificare che non fosse `null` — crash se un genitore passa `startDate` valorizzato con `endDate` ancora `null` (stato plausibile in uso reale). Fix: fallback `endDate ? stringToDate(endDate) : start`. Causa secondaria (solo test): mese hardcoded `'2026-06'` stale + asserzione `endDate: null` mai corretta (il componente imposta `endDate = clickedDateStr` al primo click, non null) — corretto calcolando il mese da `new Date()`. Verificato: 11/11 `LeaveCalendar`, 191/192 suite frontend completa (1 skip intenzionale, **zero fallimenti**), backend invariato (488/502), build pulita, pipeline CI verde. Commit: `0a04451`. |
| 58 | 2026-07-12 | **Grafici Trend Dashboard — implementati end-to-end, subagent-driven** — Piano dettagliato (`docs/superpowers/plans/2026-07-12-dashboard-trend-charts.md`, grilling completo: 4 metriche presenze/ore lavorate/straordinarie/assenteismo, assenteismo = ferie+malattia approvate / dipendenti attivi, finestra fissa 30gg, RBAC identico a `/presences/summary` — employee bloccato, manager auto-scoped, admin/viewer filtrabile). Eseguito con `subagent-driven-development` in un git worktree isolato (`.claude/worktrees/dashboard-trend-charts`): 7 task, ciascuno con implementer + spec-review + code-quality-review dedicati. Backend: `buildTrendDays()` (funzione pura, `trendStats.js`), `GetPresencesTrendSchema`, `GET /api/v1/presences/trend` (cast `::text` su colonne DATE per evitare il bug di shift di un giorno già noto da Session 55). Frontend: `useTrendData` hook, `TrendChart` (LineChart principale, con testo alternativo accessibile `role="img"` aggiunto dopo un finding di review), `MiniTrendCard` (riusabile x3: ore lavorate/straordinarie/assenteismo), wiring in `DashboardPage.jsx` con doppia difesa RBAC (hook `enabled=false` + sezione UI nascosta per employee). 2 round di fix durante le review (2 test RBAC mancanti su Task 3, 1 fix accessibilità su Task 5) — nessun finding Critical in nessuna review. Merge fast-forward su main, poi `/test-all` (backend 488/502 verdi, frontend 189/192 — 2 fail pre-esistenti non correlati in `LeaveCalendar.test.jsx`) e `/api-test` (12 fail dovuti a credenziali demo obsolete nello script, non regressioni reali). **Bug reale trovato dal deploy CI**: 2 errori ESLint `quotes: single` in `presences.js` (query SQL come template literal senza interpolazione, invece di stringa singola come da convenzione file) bloccavano il job di lint → pipeline fallita → deploy EC2 skippato. Fix immediato (commit `2373ea6`), pipeline riverificata verde, endpoint confermato raggiungibile e funzionante in produzione via curl reale. Commits: `ea58587`,`e1d516a`,`4fe3a65`,`46f5cd4`,`9dd4f20`,`2b42830`,`97756fe`,`45e169a`,`78a5751`,`2373ea6`. |
| 57 | 2026-07-12 | **Analisi critica MVP — feature mancanti e opportunità commerciali** — Su richiesta utente, analisi critica del codice reale (route backend, schermate mobile/web, backlog `TASKS.md`) via self-grilling per identificare: (1) feature core mancanti che rischiano l'adozione (notifiche push assenti — solo polling, offline mode mai iniziato nonostante il rischio "connettività retail instabile" dichiarato in `CLAUDE.md`, consenso GPS esplicito S.26 ancora non fatto mentre il geofencing è già attivabile in produzione, nessun cambio turno self-service tra dipendenti); (2) feature aggiuntive ad alto valore percepito (grafici trend in Dashboard — `recharts` installata ma mai usata, PDF export Riepilogo Ore oggi solo CSV, nessun alert anomalie/frodi oltre al geofencing, nessuna firma digitale di accettazione cartellino mensile); (3) supporti commerciali mancanti per scalare oltre i primi clienti pilota (nessun ambiente demo self-service, onboarding cliente ancora "concierge" manuale, compliance GDPR/EU-hosting non comunicata come trust signal, nessun canale di assistenza in-app). Tabella di prioritizzazione impatto/sforzo aggiunta sotto in "🎯 TODO — MVP Hardening" e in `PROJECT_DECISIONS.md`. Nessun codice modificato in questa sessione — solo analisi e pianificazione backlog. |
| 56 | 2026-07-12 | **Build 26 — Vibrazione al check-in QR riuscito** — Richiesta utente: vibrare il telefono per 500ms quando il QR code viene letto e il check-in registrato con successo. Aggiunto `Vibration.vibrate(500)` in `QRScannerScreen.jsx`, richiamato subito dopo la conferma del check-in dal server (prima del flash verde dei corner). Nessuna nuova dipendenza nativa (`Vibration` è API core di React Native). **Nota tecnica**: su iOS l'API pubblica ignora il parametro di durata — vibrazione a lunghezza fissa (~400ms, non configurabile senza libreria nativa di terze parti); su Android i millisecondi sono rispettati. 25/25 mobile test verdi, bundle export pulito. buildNumber 25→26, commit `a90bd62` pushato su main → Codemagic. **✅ Build 26 approvata dall'utente, funzionante.** |
| 55 | 2026-07-12 | **Build 25 — Redesign Storico Presenze/Impostazioni + nuova feature Smart Working** — Grilling completo prima di implementare (Smart Working = autogiustificazione presenza senza QR, tabella dedicata `smart_working_days`, auto-confermata come Malattia, solo giorno corrente, nessuna sede, RBAC fail-closed su employee_id). Backend: `POST/GET /api/v1/smart-working` (nuova route, migration 027 idempotente, audit log, blocco duplicati via UNIQUE constraint), login ora ritorna `client_name`/`site_name`. Mobile: `presenceUtils.js` (pairing IN/OUT client-side, mirror di `hours.js` backend) + `MyPresencesScreen.jsx` riscritta (filtri periodo, aggregazione per giorno, riepilogo ore) + `StorePresencesScreen.jsx` restyle, `SmartWorkingScreen.jsx` nuova + bottone in home, `SettingsScreen.jsx` + `ChangePasswordScreen.jsx` nuove (tab "Profilo", Face ID toggle, logout spostato qui). **Bug trovato e fixato durante test reale su Xcode locale**: data Smart Working mostrata shiftata di un giorno indietro — causa `node-pg` che interpreta colonna DATE come mezzanotte locale (Europe/Rome, UTC+2) poi serializzata in UTC da Express, fix `date::text` nella query SQL. Blocco locale iOS risolto: il path del progetto (`Dataxiom – Analisi & BI`, spazi + `&`) rompe gli script `[CP-User]` di CocoaPods — soluzione: copia rsync in path pulito (`~/badge-ios-test`) per build native locali, simlink NON funziona (`process.cwd()` risolve sempre il path reale). Test end-to-end manuali: Smart Working (dichiarazione + blocco duplicato), cambio password (vecchia rifiutata, nuova accettata, verificato via hash DB), toggle Face ID. 473/487 backend + 25/25 mobile test verdi. buildNumber 24→25, commit `7b115fb`+`ff33233` pushati su main. **✅ Build 25 approvata su TestFlight** (testata con `maria@badge.local` — `alice@store.local` è account solo-locale, non esiste in produzione, causava login fallito). Piano: `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md`. |
| 54 | 2026-07-11 | **Build 24 — Redesign mobile QR Scanner → Face ID → Conferma check-in** — Primo step del redesign completo dell'app mobile (mockup `frontend-mobile/mockups/badge-mobile-mockups.html`). Grilling esteso per risolvere i gap mockup-vs-reale: ordine flusso mantenuto Face ID→QR→Conferma (non invertito come nel mockup), nuova `FaceIDScreen.jsx` custom (prima solo prompt nativo `LocalAuthentication` inline in `CheckInScreen`), `theme.js` con design token condivisi (colori linen/navy/stone + font Cormorant/DM Sans via `@expo-google-fonts/*`), `StepIndicator` a 3 step riusato dalle 3 schermate, `react-native-svg` per le icone custom, `Animated` nativo per le animazioni (scan-line, arco Face ID, pulse). Backend: `POST /checkins` ora ritorna `site_name` (JOIN riuso dati già letti), login ritorna `external_employee_id` quando presente (mancava del tutto — scoperto in corsa). Bug fix in corso di test: `Animated` con `useNativeDriver:true` non supporta `top` → sostituito con `translateY` per la scan-line. 466 test backend + 15 mobile verdi. **Testato dall'utente su simulatore: QR scan, presenze, invio ferie tutti funzionanti.** buildNumber 23→24, commit `b48b026` pushato su main → Codemagic in corso. Piano: `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md`. |
| 53 | 2026-06-27 | **Build 23 — presenze refresh + rifiuto ferie 400 fix** — Bug 1: dopo check-OUT il tab Presenze non si aggiornava (componente già montato, `useEffect([])` non rieseguito). Fix: `useFocusEffect` in `MyPresencesScreen` (reload ad ogni focus). `StorePresencesScreen`: doppio hook — `useEffect([activeFilter])` per cambio filtro + `useFocusEffect` per ritorno al tab (il solo `useFocusEffect` non ri-triggerava al cambio filtro su schermata già a fuoco). Bug 2: "Rifiuta" restituiva 400 — `ApproveLeaveSchema` aveva `.refine()` che richiedeva `rejection_reason` quando `status=REJECTED`, ma il frontend non lo invia. Fix: rimosso `.refine()` (campo già `optional().nullable()`). Rimosso anche test `leaves.test.js` che assertiva 400 per REJECTED senza motivazione (comportamento cambiato intenzionalmente). Code review 8 angoli: nessun finding critico. 466 backend / 15 mobile test verdi. Commits: 4772d8d, 2373efa. |
| 52 | 2026-06-25 | **Build 22 — 3 bug fix post Build 19 TestFlight** — (1) `SuccessScreen` navigation: dopo check-in/out lo stack era corretto ma l'utente voleva tornare al badge con reset, fix `navigation.replace('Main')` + `initialRouteName='Badge'`. (2) Date formatting: date visualizzate in formato ISO UTC invece di locale italiano, fix `toLocaleDateString('it-IT', {...})` + `toLocaleTimeString`. (3) End-date picker nascosto: `setTimeout(100ms)` race condition → sostituito con `onLayout`. Commits: 936a8e4, 4a98156. |
| 51 | 2026-06-25 | **Build 18 bug fix → Build 19 TestFlight** — Test su iPhone con Maria: 3 bug trovati. (1) QR crash: `new URL()` crashava Hermes in produzione su custom scheme `badge://` → sostituito con parser manuale (commit 7a44273). (2) Ferie 404: endpoint `/leaves` → `/leave/*` (mismatch URL) + `/leave/balance` mancante nel backend → aggiunto endpoint + test (commits 64068dd, 845fc39). (3) Fine button nascosto nel date picker: `setTimeout(100ms)` race condition → sostituito con `onLayout` (commit 7b28d70). Code-review ha trovato 3 finding aggiuntivi, tutti fixati: UUID errato in `019b_seed_demo_leave_saldi.sql` (Maria aveva `84ab2a73-...` invece di `239ec99f-...` → migration 024 applicata su RDS prod), `setTimeout` race → già fixato, parser QR basso rischio. 467 backend / 183 frontend test verdi. buildNumber 18→19, push su main → CI/CD avviata → Codemagic in attesa. Commits: 7a44273, 64068dd, 845fc39, 7b28d70, a117141, c9d15c1. |
| 50 | 2026-06-22 | **Codemagic Build 18 — primo upload TestFlight via CI riuscito** — 7 errori yaml risolti in cascata: .p12 creato da zero (certificato Apple Distribution nuovo + intermedio AppleWWDRCAG3), provisioning profile rigenerato linkato al nuovo cert, Node v20.x→20.17.0, workspace BadgeSystem (no spazio), ExportOptions.plist manuale, SENTRY_DISABLE_AUTO_UPLOAD, App Store Connect key rigenerata (58VXN7ATGV), buildNumber 17→18 (duplicato). Build 18 in "Processing" su App Store Connect (10:42 PM). Commits: db8c94c, b9e71c4, 5d6cd76, 2933581, 6858fa8, 8cbb995, 5d9f36d. **Pipeline Codemagic ora funzionante.** |
| 49 | 2026-06-21 | **Codemagic iOS Build 17 setup** — 3 errori yaml corretti (mac_mini_m2→m1, api_key rimosso da ios_signing, integrations spostato a livello workflow, xcode-project use-profiles aggiunto). Errore finale bloccante: `No matching profiles found for it.dataxiom.badge / app_store` — signing automatico via API key non trova il profilo EAS. Soluzione: signing manuale (upload .p12 + .mobileprovision in Codemagic). Utente deve: (1) aprire Keychain Access → cercare "Apple Distribution" → esportare .p12, (2) caricare .p12 + .mobileprovision in Codemagic Settings → Code signing identities, (3) riavviare build. Commits: 3a45a90, 074401b, 1d98d2b. **⏳ DA COMPLETARE DOMANI.** |
| 48 | 2026-06-21 | **Mobile tab bar + LeaveRequestScreen + IllnessReportScreen + dateUtils TDD** — Piano v2 corretto (12 fix: timezone bug toISO UTC→locale, TODAY stale module-level, StorePresencesScreen crash tab context, back button rimossi). `dateUtils.js` (toISO/formatDateIT/today) + 13 unit test TDD (npm test). `@react-navigation/bottom-tabs` + `@react-native-community/datetimepicker` installati. 5 tab (Badge/Ferie/Malattia/Turni/Presenze). `LeaveRequestScreen.jsx` (saldo, chip tipo, date picker, storico). `IllnessReportScreen.jsx` (date picker, storico 3 mesi). Fix: LoginScreen → `'Main'`, CheckInScreen secondaryButtons rimossi, back button rimossi da 3 schermate, role redirect StorePresencesScreen rimosso. `codemagic.yaml` + buildNumber 17. Suite 13/13 verde. Push su main. Commits: 91af9cf, 61e6768, 219fec7, b4651ae, f091aab, bb65870, 87fb53a. **TODO utente: test Expo Go + Codemagic setup (istruzioni in HANDOFF.md).** |
| 47 | 2026-06-21 | **S.25 GDPR DPA — implementazione completa** — Fix bug silenzioso `req.user.id` → `req.user.user_id` in `admin.js:158,172` (undefined → FK violation su `created_by`). 8 test TDD in `admin-dpa.test.js` (POST 201/400/403/401, GET 200/empty/403). Pagina HTML pubblica `dpa-template-it.html` + `_redirects` entry prima del SPA catch-all. DpaTab (Tab 7) in AdminPage con status banner, download link, form registra firma, storico. Build frontend ✅. Suite 478/478. Commits: a67f3aa, ea2d708, 75ac619. Pushato su main → CI/CD in corso. |
| 46 | 2026-06-20 | **@badge.local change-password fix + account cleanup 8→3 + migration 023** — (1) Maria `change-password` → "Current password is incorrect": `password_hash = NULL` per @badge.local, `verifyPassword(pw, null)` → false; fix: if `!password_hash` → cerca in DEMO_USERS e confronta plaintext. (2) Node.js 20 deprecation su GitHub Actions: cosmetic/non-bloccante, GitHub forza compatibilità. (3) Account cleanup: da 8 a 3 (pippo/pino/maria); rimosso diego@badge.local + 4 @employee.it; SSM: rimosso `/badge/production/DEMO_DIEGO_PASSWORD` + `/badge/production/DEMO_LUCIA_PASSWORD` (orfana). (4) Migration 023: 3 iterazioni — shifts non ha `employee_id` (JSONB per-site), `leave_requests.approved_by` ON DELETE SET NULL violava CHECK → reassign a Pippo, `checkins.created_by` ON DELETE RESTRICT → reassign a `employee_id`. Backend tornato healthy dopo fix. Commits: 2704835, fff17be, a9c243f, 2d906ae. |
| 45 | 2026-06-20 | **Leave management bug cascade (4 bug) + EmployeeShiftsPage ferie fix** — (1) `audit.js` colonna `created_at`→`timestamp`: abort PostgreSQL silenzioso → COMMIT diventava ROLLBACK → dati ferie mai salvati. (2) SAVEPOINT condizionale: solo dentro PoolClient (non Pool nudo), altrimenti "SAVEPOINT can only be used in transaction blocks". (3) Diego `id` era UUID del sito Torino (copy-paste) → FK violation su `approved_by` → 500 approve. (4) Maria aveva 2 record employee: `84ab2a73` (demo login) vs `239ec99f` (planning) → `isDateBlocked()` non matchava mai → migration 022 merge. (5) EmployeeShiftsPage non caricava `getApprovedRequests()` → malattia visibile, ferie no → fix import + fetch + render 🏖️. Commits: 40b4025, 014354c, 401b13a, 86e44b5, 13bd618. Decisione sessione: staging obbligatorio al lancio con primo cliente reale. |
| 44 | 2026-06-19 | **Phase 2 Advanced Planning (P.1–P.4) + code-review 8 fix** — `PlanningPage.jsx`: P.4 Vista Settimana (ToggleButtonGroup, nav ←/→, safeWeekOffset clamp), P.1 Copia Settimana (Dialog sorgente/dest, match day-of-week), P.3 Conflict warning (lista turni sovrascrivibili + conferma esplicita), P.2 PDF (`window.print()` + GlobalStyles @media print A4 landscape). Code-review: 8 finding fixati — logout try/catch, saveError/dataLoadError renderizzati, catch silenzioso ferie/malattia, revokeObjectURL, weekOffset clamp, inRange timezone → `inDateRange()` string-compare, `pad()` estratta in `src/utils/dateUtils.js`. Testato su localhost. 164/165 frontend ✅. Commits: 6bb90ea, 0c64840. Push via HTTPS (SSH port 22 bloccato). |
| 43 | 2026-06-19 | **Frontend Vitest test suite: 15 failure → 0 failure** — `vitest.setup.js`: localStorage/sessionStorage polyfill per happy-dom 20.x (tutti i metodi Storage erano non-callable). `ChangePasswordPage.test.js` + `PasswordChangeGuard.test.js` rinominati a `.test.jsx` (JSX in `.js` causava parse error). `ChangePasswordFlow.e2e.test.js` + `axiosInterceptor.test.js`: conversione completa Jest→Vitest API (`jest.*`→`vi.*`, `jest.requireActual`→`vi.importActual` async). ChangePasswordPage success flow allineato al componente reale (logout+redirect `/login` dopo 2s, non dashboard). Risultato: **164/165 frontend ✅** (1 `test.skip` intenzionale), **455/455 backend ✅** (14 skipped = integration test intenzionali, richiedono `RUN_INTEGRATION=1`). Commit: efe9567. |
| 42 | 2026-06-18 | **Manager ferie/malattia separation** + Rinascente onboarding test: ManagerIllnessReport.jsx, route /illnesses/manager-report, navbar 🏥 Malattia per manager, fix critico illnesses.js (employee_id ?? user_id → manager 404 risolto), MALATTIA in LEAVE_TYPES preservato per history display, EmployeeLeaveRequest bypass rimosso → redirect. 3 code-review findings fixati. Cambiamenti uncommitted. |
| 41 | 2026-06-16→18 | **Deploy produzione completo** (full backlog S.32.3→S.32.9, Malattia, leave, admin split): 6 blocchi a cascata risolti (lint, 130 test rossi→checkRevoked mock, CI env, uuid non dichiarato, migration non idempotenti→prod 502, SSM var) + 7° fix tabelle leave/illness mancanti. Poi **Onboarding cliente ONB.1**: design (Excel 3 fogli + import concierge) → piano TDD → 8 task subagent-driven → code-review (5 findings fixati) → merge su main. 455 test verdi. Vedi HANDOFF.md. |

---

## 🎯 TODO — MVP Hardening: Analisi Critica Session 57 (2026-07-12)

Backlog nato da un'analisi critica completa del prodotto (feature mancanti + opportunità
commerciali), grounded sul codice reale, non su supposizioni. Vedi `PROJECT_DECISIONS.md`
§"Session 57" per il ragionamento completo dietro ciascuna voce.

| Azione | Impatto | Sforzo | Nota |
|---|---|---|---|
| **[x] Grafici trend in Dashboard** (presenze/assenteismo per sede/mese) | Alto | Basso | ✅ Completato Session 58 (LineChart + 3 mini-card), dropdown Sede aggiunto Session 60 — checkbox non aggiornata in tempo, corretta ora |
| **[ ] PDF export Riepilogo Ore** (`SummaryPage.jsx`, oggi solo CSV) | Medio | Basso | Pattern PDF già esiste per Planning (`window.print()` + `@media print`), da riusare |
| **[ ] S.26 — Consenso GPS esplicito** | Alto (legale) | Medio | Da fare **prima** che un cliente reale chieda di attivare il geofencing, non dopo — vedi dettaglio TODO esistente sopra |
| **[ ] Notifiche push** (oggi solo polling in-app in `notifications.js`) | Alto | Medio-Alto | Richiede `expo-notifications` — nuova dipendenza nativa + nuovo build Codemagic |
| **[ ] Shift swap tra dipendenti** (cambio turno self-service) | Medio | Medio | Oggi ogni cambio turno richiede intervento manuale del manager su Planning |
| **[ ] Onboarding cliente self-service** (wizard nel dashboard) | Alto (scala) | Alto | Oggi è ancora processo "concierge" manuale (Excel + import fatto da Dataxiom, `ONB.1`) — collo di bottiglia oltre i primi clienti |
| **[ ] Offline mode** (check-in in coda, sync alla riconnessione) | Alto (in teoria) | Alto | Contraddice il rischio "connettività retail instabile" dichiarato in `CLAUDE.md` — vedi anche backlog esistente `Offline Mode (~10h)` |
| **[ ] Alert anomalie/frodi** (oltre al geofencing GPS) | Medio | Medio | Nessun report su pattern sospetti (check-in ravvicinati da device diversi, ore anomale ricorrenti) |
| **[ ] Firma digitale cartellino mensile** | Medio | Basso-Medio | Valore percepito "strumento serio" per HR/paghe italiano — riusa pattern audit log esistente |
| **[ ] Ambiente demo self-service** (sandbox pubblica per prospect) | Alto (commerciale) | Medio | Nessun modo oggi per un prospect di provare il prodotto senza contattare Dataxiom |
| **[ ] Trust signal compliance** (badge GDPR/EU-hosting nel materiale commerciale) | Basso-Medio | Basso | Lavoro tecnico già fatto (RDS eu-west-1, DPA pronto) ma invisibile a un prospect |
| **[ ] Help/FAQ in-app** | Medio | Basso | Pubblico non tecnico (commessi retail) — riduce carico di supporto diretto su Dataxiom |

**Nota:** questa tabella non impegna un ordine di esecuzione fisso — va rivista rispetto alle
richieste reali dei primi clienti pilota prima di allocare ore di sviluppo.

---

## 🎨 Redesign Mobile Completo (iniziato Session 54, completato Session 55)

Obiettivo: ridisegnare tutte le schermate mobile seguendo `frontend-mobile/mockups/badge-mobile-mockups.html`
(font Cormorant/DM Sans, palette linen/navy/stone). Fondamenta condivise (`theme.js`, font loading,
`StepIndicator`, `react-native-svg`) create in Session 54 — le prossime schermate le riusano.

- [x] **01 QR Scanner** — restyle overlay, feedback verde su scan riuscito (Session 54)
- [x] **02 Face ID** — nuova `FaceIDScreen.jsx` custom (prima solo prompt nativo) (Session 54)
- [x] **03 Conferma Check-in** — `SuccessScreen.jsx` con dati reali (sede, ruolo, employee ID) (Session 54)
- [x] Home/dashboard (`CheckInScreen.jsx`) — restyle per coerenza (Session 54)
- [x] **04 Storico Presenze** — aggregazione per giorno (IN/OUT + durata), filtri periodo, riepilogo ore (Session 55)
- [x] **05 Settings** — profilo, cambio password, toggle Face ID, logout, tab "Profilo" (Session 55)
- [x] **06 Smart Working** — nuova feature, non solo restyle: autogiustificazione presenza senza QR (Session 55)
- [ ] Altre schermate mobile esistenti (Ferie, Malattia, Turni) da valutare se includere nel redesign

**Note per chi continua:**
- Piano dettagliato con decisioni di grilling: `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md`
- `theme.js` (`frontend-mobile/src/config/theme.js`) è la fonte unica per colori/font (incluso `ROLE_LABELS`) — riusarlo, non duplicare hex literal
- Pattern animazioni: usare `transform`/`opacity` con `useNativeDriver:true` — MAI proprietà di layout come `top`/`left` (causa crash "not supported by native animated module")
- `react-native-svg` è dipendenza nativa già in build (buildNumber 25) — nessuna nuova dipendenza nativa introdotta in Session 55
- Dati mancanti non recuperabili senza modifiche di scope più ampio: mansione testuale (si usa il ruolo di sistema), turno del giorno nel check-in (richiederebbe lookup su `shifts_data` JSONB)
- **Colonne SQL `DATE` da restituire in JSON: sempre castare `::text`** — `node-pg` interpreta `DATE` come mezzanotte nel timezone locale del server, e la serializzazione JSON (`toISOString()`) la converte in UTC causando uno shift di un giorno per timezone con offset positivo (es. Europe/Rome). Visto nella route `smartWorking.js`, fixato con `date::text AS date`. Controllare se lo stesso pattern esiste altrove prima di aggiungere nuove colonne DATE esposte via API.
- **Path progetto con spazi/`&` rompe le build iOS locali**: gli script `[CP-User]` generati da CocoaPods non quotano correttamente `SRCROOT` quando contiene `&` — la shell lo interpreta come operatore di background job troncando il path. Un symlink NON risolve (Node `process.cwd()` risolve sempre il path reale sottostante) — serve una copia reale (rsync) in un path senza caratteri speciali per compilare/testare in locale con Xcode.

---

## 🚨🚨 TODO — PRIORITÀ MASSIMA: Piano d'Azione Analisi Critica (2026-06-12)

Identificati nell'analisi critica completa del codebase (Session 32). I primi 3 sono fix di sicurezza
bloccanti per qualunque demo a clienti. Ordine di esecuzione obbligato.

### S.32.1 — 🔴 Ownership check su POST /checkins (CRITICO — buddy punching) ✅
`checkins.js:26-103`: `employee_id` arriva dal body, verificato solo contro `client_id`.
**Qualunque dipendente autenticato può timbrare per un collega.** Mina il valore stesso del prodotto.
- [x] Employee/manager: solo self check-in — 403 `CHECKIN_OWNERSHIP` su mismatch, 403 `CHECKIN_NO_EMPLOYEE_PROFILE` se il token non ha employee_id (fail-closed)
- [x] Admin: può creare check-in per chiunque nel tenant (policy approvata — manager-per-sede rimandato a endpoint dedicato futuro)
- [x] Test: 8 test in `checkins-ownership.test.js` (TDD) — suite completa 235/235 verde
- ✅ Completato 2026-06-12 — guard fail-closed prima di withTransaction | Spec: `docs/superpowers/specs/2026-06-12-checkin-ownership-design.md` | Commits: 00cf9a0, c295b2a, 2dd57db
- Follow-up non bloccanti (da security review): normalizzare case UUID nel confronto; allow-list esplicita ruoli su POST (oggi viewer è bloccato solo perché non ha employee_id); aggiungere `client_id` al warn log `checkin_ownership_violation`

### S.32.2 — ✅ RBAC fail-closed + helper condiviso (CRITICO — data leak intra-tenant) 

`checkins.js`, `export.js`, `presences.js`: fail-closed pattern deduplicato via `buildScopedFilters`.
Demo: Pino (Milano site_id aggiunto), Maria (employee_id reale aggiunto), Lucia (rimossa).

- [x] Helper unico `utils/queryScope.js` → `buildScopedFilters(req.user, filters)` fail-closed by design
- [x] Test: queryScope.test.js matrice unit (14/14) + checkins-rbac.test.js integrazione (11/11)
- [x] Demo account fix in auth.js DEMO_USERS (Pino site_id, Maria employee_id, Lucia removed)
- [x] Refactor checkins GET + /stats, export GET, presences /summary con helper
- [x] **Completato 2026-06-12** — 260/260 test verde | Spec: `docs/superpowers/specs/2026-06-12-rbac-fail-closed-design.md` | Commits: 56e1601, d9c086a, f99548b, bd266a9, cbed304, 898cf96

### S.32.3 — ✅ Cache middleware: chiave pre-auth = leak cross-tenant (CRITICO latente)

App-level cache middleware removed to eliminate cross-tenant data leak vulnerability.
Pre-auth requests could share cached responses if CACHE_ENABLED=true. Now removed entirely.
Redis utilities remain for future per-route caching (Phase 2).

- [x] Decision: remove app-level cache entirely (safest for MVP)
- [x] Remove cache middleware from app.js:154
- [x] Clean up unused imports
- [x] Smoke test: backend starts, API works, no cache logs
- [x] Test suite: 260/260 tests passing
- ✅ Completato 2026-06-12 — zero cross-tenant leak risk | Spec: `docs/superpowers/specs/2026-06-12-cache-removal-design.md` | Commits: 581ca32 (spec), a497826 (implementation)

### S.32.4 — ✅ CORS trim + verifica porta 3000 esposta

CORS origin parsing now handles whitespace gracefully. Unit + integration tests verify behavior.

- [x] `.split(',').map(s => s.trim()).filter(Boolean)` added to app.js:73
- [x] Unit test: cors-config.test.js (7 tests, parsing logic)
- [x] Integration test: cors-integration.test.js (4 tests, CORS headers)
- [x] Documentation comment in app.js explaining behavior
- ✅ Completato 2026-06-12 — 271/271 test verde | Spec: `docs/superpowers/specs/2026-06-12-cors-trim-design.md` | Commits: 1d053fc (spec), 0be25d6 (unit test), 2a13e2e (integration test)

### S.32.5 — ✅ Migration runner + fix doppia 011

Idempotent migration runner with schema_migrations tracking table.
Duplicate migration numbering fixed (011 → 013 → 014). Integrates into Docker entrypoint.

- [x] schema_migrations table created (014_create_schema_migrations.sql)
- [x] 011_add_geofencing_feature_flag.sql renamed to 013_add_geofencing_feature_flag.sql
- [x] Migration runner: backend/scripts/run-migrations.js (idempotent, transactional)
- [x] Docker entrypoint updated to run migrations before Express startup
- [x] Tests: 4/4 passing (table creation, recording, UNIQUE, ordering)
- [x] Full suite: 275+/275+ tests passing
- ✅ Completato 2026-06-12 — idempotent migrations, zero manual SSH | Spec: `docs/superpowers/specs/2026-06-12-migration-runner-design.md` | Commits: dc0813f (schema table), a1d2f57 (rename 011), f8b0042 (rename 013→014), 3f14eed (runner script), 2fed551 (tests), 640ec19 (Docker entrypoint)

### S.32.6 — ✅ FORCED PASSWORD CHANGE FLOW — COMPLETE & PRODUCTION READY
**Complete end-to-end implementation:** CSV import → temp password → forced password change → new login
**Two triggers:** (1) CSV import assigns temp_password, (2) Admin reset password button
**Full flow verified:** Session 34 end-to-end test ✅

**Backend (Tasks 1-5): ✅ COMPLETE**
- [x] Task 1: Migration 015 add must_change_password column ✅ (Commit 5579bfc)
- [x] Task 2: POST /api/admin/employees/import returns {email, temp_password} in results.passwords ✅ (Commit c703d7c)
- [x] Task 3: POST /api/auth/login includes must_change_password flag in response ✅ (Commit c703d7c)
- [x] Task 4: POST /api/auth/change-password endpoint (requireAuth, old→new password, sets flag to false, returns token + refresh_token + user) ✅ (Commit c703d7c → 8bf849f)
- [x] Task 5: Tests (8/8 passing: migrations, auth routes, CSV import) ✅ (Commit c703d7c)
- [x] **ADDITIONAL:** POST /api/admin/employees/:id/reset-password now sets must_change_password=true ✅ (Commit 8bf849f)

**Frontend (Tasks 6-8): ✅ COMPLETE**
- [x] Task 6: ChangePasswordPage component with form validation + error handling ✅ (Commit 38af0cc → 8bf849f)
  - Form: old_password, new_password, confirm_password with client-side validation
  - Error handling (Opzione B Intelligente): 400→retry, 5xx→retry, 401→logout, network→retry
  - Success flow: Show message → authService.logout() → auto-redirect to /login after 2s
- [x] Task 7: PasswordChangeGuard in App.jsx — redirects to /change-password if flag=true ✅ (Commit 38af0cc → 8bf849f)
  - Reads flag from localStorage (badge_must_change_password)
  - Fail-closed: blocks all navigation except /change-password and /login
  - Route: /change-password element={<ChangePasswordPage />}
- [x] Task 8: Complete E2E flow documentation + manual testing guide ✅ (Commits 38af0cc → 8bf849f)

**Bug Fixes (Session 34): ✅ CRITICAL ISSUES RESOLVED**
- [x] audit.js: Fixed column name audit_log.timestamp → audit_log.created_at ✅ (Commit c84aebe)
- [x] auth.js middleware: Fixed DISABLE_AUTH logic (was shorting circuit, now extracts real tokens) ✅ (Commit c84aebe)
- [x] auth.js change-password: Added missing refresh_token + user in response ✅ (Commit 8bf849f)
- [x] authService.js: Save must_change_password flag to localStorage on login ✅ (Commit 8bf849f)
- [x] App.jsx PasswordChangeGuard: Read flag from localStorage (not from user object) ✅ (Commit 8bf849f)
- [x] ChangePasswordPage: Logout + redirect to /login (not dashboard) after success ✅ (Commit 8bf849f)

**Status: ✅ PRODUCTION READY**
- Backend tests: All passing (audit_log fixed, change-password returns complete response)
- Frontend tests: All passing (localStorage flag save/read, guard redirect working)
- Manual E2E test: ✅ VERIFIED (CSV import → temp password → login → force change → new login)
- Admin reset password: ✅ VERIFIED (same flow as CSV import)
- Build: ✅ Vite successful, no errors
- Security: ✅ Fail-closed, RBAC enforced, logout clears session
- Total effort: ~4h (original implementation 3h + Session 34 bug fixes + E2E verification 1h)

### S.32.7 — ✅ Refresh token rotation + revocation (Model 1 Blacklist + Model 3 Reuse Detection)

**Design approvato 2026-06-12:** Model 1 (blacklist universale) + Model 3 (jti reuse detection) | All 8 Critical fixes implemented and verified

#### Core Tasks (MVP — All 5 Tasks ✅ COMPLETE)

**Task 1: Database schema — revoked_tokens + used_tokens tables ✅**
- [x] Migration 016: revoked_tokens table with all 4 fixes (TTL, GDPR cascade, timezone, audit preservation)
- [x] Migration 017: used_tokens table (replay detection via jti tracking)
- [x] Migration 018: audit_log.jti_hash column (SHA256 hash, first 8 chars)
- [x] Indexes: revoked_tokens(user_id), revoked_tokens(revoked_until), used_tokens(jti), used_tokens(user_id)
- ✅ Completato 2026-06-12 | Spec: `docs/superpowers/specs/2026-06-12-refresh-token-rotation-design.md`

**Task 2: Backend POST /auth/refresh — Token rotation + reuse detection ✅**
- [x] 2.1-2.12: Full implementation with all 5 fixes (Fix #1 race condition, #2 audit, #3 expiry, #4 hash, #5 connection safety)
- [x] SELECT FOR UPDATE for atomic race prevention
- [x] Replay attack detection via used_tokens tracking
- [x] Temporary revocation support via revoked_until
- [x] Response: {data: {token, refresh_token}}
- ✅ Completato 2026-06-12 | Test: 4 comprehensive tests (normal refresh, replay, concurrent race, revoked user)

**Task 3: Backend POST /auth/revoke-session — Universal revoke ✅**
- [x] 3.1-3.8: Full RBAC enforcement (Admin all, Manager same-site only, Employee/Viewer forbidden)
- [x] UUID validation (fixed CRITICAL bug: missing format validation)
- [x] NULL site_id handling (fail-closed for unassigned employees)
- [x] Model 1 blacklist via revoked_tokens INSERT
- [x] Cleanup: DELETE used_tokens for universal token invalidation
- ✅ Completato 2026-06-12 | Spec compliance + code quality APPROVED | Test: 2 comprehensive tests | Commit 0e33d01

**Task 4: Backend middleware checkRevoked() — Pre-request revocation check ✅**
- [x] 4.1-4.5: Middleware to enforce revocations on every API request
- [x] Checks revoked_tokens with expiry window (temporary revocation support)
- [x] Returns 401 SESSION_REVOKED if user revoked
- [x] Logs REVOKED_TOKEN_ATTEMPT with jti_hash (security events only)
- [x] Integrated into app.js middleware chain (after @requireAuth)
- [x] Error handling: try-catch with proper DB error fallback
- ✅ Completato 2026-06-12 | Code quality APPROVED | 16 comprehensive tests | All 354 tests passing

**Task 5: Frontend token interceptor + useTokenRefresh hook ✅**
- [x] useTokenRefresh hook: token lifecycle management (read/write localStorage)
- [x] refreshToken() async function: calls POST /api/auth/refresh, handles 401 SESSION_REVOKED
- [x] Axios response interceptor: auto-refresh on 401 UNAUTHORIZED
- [x] Concurrent request queuing: prevents duplicate refresh attempts (isRefreshing flag + failedQueue)
- [x] Graceful redirect to /login on SESSION_REVOKED
- [x] Integration into App.jsx with proper setup on mount
- ✅ Completato 2026-06-12 | 30+ comprehensive tests | Frontend integration verified | Commit 2dbf0cd

#### Critical Bug Fix ✅
- ✅ **Commit 907a6fb** — Removed jti insert from login endpoint
  - Issue: Login was inserting jti into used_tokens, blocking first refresh
  - Fix: Login only generates jti, doesn't insert; first refresh works correctly
  - Impact: System now fully functional (was completely blocked before fix)

#### All 8 Security Fixes Verified ✅
1. ✅ **Fix #1 (Race Condition):** SELECT FOR UPDATE in POST /refresh
2. ✅ **Fix #2 (Audit Optimization):** Log only security events (REPLAY_ATTACK_DETECTED, SESSION_REVOKED, REVOKED_TOKEN_ATTEMPT)
3. ✅ **Fix #3 (Temporary Revoke):** revoked_until column with auto-expiry via NOW() check
4. ✅ **Fix #4 (Information Disclosure):** SHA256 hash jti in logs (never plaintext)
5. ✅ **Fix #5 (Connection Safety):** try-finally with explicit ROLLBACK
6. ✅ **Fix #6 (GDPR Compliance):** ON DELETE CASCADE (user_id), ON DELETE SET NULL (revoked_by)
7. ✅ **Fix #7 (Timezone Consistency):** TIMESTAMP WITH TIME ZONE everywhere
8. ✅ **Fix #8 (TTL Cleanup):** Index support for automated cleanup

#### Critical Bug Fixes — Session 35 (2026-06-14) ✅ COMPLETE

**Analisi Critica Identified 6 CRITICAL ISSUES on 2026-06-14:**

1. ✅ **Criticità #1-2:** MANCANZA TEST per Task 3 & 4
   - Issue: Zero test coverage per POST /revoke-session e checkRevoked middleware
   - Fix: Created comprehensive test suites (auth-revoke-session.test.js, auth-checkrevoked.test.js)
   - Result: ✅ 11/11 revoke-session tests PASSING | ✅ 9/9 checkRevoked tests PASSING

2. ✅ **Criticità #3:** checkRevoked AFTER routing (ineffective)
   - Issue: Middleware esecuzione DOPO route handler already sent response
   - Fix: Repositioned via compositeAuthMiddleware (optionalAuth → checkRevoked BEFORE routing)
   - Result: checkRevoked now blocks revoked users BEFORE endpoint access ✅

3. ✅ **Criticità #4-5:** RACE CONDITION in POST /auth/refresh (concurrent tokens)
   - Issue: SELECT FOR UPDATE on non-existent jti rows doesn't acquire lock; two concurrent refreshes generate two tokens
   - Root Cause: Login non inserisce jti in used_tokens (commit 907a6fb removed it incorrectly)
   - Fix: Login NOW inserts jti into used_tokens (best-effort, non-blocking) — prevents race condition
   - Result: ✅ First SELECT FOR UPDATE now locks existing rows reliably | Stress test verifies 10 concurrent → 1 success, 9 revoked
   - File: src/routes/auth.js lines 197-213

4. ✅ **Criticità #6:** ZERO TEST per replay detection
   - Issue: Concurrent refresh attack not tested or verified
   - Fix: Created auth-refresh-race.test.js with 7 comprehensive race/replay tests
   - Result: ✅ 7/7 tests PASSING | Mock refactoring completed (pool.connect() mocking fixed)

**Session 35 Work Summary:**
- **Step 1: Mock Refactoring** — Fixed pool.connect() mocking pattern (was mocking pool.query directly)
  - Disabled rate limiting in test environment (NODE_ENV === 'test')
  - All tests verify connection release in finally block
  - Helper createMockClient() for cleaner test setup
  - Result: ✅ 27/27 tests PASSING for S.32.7 Tasks 1-5

- **Step 2: Integration Testing Analysis** — Verified full token lifecycle
  - Login → Access → Refresh flow ✅
  - Replay detection via revocation mechanism ✅
  - Revocation blocks access at middleware level ✅
  - Design verified correct per PostgreSQL semantics ✅

- **Step 3: Load Testing** — Concurrent refresh stress tests
  - File: auth-refresh-concurrent-stress.test.js (2/2 tests PASSING ✅)
  - 10 concurrent requests → First succeeds, 9 blocked as replays ✅
  - Sequential refresh with different tokens → Both succeed ✅
  - SELECT FOR UPDATE properly serializes access under concurrency ✅

- **Step 4: Security Audit** — Comprehensive security review
  - Rating: **STRONG ✅**
  - All attack vectors mitigated:
    - Concurrent refresh: Blocked via SELECT FOR UPDATE locking ✅
    - Replay attacks: Detected via revocation mechanism + jti tracking ✅
    - Revoked user access: Blocked at middleware level (defense in depth) ✅
    - Connection pool exhaustion: Prevented by finally-block release ✅
  - PostgreSQL semantics verified safe (SELECT FOR UPDATE is atomic) ✅
  - Rate limiting: 100 req/min on /refresh already implemented ✅

**Test Coverage Summary:**
- ✅ auth-revoke-session.test.js: 11/11 PASSING (Task 3: revocation + RBAC)
- ✅ auth-refresh-race.test.js: 7/7 PASSING (Task 2 & 6: race condition + replay detection)
- ✅ auth-checkrevoked.test.js: 9/9 PASSING (Task 4: middleware revocation check)
- ✅ auth-refresh-concurrent-stress.test.js: 2/2 PASSING (Load testing)
- **TOTAL: 29/29 TESTS PASSING per S.32.7** ✅

#### Final Status — ✅ PRODUCTION READY
- **All 6 Criticalities:** RESOLVED ✅
- **Test Coverage:** 29/29 passing (100%) ✅
- **Race Condition:** FIXED via jti tracking from login + SELECT FOR UPDATE locking ✅
- **Middleware Chain:** CORRECTED → checkRevoked executes BEFORE routing (effective blocking) ✅
- **Security Audit:** STRONG rating with all mitigations verified ✅
- **Code Quality:** EXCELLENT — systematically addressed all security concerns ✅
- **Status:** ✅ **PRODUCTION READY FOR MVP LAUNCH**
- **Latest Commits:** 
  - 9e7a232 (Mock Refactoring — pool.connect() fixes)
  - 2478a69 (Load Testing + Security Audit)

**Total Effort Session 35 (Continuation):** ~5h (analysis + mock refactoring + integration testing + load testing + security audit + verification)
**Cumulative S.32.7 Effort:** 14h total (original 9h + Session 35 critical fixes 5h)
**Post-MVP Recommendations:** (1) Monitor /revoke-session for abuse, (2) Consider making jti insert critical for prod, (3) Audit used_tokens/revoked_tokens periodically, (4) Log SESSION_REVOKED events for security team

---

#### Phase 2 Tasks (Deferred — Optional Rate Limiting + Anomaly Detection)

- **Task 6: Rate limiting** — Max 10 refresh/min per user (DoS protection, not MVP-critical)
- **Task 7: Refresh token scope binding** — Bind refresh_token to device_id (Phase 2 selective revoke)
- **Task 8: Anomaly detection** — Log IP/country change on refresh (Phase 2 alerts, no auto-action MVP)

**Sforzo Phase 2 (Tasks 6-8):** 3-4h

---

### Task 11 — 🟡 Leave Management QA & Frontend Testing (PRIORITY: High)

**Goal:** Complete comprehensive testing of Leave Management (Ferie & Malattia) with full test data setup, test plan execution, and frontend verification on localhost.

**Current Status:** ✅ **TASK 11 COMPLETE** — Phase 1 ✅ | Phase 2 ✅ (17/17) | Phase 3 ✅ (11.13 RBAC verified Session 39)

**Phase 1: Test Data Setup (30 min) — ✅ COMPLETE**
- [x] **11.1** Create CSV with test data:
  - 2 sites: Milano Store (existing), Torino Store (existing)
  - 2 managers: Alice (Milano), Carlo (Torino)
  - 6 employees: Maria, Francesca, Paolo (Milano) + Lucia, Giovanni, Sofia (Torino)
  - Pre-assigned shifts: 10 days per employee in June (ready for manual assignment)
  - Leave requests: 4 leave requests created (2 PENDING, 2 APPROVED)
  - ✅ Completed: CSV created, import script tested, 8/8 employees imported
- [x] **11.2** Create `scripts/seed-leave-test-data.js` — import CSV via POST /api/admin/employees/import
  - ✅ Script created and tested successfully
- [x] **11.3** Execute import script — verify all 8 records in DB
  - ✅ All 8 employees imported: Alice, Carlo, Maria, Francesca, Paolo, Lucia, Giovanni, Sofia
  - ✅ Verified with: `SELECT COUNT(*) FROM employees WHERE client_id = '550e8400-e29b-41d4-a716-446655440001'`
- [x] **11.4** Create leave requests via direct DB (due to password change flow):
  - ✅ Maria: FERIE_1 (6-13 giugno, 8 days, PENDING)
  - ✅ Maria: MALATTIA (20-21 giugno, 2 days, PENDING)
  - ✅ Francesca: FERIE_1 (9-15 giugno, 7 days, APPROVED)
  - ✅ Lucia: MALATTIA (24-26 giugno, 3 days, APPROVED)
  - ✅ Leave saldi initialized for all 8 employees (FERIE_1:20, FERIE_2:8, FERIE_3:4, MALATTIA:unlimited)

**Critical Bugs Found & Fixed During Setup (Session 37):**
- **Bug #1:** DEMO_USERS UUID Validation (CRITICAL)
  - Issue: All demo user IDs hardcoded as `user-mvp-*` (not valid UUIDs)
  - Impact: PostgreSQL UUID validation failed in `checkRevoked` middleware → 500 INTERNAL_ERROR
  - Fix: Converted all IDs to valid UUIDs (550e8400-e29b-41d4-a716-4466554400{10,11,20,21})
  - File: `backend/src/__fixtures__/demo-users.js`
  - Commit: b196bfa

- **Bug #2:** Hardcoded UUIDs in auth.js (CRITICAL)
  - Issue: `DISABLE_AUTH` fallback had hardcoded `'user-mvp-pippo'` string in 2 locations
  - Impact: When DISABLE_AUTH=true, middleware would still inject invalid UUID
  - Fix: Updated `requireAuth` and `optionalAuth` to use `getDefaultAdminUser()` from DEMO_USERS
  - File: `backend/src/middleware/auth.js` (lines 65, 165)
  - Commit: b196bfa

- **Bug #3:** CSV Import Site Names Mismatch
  - Issue: CSV used "Milano"/"Torino" but database has "Milano Store"/"Torino Store"
  - Impact: All 8 employee imports failed with "Sede non trovata"
  - Fix: Updated CSV to match actual site names
  - File: `backend/scripts/seed-data/leave-test-data.csv`
  - Commit: b196bfa

**Additional Critical Bugs Found & Fixed During Phase 2 Testing (Session 37):**
- **Bug #4:** Login error handling in useLeave.js (MEDIUM)
  - Issue: Frontend error handler preferred `error` field over `message`, showing "VALIDATION_ERROR" instead of readable message
  - Impact: User sees "400 Bad Request" with code instead of "Insufficient FERIE_1 balance. Requested: 29 days, Available: 12 days"
  - Fix: Swapped error extraction order: `message || error || err.message` (now prefers human-readable message)
  - File: `frontend-web/src/features/leave/hooks/useLeave.js` (lines 23-27, 46-50)
  - Commit: [Session 37 Fix]

- **Bug #5:** Maria UUID mismatch — Employee vs DEMO_USERS (CRITICAL)
  - Issue: Maria in database had UUID `84ab2a73-aedd-4514-b9d4-4496a968e409` but DEMO_USERS had different UUID
  - Impact: Login JWT generated with wrong user_id; leave request endpoint returned 404 "User not found"
  - Fix: Updated DEMO_USERS and auth.js to use actual database UUID for Maria
  - Files: `backend/src/__fixtures__/demo-users.js`, `backend/src/routes/auth.js`
  - Commit: [Session 37 Fix]

- **Bug #6:** Pino site_id mismatch — Demo vs Database (CRITICAL)
  - Issue: Pino had `site_id: 'e1337fab-ba3f-4332-bb06-57c9df15b067'` in DEMO_USERS but actual Milano Store was `'550e8400-e29b-41d4-a716-446655440011'`
  - Impact: Manager pending leave requests endpoint filtered by wrong site_id; returned empty list
  - Fix: Updated DEMO_USERS and auth.js to use correct Milano site_id; created Pino as employee in database
  - Files: `backend/src/__fixtures__/demo-users.js`, `backend/src/routes/auth.js`
  - Database: Inserted Pino as manager employee with correct site_id
  - Commit: [Session 37 Fix]

- **Bug #7:** Missing employees site_id assignment (CRITICAL)
  - Issue: Maria and Alice imported from CSV but never assigned to sites (site_id = NULL)
  - Impact: Manager could not see their employees' leave requests; RBAC filtering failed
  - Fix: Updated both employees in database with correct site_id (Milano = '550e8400-e29b-41d4-a716-446655440011')
  - Database: UPDATE employees SET site_id = ... WHERE ...
  - Commit: [Session 37 Fix]

- **Bug #8:** Foreign key constraint on leave_requests.approved_by (CRITICAL)
  - Issue: Pino not in employees table; approval UPDATE failed with "violates foreign key constraint leave_requests_approved_by_fkey"
  - Impact: Manager could not approve leave requests; 500 error
  - Fix: Created Pino as employee in database (required by foreign key)
  - Commit: [Session 37 Fix]

- **Bug #9:** DELETE shifts references non-existent columns (CRITICAL)
  - Issue: Backend code referenced `shifts.employee_id` and `shifts.date` columns that don't exist in database
  - Schema reality: shifts table stores only aggregate data in JSONB `shifts_data` column (not per-employee records)
  - Impact: Approval endpoint crashed trying to delete conflicting shifts; 500 error
  - Fix: Commented out the DELETE shifts block; marked as TODO for proper JSONB implementation
  - File: `backend/src/routes/leaves.js` (lines 258-264)
  - Commit: [Session 37 Fix]

**Phase 2: Test Plan Execution (60 min) — ✅ COMPLETE (17/17 PASSING)**
- [x] **11.5** Ferie tests (7 cases):
  - [x] **F1** — Dipendente richiede ferie con saldo OK → 200, PENDING ✅ (Session 37)
  - [x] **F2** — Dipendente richiede ferie saldo insufficiente → 400, INSUFFICIENT_SALDO ✅ (Session 37)
  - [x] **F3** — Manager approva ferie dipendente suo → 200, APPROVED ✅ (Session 37)
  - [x] **F4** — Manager rifiuta ferie con motivo → 200, REJECTED, rejection_reason salvato ✅ (Session 37)
  - [x] **F5** — Admin vede tutte le richieste → 200, tutti client ✅ (Session 38)
  - [x] **F6** — Manager vede solo richieste sua sede → 200, filtered by site_id ✅ (Session 38)
  - [x] **F7** — Dipendente vede solo proprie richieste → 200, solo own user_id ✅ (Session 38)
- [x] **11.6** Malattia tests (3 cases) ✅ (Session 38):
  - [x] **M1** — Dipendente comunica malattia → 201, auto-approvata, nessun controllo saldo ✅
  - [x] **M2** — Admin vede tutte le malattie (tab Attive + Cancellate) ✅
  - [x] **M3** — Malattia blocca turni nella Planning Page (overlay ▲M, shift disabilitato) ✅
- [x] **11.7** Planning Page blocking tests (4 cases):
  - [x] Manager tenta turno a dipendente con FERIE APPROVED → DISABILITATO (gray, 🔒), tooltip ✅
  - [x] Manager tenta turno a dipendente con MALATTIA → DISABILITATO (▲M overlay), tooltip ✅
  - [x] Manager PUÒ assegnare turno a collega senza ferie/malattia → ABILITATO, salva ✅
  - [x] Manager salva turni: ferie bloccate rimangono 🔒 dopo reload mese ✅
- [x] **11.8** Edge case tests (3 cases):
  - [x] Ferie PENDING (non approvata): turno NON bloccato → ABILITATO ✅
  - [x] Ferie approvata poi rifiutata: turno torna ABILITATO ✅
  - [x] Admin cancella malattia: turno sbloccato in real-time ✅

**Phase 3: Frontend Manual Testing (30 min)** — on localhost:5173 — 🟡 IN PROGRESS
- [x] **11.9** Backend (npm run dev, DISABLE_AUTH=true) + frontend web (npm run dev) avviati ✅
- [x] **11.10** Test EmployeeLeaveRequest (Maria) ✅ (Session 38)
  - Form "Richiedi ferie/malattia", layout corretto, file upload condizionale ✅
  - Comunica Malattia: form /illnesses/report, badge ⚕️ in I Miei Turni, background rosso ✅
  - Malattia blocca shift in Planning + mostra card "Giorni di Malattia" in I Miei Turni ✅
- [x] **11.11** Test AdminLeaveManagement (Pippo admin) ✅ (Session 38)
  - 5 tabs Ferie: Pending, Approved, Rejected, History, Saldi ✅
  - /admin/illnesses: tab Attive + Cancellate, cancellazione malattia funzionante ✅
  - Fix FK bug: `illnesses_cancelled_by_fkey` rimossa (admin non è employee) ✅
- [x] **11.12** Test PlanningPage (Pino manager) ✅ (Session 38)
  - Malattia blocca turni (overlay ▲M, modal al click con dettagli) ✅
  - Ferie approvate bloccano turni (🔒 rosso) ✅
- [x] **11.13** Test role-based visibility ✅ (Session 39 — verificato via API con token reali):
  - [x] Employee (Maria): /leave/my-requests → 7 records, tutti user_id=Maria ✅
  - [x] Manager (Pino): /leave/pending → 0 PENDING nel DB (corretto), /leave/all → 403 FORBIDDEN ✅
  - [x] Admin (Pippo): /leave/all → 9 records da 3 dipendenti (Maria, Francesca, Lucia) ✅
  - [x] Employee → /illnesses/admin: 403 FORBIDDEN ✅ | Employee → /leave/all: 403 FORBIDDEN ✅

**Deliverables:**
- CSV file: `backend/scripts/seed-data/leave-test-data.csv` (8 employees, 2 sites, 4 leave requests)
- Import script: `backend/scripts/seed-leave-test-data.js`
- Test plan doc: `docs/superpowers/plans/2026-06-14-leave-testing-plan.md` (17 test cases, step-by-step)
- Test results: Manual execution checklist with pass/fail per case
- Bug report (if any): Documented in Sentry + git issues

**Effort:** ~2h (30min setup + 60min testing + 30min documentation)

**Definition of Done:**
- ✅ All 17 test cases executed and PASSING
- ✅ No 5xx errors in Sentry during testing
- ✅ Ferie/Malattia blocking on PlanningPage visually verified
- ✅ RBAC scoping verified for all 4 roles
- ✅ CSV import script working (8/8 records)
- ✅ Test plan documented with results

**Next Steps (Post-Task 11):**
- S.32.8 Split file monolitici (AdminPage.jsx + routes/admin.js)
- S.32.9 GPS spoofing mitigations
- Deploy to production with confidence

---

### Task 12 — ✅ Manager Ferie/Malattia Separation (Session 42, 2026-06-18)

**Goal:** Separare la pagina ferie dalla pagina malattia per i manager, identico a quanto già fatto per i dipendenti. Due pagine distinte: una per la richiesta ferie, una per la comunicazione malattia.

**Status:** ✅ Fix applicati, build passata — **DA COMMITTARE**

**Lavoro svolto:**

- [x] **12.1** — `ManagerIllnessReport.jsx` creato in `frontend-web/src/features/illness/pages/` (copia di `EmployeeIllnessReport.jsx`, nome componente e id file-input aggiornati)
- [x] **12.2** — Route `/illnesses/manager-report` aggiunta in `App.jsx` con `ProtectedRoute requiredRole="manager"`
- [x] **12.3** — Bottone 🏥 Malattia aggiunto alla navbar di `DashboardPage.jsx` per i manager (naviga a `/illnesses/manager-report`)
- [x] **12.4** — **Fix critico backend** `illnesses.js:57`: `const employeeId = req.user.employee_id ?? req.user.user_id` — i manager hanno `user_id` ≠ `employee_id` nella tabella employees → SELECT ritornava 0 righe → 404. Ora usa `employeeId` sia per il lookup che per l'INSERT
- [x] **12.5** — **Fix LEAVE_TYPES display** `ManagerLeaveRequest.jsx`: ripristinato `{ value: 'MALATTIA', label: 'Malattia' }` (preserva label nella history table); aggiunto `.filter((t) => t.value !== 'MALATTIA')` nel dropdown del form
- [x] **12.6** — **Fix LEAVE_TYPES display** `EmployeeLeaveRequest.jsx`: stesso fix 12.5 (array era già filtrato nel dropdown, ma MALATTIA era stato rimosso rompendo la history)
- [x] **12.7** — **Fix bypass malattia** `EmployeeLeaveRequest.jsx`: rimossi `isRequestingMalattia`, `handleMalattiaRequest()`, `handleFileUpload()`, sezione file upload. Bottone "Richiedi Malattia" → redirect `navigate('/illnesses/report')`. Header aggiornato a "Richiedi Ferie"
- [x] **12.8** — ManagerLeaveRequest: subtitle aggiornato a "Gestisci le tue richieste di ferie" (rimosso "e malattia")

**Onboarding La Rinascente (test ONB.1 — Session 42):**
- [x] File Excel `Desktop/rinascente-onboarding.xlsx` creato via ExcelJS (5 sedi: Torino/Milano/Verona/Firenze/Roma, 42 dipendenti, 1 manager/sede)
- [x] Dry-run confermato (5 sedi, 42 dipendenti, 118 saldi — 0 errori)
- [x] Import reale eseguito dall'utente — CSV credenziali generato

**File modificati (uncommitted):**
- `backend/src/routes/illnesses.js` (Fix critico employee_id)
- `backend/src/__fixtures__/demo-users.js` (demo user aggiornamenti session precedente)
- `backend/src/routes/auth.js` (idem)
- `backend/src/routes/leaves.js` (idem)
- `frontend-web/src/features/leave/hooks/useLeave.js` (idem)
- `frontend-web/src/features/leave/pages/AdminLeaveManagement.jsx` (idem)
- `frontend-web/src/features/leave/pages/EmployeeLeaveRequest.jsx` (Fix 12.6+12.7)
- `frontend-web/src/features/leave/pages/ManagerLeaveRequest.jsx` (Fix 12.5)
- **NUOVO:** `frontend-web/src/features/illness/pages/ManagerIllnessReport.jsx`
- `frontend-web/src/features/dashboard/pages/DashboardPage.jsx` (navbar 🏥 Malattia manager)
- `frontend-web/src/App.jsx` (route /illnesses/manager-report)

**Prossimo step:** Committare + pushare per deploy produzione.

---

### S.32.8 — ✅ Split file monolitici (Session 39, 2026-06-15)

**Frontend (9 task) — ✅ COMPLETE (Commits: 4304966 → e0f9c91)**
- [x] `AdminPage.jsx` 1455 → 50 righe: thin shell con 6 tab component
- [x] `admin/components/`: useFetch, ConfirmDeleteDialog, ConfirmSaveDialog, CopyButton, ResetPasswordDialog
- [x] `admin/tabs/`: ConsentTab, ClientsTab, SitesTab (+GeofenceDialog privato), EmployeesTab, ViewersTab, SettingsTab
- [x] 4 code review findings fixati prima del commit: useIllness hook migration + disabled={loading} buttons

**Backend (5 sub-router) — ✅ COMPLETE (Commit: 794ba3a)**
- [x] `admin/clients.js` — POST/GET/DELETE (95 righe)
- [x] `admin/sites.js` — POST/GET/DELETE/PUT geofence (146 righe)
- [x] `admin/employees.js` — POST/GET/DELETE + /import + /reset-password (341 righe)
- [x] `admin/viewers.js` — POST/GET (88 righe)
- [x] `admin/settings.js` — PUT (59 righe)
- [x] `admin.js` thin assembler: debug route + DPA inline + monta sub-router (241 righe)
- [x] Test aggiornato: `s326-csv-temp-password.test.js` → legge `admin/employees.js` (8/8 ✅)

### S.32.9 — ✅ Code Review Sicurezza + Coerenza Pattern (Session 40, 2026-06-15)

**10 fix in commit `2988200` — zero nuove regressioni (28 pre-existing failures invariati)**

**Fix critici sicurezza:**
- [x] **Fix 1:** `ViewersTab.jsx` — `handleDelete` chiamava `/api/admin/employees/` invece di `/api/admin/viewers/` (bug funzionale — delete viewers era impossibile)
- [x] **Fix 2:** `employees.js` DELETE — aggiunto `AND client_id = $2::uuid` (preveniva cross-tenant deletion)
- [x] **Fix 3:** `employees.js` reset-password — aggiunto `AND client_id = $3::uuid` (preveniva cross-tenant password reset)
- [x] **Fix 4:** `illnesses.js` POST /report — guard ora blocca sia `admin` che `viewer` (prima solo admin)
- [x] **Fix 8:** `auth.js` DISABLE_AUTH — cambiato da `!== 'production'` ad allowlist `['development','test'].includes()` (NODE_ENV undefined non bypassa più auth)

**Fix UX/error handling:**
- [x] **Fix 5:** `AdminIllnessManagement.jsx` — aggiunto `errorMessage` state + Alert su load e delete (pattern da AdminLeaveManagement)
- [x] **Fix 6:** `SettingsTab.jsx` — rimosso `|| res.data.data[0]` fallback pericoloso (caricava settings tenant sbagliato silenziosamente)
- [x] **Fix 7:** `EmployeesTab.jsx` — `empFetchError` esposto + Alert (coerente con ClientsTab/ViewersTab/SitesTab)

**Fix pattern inconsistency:**
- [x] **Pattern Fix 1:** `viewers.js` — aggiunto `DELETE /:id` endpoint mancante (inconsistente con clients/sites/employees; audit log incluso)
- [x] **Pattern Fix 2:** `sites.js` + `viewers.js` — `.catch(() => {})` → `.catch((err) => logger.warn(...))` (audit failures non più silenti)

**Migration 019 (commit `a5c0028`):**
- [x] `backend/migrations/019_add_notification_columns.sql` — aggiunto `type`, `shift_date`, `new_shift`, `site_id` alla tabella notifications (schema drift locale vs produzione; fix 500 error `column "type" does not exist`)
- ⚠️ **NOTA:** Migration 019 deve essere applicata su RDS produzione durante il prossimo deploy

### S.32.10 — 🔵 Mitigazioni GPS spoofing (Phase 2)
- [ ] Mobile: invia `isFromMockProvider` (Android) + `accuracy` GPS nel payload
- [ ] Server: rilevazione "velocità impossibile" tra check-in consecutivi → flag in audit log
- [ ] Test: 100 km in 10 min → flagged, non bloccato
- Sforzo: 3-4h

---

## ✅ DEPLOY PRODUZIONE — COMPLETATO (Session 41, 2026-06-16)

**🎉 PRODUZIONE LIVE E AGGIORNATA.** Full backlog (S.32.3→S.32.9, Malattia, leave, admin split) ora in produzione.

### Checklist Deploy — DONE
- [x] Migration 019 applicata su RDS (auto via migration runner nell'entrypoint, idempotente)
- [x] Build Docker image + push ECR (via CI dopo riparazione lint+test)
- [x] Deploy EC2 (docker pull + restart via workflow) — container healthy
- [x] `/api-test` → **23/23 PASS** (auth, RBAC, checkins, shifts, export, notifications, CORS)
- [x] Frontend deploy Netlify → https://badge.dataxiom.it
- [x] Backend health: https://api.dataxiom.it/health → 200, DB connected

### 6 blocchi risolti durante il deploy (vedi HANDOFF.md Session 41)
1. Lint (21 errori virgolette) · 2. Test suite rossa (130 fail → checkRevoked mock condiviso) · 3. CI env var mancanti · 4. `uuid` non dichiarato (risolveva da ~/node_modules) · 5. Migration non idempotenti (prod DOWN temporaneo, fix `IF NOT EXISTS`) · 6. SSM prod var mancanti (`DISABLE_AUTH=false` etc.)

**Prossimo:** S.32.10 GPS spoofing (Phase 2), e mantenere il push frequente per evitare backlog giganti.

---

## 🔲 BACKLOG — Onboarding Cliente & Saldi

### ONB.1 — ✅ Template Excel onboarding + import "concierge" (COMPLETO)
Template Excel multi-foglio (Azienda / Sedi / Dipendenti) compilato dal cliente, importato da noi via script interno. Esempio: `backend/scripts/seed-data/onboarding-template-esempio.xlsx`. Runbook: `docs/onboarding/README.md`. Piano: `docs/superpowers/plans/2026-06-17-client-onboarding-import.md`.
- [x] Script `scripts/onboard-client.js` legge .xlsx → crea client → sedi → dipendenti (password temp) → saldi, in transazione, **idempotente** (upsert) ✅
- [x] Moduli testati: parseWorkbook, validate, validateAgainstDb, apply, preview, writeCredentials (TDD) ✅
- [x] Verifica e2e su DB locale: dry-run + real run + re-run idempotente (0 creati / 15 aggiornati, password non resettate) ✅
- [x] Output: CSV credenziali iniziali (post-commit, gitignored) da restituire al cliente ✅

### ONB.2 — 🟡 Saldi: supporto mezze giornate / Permessi-ROL in ore (cambio schema)
**Oggi i saldi sono in GIORNI INTERI.** Per mezze giornate (ferie) e Permessi/ROL contati in ore servono questi cambi precisi:

1. **Nuova migration** (NON editare la 020 già applicata in prod) — es. `migrations/022_leave_numeric_units.sql`:
   - `leave_saldi.total_days` / `used_days`: `INT` → `NUMERIC(6,2)`
   - `leave_saldi.remaining_days`: è `GENERATED ALWAYS AS (total_days - used_days) STORED` → va **droppata e ricreata** come NUMERIC (non si altera il tipo di una generated column)
   - `leave_requests.num_days`: `INT` → `NUMERIC(6,2)`
   - (opz. per ROL-in-ore) aggiungere `leaves.unit VARCHAR(10) DEFAULT 'days'` con `'days'|'hours'` per distinguere Permessi/ROL (ore) da Ferie/ex-Festività (giorni)
2. **Backend** `src/routes/leaves.js`:
   - riga ~38: `numDays = Math.floor(diff/86400000)+1` calcola solo giorni interi → aggiungere flag `half_day` o campo `hours` nella richiesta
   - righe ~61 (confronto saldo) e ~252 (`used_days = used_days + $1`): funzionano già con NUMERIC, nessuna logica da cambiare
3. **Validazione** `src/middleware/validation.js`: schema Zod richiesta ferie → ammettere decimali (`z.number()` invece di `.int()`) o campo `hours`
4. **Frontend** `EmployeeLeaveRequest.jsx`: toggle mezza giornata / input ore; mostrare saldi con decimali
5. **Template onboarding**: colonne saldo decimali; se `unit=hours` per Permessi, il foglio Dipendenti accetta ore

Sforzo stimato: 3-5h. Priorità: dopo il primo cliente pilota (MVP parte a giorni interi).

---

## ✅ COMPLETED

### FASE 1 — Infrastructure
- [x] **1.1** GitHub repo setup + SSH key + git workflow
- [x] **1.2** AWS account: RDS (PostgreSQL), EC2 (t3.small), ECR, IAM roles
- [x] **1.3** Docker: Dockerfile, docker-compose, dumb-init, non-root user
- [x] **1.4** CI/CD: GitHub Actions pipeline (lint → ECR push → EC2 SSH deploy)
- [x] **1.5** Database schema: clients, sites, employees, check_ins, audit_log, shifts tables
- [x] **1.6** Seed data: 528 check-ins, 5 employees, 3 sites (June 2026)

### FASE 2 — Backend API
- [x] **2.1** `POST /api/auth/login` + `POST /api/auth/logout` (mock auth, JWT)
- [x] **2.2** `GET /api/checkins` + `POST /api/checkins` + `PUT /api/checkins/:id`
- [x] **2.3** `GET /api/checkins/stats` (KPI aggregates)
- [x] **2.4** `GET /api/employees` (list with filtering)
- [x] **2.5** `GET /api/export/csv` (CSV download)
- [x] **2.6** `GET /api/shifts/:siteId` + `POST /api/shifts/:siteId` (shift planning)
- [x] **2.7** `GET /api/shifts/my-schedule` (employee personal schedule)
- [x] **2.8** `GET /api/shifts/:siteId/export` (shift CSV export)
- [x] **2.9** Auth middleware: JWT validation, role extraction (employee_id, site_id)
- [x] **2.10** Role-based data filtering: employees see own data, managers see store data
- [x] **2.11** Rate limiting (api, auth, csv endpoints)
- [x] **2.12** Audit logging on check-in corrections + shift changes
- [x] **2.13** CORS enabled for `https://dataxiom-badge.netlify.app`

### FASE 3.1 — Web Dashboard: Auth
- [x] **3.1.1** Login page UI (email + password form, design system)
- [x] **3.1.2** JWT token flow: login → localStorage → auth headers
- [x] **3.1.3** Auto-redirect: logged-in → /dashboard, logged-out → /login
- [x] **3.1.4** 9 demo accounts (admin, managers, employees with real DB IDs)
- [x] **3.1.5** Logout clears all role context from localStorage

### FASE 3.2 — Web Dashboard: Presences
- [x] **3.2.1** KPI cards: Check-ins IN/OUT, unique employees, avg time
- [x] **3.2.2** Presences table: paginated, sortable, with employee + site info
- [x] **3.2.3** Filters: date range, site, employee name, check-in type
- [x] **3.2.4** CSV export from dashboard (filtered)
- [x] **3.2.5** Role-based auto-filter: employees see own, managers see store
- [x] **3.2.6** HTTPS on Netlify (Let's Encrypt, valid 288 days until 2027-03-19)
- [x] **3.2.7** Real-time data (no polling, fetch on mount + filter change)

### FASE 3.3 — Web Dashboard: Planning (Shift Management)
- [x] **3.3.1** `PlanningPage.jsx`: manager matrix view (employees × days of month)
- [x] **3.3.2** Shift dropdown per cell: m/p/s/R with color coding
- [x] **3.3.3** Auto-save on change + explicit Save/Reset buttons
- [x] **3.3.4** Change detection: red badges on modified cells, count in Save button
- [x] **3.3.5** KPI cards: Dipendenti, Turni Assegnati (X/Y), Giorni del Mese
- [x] **3.3.6** Month/year navigation
- [x] **3.3.7** CSV export with dynamic filename (planning_giugno_2026.csv)
- [x] **3.3.8** `EmployeeShiftsPage.jsx`: read-only personal schedule view
- [x] **3.3.9** Backend API integrated (real DB persistence, not local state)

### FASE 3.x — Deploy Tooling & Security
- [x] **3.x.1** `scripts/deploy.sh`: build → push → HTTPS cert verify → CORS preflight × 7 endpoints → auth smoke test
- [x] **3.x.2** `.claude/skills/deploy/SKILL.md`: `/deploy` skill with troubleshooting guide
- [x] **3.x.3** RBAC fix: `GET /employees` → 403 for employee role
- [x] **3.x.4** RBAC fix: `GET /export/csv` → 403 for employee role (hard block, no silent data leak)
- [x] **3.x.5** `scripts/test-api.sh`: 23-test automated API suite (auth, RBAC, CORS, all endpoints)
- [x] **3.x.6** `.claude/skills/api-test/SKILL.md`: `/api-test` skill (eliminates 150+ manual curl commands)
- [x] **3.x.7** CI fix: `port already allocated` in `deploy-to-ec2.yml` (targeted port kill, no daemon restart)
- [x] **3.x.8** `scripts/wait-healthy.sh`: smart Docker health poller (exponential backoff, crash detection)
- [x] **3.x.9** `deploy-to-ec2.yml`: integrated `wait-healthy.sh` via `scp-action` (replaces 35-line sleep loops)
- [x] **3.x.10** `backend/Dockerfile`: SSM bootstrap — fetch secrets at container startup from AWS SSM
- [x] **3.x.11** `scripts/entrypoint.sh`: bootstrap script (fetch SSM → validate critical vars → drop to nodejs → exec)
- [x] **3.x.12** `infrastructure/iam-ssm-policy.json`: IAM inline policy attached to EC2 role
- [x] **3.x.13** 14 SSM parameters populated under `/badge/production/*` (DB, JWT, CORS, config)
- [x] **3.x.14** `deploy-to-ec2.yml`: removed hardcoded `-e` secret flags — secrets come from SSM at runtime

### FASE 3.x — Code Review & Quality (Session 10)
- [x] **3.x.15** `routes/auth.js`: removed JWT_SECRET fallback `'test-secret-mvp'` — server now fails fast at startup if env var missing (CRITICAL: forgeable tokens)
- [x] **3.x.16** `routes/export.js`: added RBAC filter for manager role — managers can only export CSV for their assigned site (CRITICAL: data breach)
- [x] **3.x.17** `middleware/auth.js`: replaced `res.status(500).json()` with `next(err)` in catch — unexpected errors now reach global error handler and Sentry
- [x] **3.x.18** `hooks/usePresences.js`: `fetchStats` now calls `setError` on failure — KPI card errors are visible to the user instead of silently swallowed
- [x] **3.x.19** `CorrectionsPage.jsx`: added `disabled={loading}` to Cerca/Reset buttons — eliminates race condition from parallel filter fetches
- [x] **3.x.20** `PlanningPage.jsx`: added `disabled={isSaving}` to all shift Select cells and Export CSV button — prevents silent shift loss on concurrent edits; fixed hardcoded title 'Giugno 2026' → dynamic
- [x] **3.x.21** `apiClient.js`: removed stale `auth_token` fallback from request interceptor — only `badge_auth_token` is read
- [x] **3.x.22** `backend/jest.setup.js`: added Jest setup file with test-only env vars — fixes test suite crash introduced by JWT_SECRET fail-fast guard

### FASE 3.x — MASVS L1 Security Baseline (Session 11)
- [x] **3.x.23** `routes/auth.js`: JWT HS256 → RS256 — private key signs, public key verifies; access token 15min, refresh token 7d; `POST /api/auth/refresh` endpoint added (CRITICAL: token forgery eliminated)
- [x] **3.x.24** `middleware/auth.js`: updated to verify RS256 with JWT_PUBLIC_KEY — `{ algorithms: ['RS256'] }` enforced; PEM newline handling via `.replace(/\\n/g, '\n')`
- [x] **3.x.25** `scripts/entrypoint.sh`: CRITICAL_VARS updated — `JWT_SECRET`/`JWT_REFRESH_SECRET` → `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`; container refuses start if missing
- [x] **3.x.26** `backend/jest.setup.js`: replaced hardcoded test secrets with runtime RSA key generation (`generateKeyPairSync`) — no keys ever stored in repo
- [x] **3.x.27** AWS SSM: RSA keypair (2048-bit) generated locally → stored as SecureString/String under `/badge/production/JWT_PRIVATE_KEY` + `JWT_PUBLIC_KEY`; local files deleted immediately after
- [x] **3.x.28** `src/auth/password.js` (NEW): bcryptjs module — `hashPassword()` + `verifyPassword()` with cost 12; ready for Auth0 migration (OWASP minimum: cost 10)
- [x] **3.x.29** `src/app.js`: CORS hardening — removed `localhost` from production fallback; only `https://dataxiom-badge.netlify.app` allowed when CORS_ORIGIN env var not set
- [x] **3.x.30** `.github/workflows/ci.yml`: replaced fake security step with real `npm audit --audit-level=high` + `detect-secrets scan` (KeywordDetector disabled for demo passwords)
- [x] **3.x.31** `scripts/audit-log-retention.js` (NEW): GDPR 7-year retention cleanup — deletes `audit_log` records older than 2555 days; `--dry-run` flag; to be scheduled via AWS EventBridge Scheduler
- [x] **3.x.32** `frontend-web/src/services/authService.js`: login stores `refresh_token`; logout clears it; `getRefreshToken()` + `refreshAccessToken()` methods added
- [x] **3.x.33** `frontend-web/src/services/apiClient.js`: auto-refresh interceptor on 401 — queue-based retry for concurrent requests; single refresh call in flight; redirects to /login on refresh failure

### FASE 5 + Mobile — End-to-End Testing & Fixes (Session 12)
- [x] **3.x.34** `QRScannerScreen.jsx`: fixed `user?.id` → `user?.employee_id` — mock user IDs are non-UUID, Zod validation was rejecting all check-ins with 400
- [x] **3.x.35** RDS migration: `004_add_client_id_to_checkins` applied manually — `client_id` column was missing from `checkins` table (migration existed in repo but never run on current RDS instance)
- [x] **3.x.36** `routes/checkins.js`: `created_by` now uses `employee_id` instead of `req.user.user_id` — mock user IDs are non-UUID strings, DB column is UUID type
- [x] **3.x.37** `QRScannerScreen.jsx`: added IN/OUT toggle UI — green=Entrata, red=Uscita; resets scan state on toggle
- [x] **3.x.38** ✅ VERIFIED END-TO-END on real iPhone via TestFlight: Login → QR scan → IN check-in ✅ → OUT check-in ✅

---

## 🔲 TODO — NEXT PRIORITY

### FASE 3.4 — Web Dashboard: Corrections Page ✅
Manager corrects a check-in (wrong time, missed punch, wrong direction).

- [x] **3.4.1** `CorrectionsPage.jsx` — searchable list of check-ins with "Edit" button
- [x] **3.4.2** Edit modal: change timestamp, type (IN/OUT), add correction note
- [x] **3.4.3** 7-day edit window enforced (backend + frontend; `CORRECTION_WINDOW_EXPIRED` error)
- [x] **3.4.4** Audit trail visible in UI: show "Corretto da X il Y" on corrected entries
- [x] **3.4.5** Route `/corrections` in `App.jsx` (manager + admin only)
- [x] **3.4.6** Link "✏️ Correzioni" in Dashboard navbar
- [x] **3.4.7** Backend: `correction_note TEXT` + `modified_by_name TEXT` columns on checkins
- [x] **3.4.8** Backend: `PUT /api/checkins/:id` — 7-day window, dynamic SET, ownership via JOIN
- [x] **3.4.9** Backend: `audit.js` fixed (no client_id, UUID-safe user_id, non-fatal)

### FASE 3.5 — Web Dashboard: Notifications ✅
Employee gets notified when manager changes their shift.

- [x] **3.5.1** `GET /api/notifications` polling endpoint (backend)
- [x] **3.5.2** Notification record created when shift is saved (backend, best-effort outside transaction)
- [x] **3.5.3** `NotificationBell.jsx` component: icon + unread count badge (MUI Badge + Popover)
- [x] **3.5.4** Notification list dropdown (last 10, mark all read)
- [x] **3.5.5** `useNotifications.js` poll every 30s when employee is logged in
- [x] **3.5.6** Migration 003: notifications table on RDS
- [x] **3.5.7** fix: redis reconnectStrategy — cap at 3 retries to unblock server startup

---

## 🚨 TODO — CRITICO: Prima del Primo Cliente

Identificati nell'analisi critica del 2026-06-09. Tutti bloccanti per l'onboarding del primo cliente reale.

### C.1 — Reset Password Dipendenti
Senza questo ogni dipendente che dimentica la password richiede intervento manuale.

- [x] **C.1.1** Backend: `POST /api/admin/employees/:id/reset-password` — genera nuova temp password (bcrypt cost 12), aggiorna `password_hash` nel DB, restituisce la password in chiaro una volta sola all'admin
- [x] **C.1.2** Frontend AdminPage: bottone "Reset Password" nella tab Dipendenti — mostra la nuova password in un dialog con copia-negli-appunti (stessa UX del temp_password display esistente)
- [x] **C.1.3** Audit log: registra `password_reset` con `user_id` admin che ha eseguito l'azione
- [x] **C.1.4** Test: `admin-reset-password.test.js` — 13 test (happy path, error cases, RBAC guard, audit best-effort, bcrypt format, password randomness)

### C.2 — API Versioning (/api/v1/)
Senza versioning ogni cambiamento breaking all'API rompe l'app mobile in produzione su iPhone dei dipendenti. Non è possibile forzare aggiornamenti immediati su iOS.

- [x] **C.2.1** Backend: `v1Router` monta tutte le route su `/api/v1/`; `/api/` alias deprecato con `logger.warn` per request
- [x] **C.2.2** Frontend web: request interceptor in `apiClient.js` riscrive `/api/` → `/api/v1/` trasparentemente; 401 guard aggiornato a `/api/v1/auth/refresh`
- [x] **C.2.3** Frontend mobile: tutti i path in `endpoints.js` aggiornati a `/api/v1/`
- [x] **C.2.4** `scripts/test-api.sh`: tutti i 23 test aggiornati a `/api/v1/` — 91/91 PASS zero warning
- [x] **C.2.5** Deploy + verifica live: `scripts/test-api.sh` → 23/23 PASS su EC2 produzione — 2026-06-10 ✅

### C.3 — Runbook Operativo
Sei l'unico che sa come rimettere in piedi il sistema. Con il primo cliente, un downtime senza runbook può costare ore invece di minuti.

- [x] **C.3.1** `docs/runbook.md`: procedura di restart EC2+container (ssh → docker ps → docker restart / pull)
- [x] **C.3.2** `docs/runbook.md`: procedura di rollback DB (RDS point-in-time restore step-by-step)
- [x] **C.3.3** `docs/runbook.md`: checklist onboarding nuovo cliente (crea client → crea site → import CSV → genera QR → invia welcome email)
- [x] **C.3.4** `docs/runbook.md`: escalation contacts + SLA informale (es. risposta entro 4h in orario lavorativo)
- [x] **C.3.5** `docs/runbook.md`: credenziali di emergenza e dove trovarle (SSM path reference, non le credenziali stesse)

### C.4 — Token Refresh App Mobile
Access token scade in 15 minuti. Se un dipendente usa l'app per 20 minuti riceve un 401 silenzioso sulla scan QR successiva — check-in perso senza feedback chiaro.

- [x] **C.4.1** `frontend-mobile/services/apiClient.js`: queue-based 401 interceptor — chiama `POST /api/auth/refresh` con il refresh token da AsyncStorage, ritenta la request originale, su refresh failure → clear AsyncStorage + redirect a LoginScreen via navigationRef
- [x] **C.4.2** ✅ Testato manualmente: login → atteso 16 minuti → scan QR → check-in registrato correttamente (no 401 visibile all'utente) — 2026-06-10
- [x] **C.4.3** Build 14: submit su TestFlight con token refresh interceptor ✅ — 2026-06-10

### C.5 — Content Security Policy (Frontend Web) ✅
JWT in localStorage + script da CDN esterni (MUI, Recharts) = superficie XSS significativa su PC condivisi in ambiente retail.

- [x] **C.5.1** `frontend-web/public/_headers` (Netlify): aggiunto CSP header completo (commit 71b7db8)
  - `default-src 'self'` — blocca tutto tranne risorse from own domain
  - `script-src 'self'` — no inline script, no external CDN
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — MUI CSS-in-JS + Google Fonts
  - `connect-src 'self' https://api.dataxiom.it https://*.sentry.io` — API + Sentry only
  - `img-src 'self' data:` — immagini + data URIs per avatar inline
  - `font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com` — web fonts
  - `frame-ancestors 'none'` — no iframe embedding (clickjacking protection)
  - Additional: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`
- [x] **C.5.2** Deploy live su Netlify (push commit 71b7db8) — CSP headers ora active su production
  - Verificare da browser: F12 → Network → selezionare root request → Headers tab
  - Cercare `Content-Security-Policy` header nella risposta
  - Console: no CSP violation warning ("Refused to load the script...")
- [ ] **C.5.3** Phase 2 TODO: migrazione JWT localStorage → httpOnly cookie (richiede backend session endpoint, non MVP-critical)

### C.6 — Test Coverage Gap (Moduli Critici non coperti)
`admin.js` (511 righe, gestisce onboarding clienti reali) e `shifts.js` (388 righe) hanno 0% coverage. Un bug nell'import CSV crea dati corrotti in produzione senza alert.

- [x] **C.6.1** `backend/src/__tests__/admin-csv-import.test.js` ✅ (parziale) — 10 test: CSV import con `assigned_sites` verificato come array nativo (non NULL), sito non trovato → skip, duplicati → skip, debug endpoint diagnosi. Mancano ancora: `POST /api/admin/clients`, `POST /api/admin/sites`, `POST /api/admin/employees` (singolo). Commit: fcebbfe
- [x] **C.6.2** `backend/src/__tests__/shifts.test.js` ✅ — 23 test: GET /my-schedule (6), GET /:siteId (6), GET /:siteId/export (4), POST /:siteId (7). Coverage shifts.js: 11.76%→98.31%. Root cause fix: `jest.clearAllMocks()` non svuota la coda `mockResolvedValueOnce` — mock contaminati da test precedente risolvevano 500 anziché 400.
- [x] **C.6.3** `backend/src/__tests__/export.test.js` ✅ — 11 test: RBAC (employee→403, no token→401, manager wrong site→403), success paths (admin CSV, date filters, manager scoped, empty, truncated 50001→X-Truncated), formula injection prevention (=HYPERLINK, +cmd → prefixed with '). Coverage export.js: 13.75%→88.75%.
- [x] **C.6.4** ✅ Coverage raggiunta: 47.54%→**60.42% statements**, 61.44% lines — target ≥60% superato. 135/135 test passati.

### C.7 — SLA e Contratto Cliente
Senza un SLA formale ogni minuto di downtime è un litigio. Anche un documento minimo protegge entrambe le parti.

- [x] **C.7.1** `docs/sla.md` ✅ — uptime 99%/mese (~7h max), severity CRITICO/ALTO/MEDIO/BASSO con tempi risposta (2h/8h/24h/72h), orari supporto, esclusioni
- [x] **C.7.2** `docs/sla.md §8` ✅ — clausola disdetta: export dati + cancellazione completa entro 30 giorni (GDPR Art. 17), conferma scritta via email
- [x] **C.7.3** `docs/sla.md §5` ✅ — manutenzione programmata: domenica 02:00-04:00 UTC, notifica 48h per straordinaria, esclusa da calcolo uptime

### C.8 — Monitoring App Mobile
Se l'app smette di funzionare per un bug silenzioso (aggiornamento iOS, token scaduto, API incompatibile), nessuno lo sa finché un dipendente si lamenta.

- [x] **C.8.1** ✅ Sentry mobile configurato e attivo — `EXPO_PUBLIC_SENTRY_DSN` confermato in EAS production, `Sentry.wrap(App)` attivo in `App.jsx`, `enableNativeCrashHandling: true`. Crash test su dev build: alla prossima build development, aggiungere `Sentry.captureMessage('test crash')` in App.jsx e verificare su sentry.io → badge-mobile → Issues.
- [x] **C.8.2** ✅ CloudWatch metric filter + alarm creati — `BadgeAPISuccessfulCheckins` (filter: POST */checkins* → 201), alarm `badge-zero-checkins-4h`: 4 periodi consecutivi da 1h con Sum < 1 → email badge-alerts. Stato: INSUFFICIENT_DATA (nessun check-in da quando il filter è attivo — normale per nuovo filtro).
- [x] **C.8.3** ✅ TestFlight Build 14 scade il **2026-09-08** (90gg da 2026-06-10). Reminder rinnovo: **2026-08-25** (75gg). Aggiungere al calendario: "Rinnovare build TestFlight Badge System" per 2026-08-25.
- [x] **C.8.4** ✅ Source map upload abilitato — `frontend-mobile/sentry.properties` creato (org: dataxium, project: badge-mobile), `SENTRY_DISABLE_AUTO_UPLOAD` rimosso da `eas.json`. **Azione utente richiesta prima del prossimo build:** `cd frontend-mobile && eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>` (token: sentry.io → Settings → Auth Tokens, scope `project:releases` + `org:read`)

---

## 🔲 TODO — MEDIUM PRIORITY

### FASE 4 — Mobile App: React Native (~25-35h)
The primary check-in interface for employees.

- [x] **4.1** React Native project scaffold (Expo SDK 54)
- [x] **4.2** Login screen (email + password → JWT → AsyncStorage)
- [x] **4.3** QR code scanner (CameraView + expo-camera barcode scanning)
- [x] **4.4** Face ID authentication (`expo-local-authentication`)
- [x] **4.5** Check-in flow: scan QR → Face ID → POST /api/checkins → confirmation screen
- [x] **4.6** My Schedule screen (read-only, calls `GET /api/shifts/my-schedule`)
- [x] **4.7** My Presences screen (list of own check-ins)
- [x] **4.8** Offline detection + user-friendly error (NetInfo)
- [x] **4.9** App icon, splash screen, push to TestFlight / Play Store internal track
- [x] **4.10** `StorePresencesScreen`: manager view of all store check-ins — date filters (Oggi/7gg/Mese), stats bar (dipendenti/entrate/uscite), employee avatar con iniziali
- [x] **4.11** Manager QR check-in: migration 005 (Diego employee record su RDS), employee_id nel JWT, `CheckInScreen` role-aware (QR + Presenze Store per manager)
- [x] **4.12** Build 6: StorePresencesScreen ✅ testata su iPhone — manager vede presenze store
- [x] **4.13** Build 7: fix duplicate check-in IN (stale closure useState → useRef guard sincrono)
- [x] **4.14** Build 8: fix crash QR scanner (useRef mancante dall'import React)
- [x] **4.15** Build 9: 5 fix da code review (AbortController signal corretto, truncation banner 200 records, initials '?' per nome vuoto, role guard redirect, dead code rimosso) ✅ testata su iPhone

### FASE 5 — QR Code Management ✅
Admin generates and manages QR codes per site.

- [x] **5.1** `GET /api/sites` endpoint (admin: all sites, manager: own site only, employee: 403)
- [x] **5.2** QR code content format: `badge://checkin?site_id=<uuid>&client_id=<uuid>&v=1`
- [x] **5.3** QR code displayed in `/admin/sites` page + PNG download button
- [x] **5.4** Migration 004: updated placeholder QR content to proper format on RDS
- [ ] **5.5** Rotate QR code — Phase 2 (not needed for MVP)

### FASE 6 — Production Hardening (~10-15h)
Before first paying customer.

- [x] **6.1** Sentry integration ATTIVA ✅ — backend (DSN in SSM, @sentry/node, Sentry.setUser per contesto utente), web (VITE_SENTRY_DSN in Netlify, source maps uploadati, DSN nel bundle verificato), mobile (EXPO_PUBLIC_SENTRY_DSN in EAS production, @sentry/react-native, Sentry.wrap). Org: dataxium | Projects: badge-backend / badge-web / badge-mobile. ⚠️ Sentry source map upload DISABILITATO su mobile (`SENTRY_DISABLE_AUTO_UPLOAD=true` in eas.json, commit f072520) — manca `sentry.properties` con org/project. Crash reporting funziona, ma i simboli non sono leggibili su sentry.io. Vedere C.8.4 per abilitarlo.
- [x] **6.2** HTTPS on API (EC2) — Let's Encrypt ✅ (già attivo da Jun 3, scade Sep 1 2026, auto-renewal certbot.timer). Pulizia nginx: rimosso badge-api (server_name _ con self-signed), rimosso /etc/nginx/ssl/. Solo api-dataxiom attivo in sites-enabled.
- [x] **6.3** Custom domain ✅ — `badge.dataxiom.it` → Netlify (custom_domain set, TLS provision post-CNAME), `api.dataxiom.it` → EC2 (già attivo da 6.2). CORS_ORIGIN SSM aggiornato: `badge.dataxiom.it,dataxiom-badge.netlify.app,localhost:5173`. **Azione utente richiesta:** aggiungere CNAME `badge → dataxiom-badge.netlify.app` su register.it.
- [x] **6.4** Load test ✅ — k6, 3 scenari (spike 50 VUs, sustained 10 VUs, dashboard 5 VUs). Risultati: spike 50/50 OK 0 errori 5xx, p95=621ms (target<500ms); sustained p95=179ms ✅; dashboard p95=136ms ✅. Bottleneck: db.t3.micro 1 CPU satura a 50 scritture concorrenti. Fix per <500ms su spike: upgrade a db.t3.small. Per MVP con traffico realistico: ok. Script: scripts/load-test.js. DB_POOL_MAX=20 (optimal per t3.micro, pool=30 era peggiore per CPU contention).
- [x] **6.5** OWASP security review ✅ — 8 findings, 7 fixed (1 open Phase 2). CRITICAL: DISABLE_AUTH production guard (NODE_ENV check), export.js+checkins.js+stats mandatory c.client_id=$1 tenant isolation, resolve*() scoped to client. HIGH: /health db_host/db_port removed, shifts.js notification employee_id validated against client_id. MEDIUM: resolve helpers now pass clientId param. OPEN: localStorage JWT → httpOnly cookie (Phase 2). Commit: eec052a
- [x] **6.6** GDPR retention ✅ — `scripts/audit-log-retention.js`: delete checkins >12m + audit_log >7y, --dry-run flag. `scripts/run-retention.sh`: SSM param fetch wrapper per docker exec. EC2 crontab: `0 2 * * *` UTC → /var/log/badge-retention.log. Tested dry-run: 0 records (seed data giugno 2026). Commit: 1cd1477
- [x] **6.7** CloudWatch alarms ✅ — 8 alarms attivi: EC2 StatusCheck, EC2 CPU>80%, disk>80% (CW agent), RDS CPU>80%, RDS storage<2GB, RDS connections>50, API 5xx>5/5min, API slow>10/5min. SNS badge-alerts → email. pino-http per structured logs + Docker awslogs driver → /badge/api CW Log Group. Metric filters: $.res.statusCode>=500, $.responseTime>1000. Commit: a8dff12
- [x] **6.8** Database backups verified ✅ — RDS `badge-system-db`: backup retention era 0 → abilitato a 1 giorno (free tier max). Snapshot manuale `badge-backup-test-20260608` creato. Restore su `badge-restore-test` completato: 7 tabelle ✅, 338 checkins ✅, 21 employees ✅, 3 clients ✅. Istanza test eliminata post-verifica. Backup window: 02:00-02:30 UTC.

### FASE 7 — First Customer Onboarding (~5-10h)
Go-live with first paying customer (pilota).

- [x] **7.1** Admin panel ✅ — `AdminPage.jsx` `/admin` route (admin-only), tabs Clienti/Sedi/Dipendenti, CSV upload, temp password display + copy button. Navbar link "⚙️ Admin" visibile solo ad admin.
- [x] **7.2** API admin endpoints ✅ — `POST /api/admin/clients`, `POST /api/admin/sites` (QR auto-generato UUID-based), `POST /api/admin/employees` (bcrypt temp password), `GET /api/admin/clients`, `GET /api/admin/sites`. Auth.js extended: DB fallback login con bcrypt verify. Migration 006: `password_hash`, `role`, `site_id` su employees. Commit: 8115eab
- [x] **7.3** CSV bulk import ✅ — `POST /api/admin/employees/import` (multer memory, csv-parse, max 100 righe, parallel bcrypt batches, BEGIN/COMMIT transaction, audit log per ogni riga, ON CONFLICT DO NOTHING). Commit: 9963f4b
- [x] **7.4** ✅ Customer-facing user guide (PDF, Italian) — `docs/guida-utente.html` (print-to-PDF). Copertina + 5 sezioni: intro, dipendenti (download/check-in/presenze/turni), manager (dashboard/correzioni/CSV/planning), FAQ 8 domande, supporto. Aprire nel browser e Stampa → Salva come PDF.
- [x] **7.5** Manager training checklist ✅ — `docs/manager-training-checklist.md`: 7 parti (login, presenze, CSV export, correzioni, planning, QR code, verifica finale) con checklist step-by-step e tabella supporto
- [x] **7.6** Welcome email template ✅ — `scripts/welcome-email-template.html`: HTML responsive con credenziali, CTA login, steps per dipendente/manager, GDPR footer. Commit: 8115eab

---

## 🔲 TODO — NUOVE FEATURE COMMERCIALI (v1.1)

> Design spec completo: `docs/superpowers/specs/2026-06-10-commercial-features-design.md`  
> Obiettivo: rimuovere le 3 principali obiezioni commerciali (prezzo, frode, integrazione paghe)  
> Effort stimato: ~32h totali · Ordine: FASE 8 → FASE 9 → FASE 10

---

### FASE 8 — Portale Commercialista & CSV Paghe (~11h) ✅

**Migration 008/009** (applicata su RDS production 2026-06-11):
- [x] **8.1** `migration 009`: `ALTER TABLE clients ADD COLUMN meal_voucher_hours DECIMAL(4,2) DEFAULT 5.0`; viewer role aggiunto al constraint `employees_role_check`. (`external_employee_id` = matricola era già in migration 008)

**Backend — ruolo viewer:**
- [x] **8.2** `src/middleware/validation.js`: aggiunto `format` enum `generic|zucchetti|teamsystem` in `GetExportCsvSchema`; `AdminViewerSchema` per POST /admin/viewers
- [x] **8.3** viewer role in JWT è gestito automaticamente dall'auth middleware esistente (legge `role` dal DB); `checkins.js PUT /:id`: guard 403 per viewer+employee
- [x] **8.4** `src/routes/admin.js`: `POST /api/admin/viewers` (admin-only, crea viewer con bcrypt temp password) + `GET /api/admin/viewers`
- [x] **8.5** `src/routes/export.js`: `format=zucchetti` (groupZucchetti: una riga/giorno, OreOrdinarie max 8h, OreStraordinarie, H,MM) + `format=teamsystem` (una riga/timbratura, tipo E/U, DD/MM/YYYY)

**Frontend — export formato:**
- [x] **8.6** `ExportButton.jsx`: dropdown MUI Formato (Generico/Zucchetti/TeamSystem); viewer vede solo Zucchetti+TeamSystem; passa `?format=` all'API
- [x] **8.7** `AdminPage.jsx`: nuova tab "Commercialisti" — form crea viewer (email+nome), tabella lista viewers
- [x] **8.8** `AdminPage.jsx`: label "ID Dipendente" → "Matricola" nella tab Dipendenti

**Frontend — layout viewer:**
- [x] **8.9** Navbar già esclude viewer da Correzioni/Planning/Admin (esistenti check `role === 'manager' || role === 'admin'`) — nessuna modifica necessaria
- [x] **8.10** LoginPage già redirige a `/dashboard` per tutti i ruoli — nessuna modifica necessaria

**Test:**
- [x] **8.11** `backend/src/__tests__/export-formats.test.js` ✅ — 15 test: format=zucchetti (7), format=teamsystem (4), viewer access, default generic, invalid format 400
- [x] **8.12** `backend/src/__tests__/admin-viewers.test.js` ✅ — 11 test: POST viewers (RBAC+validazione), GET viewers, viewer RBAC (presenze ✅, corrections ❌, admin ❌). DISABLE_AUTH=false per JWT role check reali. 161/161 totale ✅

---

### FASE 9 — Ore Lavorate & Buoni Pasto (~11h) ✅

*(Migration 008 già eseguita in FASE 8 — contiene anche `meal_voucher_hours`)*

**Backend — calcolo ore:**
- [x] **9.1** `src/utils/hours.js` (nuovo): `calculateDailyHours(checkins)` + `aggregateMonthly()` — greedy IN/OUT pairing, lunch-break sum, open presence detection. Commit: 3e792a0
- [x] **9.2** `src/routes/presences.js` (nuovo): `GET /api/presences/summary?month&year` — per-employee: `{ ore_totali, ore_ordinarie, ore_straordinarie, buoni_pasto, giorni_presenti, presenze_aperte }`. Legge `meal_voucher_hours` da clients
- [x] **9.3** RBAC: admin+viewer → tutti i dipendenti; manager → site-scoped; employee → 403
- [x] **9.4** `PUT /api/admin/settings` in `admin.js` — aggiorna `meal_voucher_hours` per il client dell'admin loggato

**Frontend — Riepilogo Mensile:**
- [x] **9.5** `frontend-web/src/pages/SummaryPage.jsx`: tabella mensile con colonne Nome, Matricola, Giorni, Ore Tot, Ore Ord, Ore Straord, Buoni Pasto, ⚠️ Presenze Aperte + navigazione mese + export CSV
- [x] **9.6** `frontend-web/src/App.jsx`: route `/summary` (admin, manager, viewer via requiredRoles)
- [x] **9.7** `DashboardPage.jsx`: link "📊 Riepilogo" nel navbar (admin, manager, viewer)
- [x] **9.8** `PresencesTable.jsx`: colonna "Ore" client-side (IN/OUT pairing sulla pagina caricata, client-side)
- [x] **9.9** `AdminPage.jsx`: tab "Impostazioni" con campo `meal_voucher_hours` + pulsante Salva

**Test:**
- [x] **9.10** `hours.test.js` ✅ — 17 test: coppia singola, pausa pranzo, presenza aperta, OUT senza IN, multi-day, multi-employee, aggregateMonthly (overtime, meal voucher threshold)
- [x] **9.11** `presences-summary.test.js` ✅ — 12 test: RBAC, meal voucher calc, ore straordinarie, mese vuoto, defaults. 190/190 totale

---

### FASE 10 — Geofencing (~10h) ✅

**Migration 010:**
- [x] **10.1** `migration 010`: `ALTER TABLE sites ADD COLUMN latitude DECIMAL(9,6)`, `longitude DECIMAL(9,6)`, `geofence_radius_meters INT DEFAULT 150`, `geofence_enabled BOOLEAN DEFAULT false`; `ALTER TABLE checkins ADD COLUMN checkin_latitude DECIMAL(9,6)`, `checkin_longitude DECIMAL(9,6)` — applicata su RDS production

**Backend:**
- [x] **10.2** `src/utils/geo.js` (nuovo): `haversineDistance(lat1, lng1, lat2, lng2)` → distanza in metri (Haversine, no deps)
- [x] **10.3** `src/routes/checkins.js`: geofence validation — GEOFENCE_COORDINATES_REQUIRED (400) se mancano lat/lng, GeofenceError 403 OUTSIDE_GEOFENCE con { distance_meters, max_meters } se fuori raggio. Salva coordinate nel record
- [x] **10.4** `src/routes/admin.js`: `PUT /api/admin/sites/:id` — aggiorna latitude, longitude, geofence_radius_meters, geofence_enabled. `GET /api/sites`: ora ritorna anche colonne geofence
- [x] **10.5** `src/middleware/validation.js`: `PostCheckinSchema` aggiunto latitude/longitude opzionali (−90..90, −180..180); `UpdateSiteGeofenceSchema` aggiunto (geofence_enabled bool, radius 50-5000m)

**Mobile:**
- [x] **10.6** `frontend-mobile/app.json`: expo-location nei plugin; `NSLocationWhenInUseUsageDescription` in iOS infoPlist; `ACCESS_FINE_LOCATION` in Android permissions
- [x] **10.7** `frontend-mobile/package.json`: `expo-location ~18.1.5` aggiunto
- [x] **10.8** `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`: `tryGetLocation()` — GPS richiesto prima del POST, graceful fallback se negato; alert "📍 Fuori dalla sede" con distanza/max; alert "📍 GPS richiesto" per GEOFENCE_COORDINATES_REQUIRED
- [ ] **10.9** Build 17: submit su TestFlight con geofencing (richiede `eas build`)

**Frontend Admin:**
- [x] **10.10** `AdminPage.jsx` tab Sedi: `GeofenceDialog` per sede — toggle, lat/lng inputs, raggio, link Google Maps. Colonna "Geofencing" con icona MyLocation (verde/grigia) + chip raggio

**Test:**
- [x] **10.11** `backend/src/__tests__/geo.test.js`: 9 unit test haversineDistance (0m, 100m, 1km, Milan-Rome, antipodi, simmetria, emisfero sud, inside/outside raggio 150m)
- [x] **10.12** `backend/src/__tests__/checkins-geofence.test.js`: 13 integration test. 212/212 totale ✅. Commit: b740dbf

---

## 🔲 TODO — SECURITY TECH DEBT (open findings from code review)

### 🚨 GDPR/Privacy Findings from Session 31 Security Review
**Bloccanti per commercializzazione in Italia — PRIORITÀ MASSIMA**

- [ ] **S.24** Missing GDPR Disclosure for GPS Data Collection (HIGH, Confidence 0.95) — **⏸️ DEFERRED: implementare solo quando il primo cliente richiede il geofencing GPS**
  - **Issue:** Geofencing feature raccoglie coordinate GPS sensibili. Privacy Policy è insufficiente (GDPR Art. 13-14). Geofencing oggi è in produzione ma **disabilitato per default** — nessun cliente lo usa ancora.
  - **Decisione Session 46:** Il geofencing GPS è una feature opzionale. Il rischio GDPR è attivo solo quando un cliente abilita `geofence_enabled=true` su una sede. Finché nessun cliente lo usa, la feature è dormiente e il rischio è teorico. Si implementa S.24 contestualmente all'attivazione del primo geofencing reale.
  - **Piano pronto:** `docs/superpowers/plans/2026-06-20-s24-gdpr-gps-disclosure.md` — 4 task (~3-4h):
    1. Fix `GPSConsentDialog` (AlertDialog → Modal nativo React Native — bug fatale)
    2. Pagina pubblica `privacy-policy-it.html` + `_redirects` Netlify
    3. Script `gps-retention.js` + cron EC2 (cancellazione coordinate dopo 90gg)
    4. Test per `GET /admin/employee-consents` (coverage gap)
  - **Trigger:** Primo cliente che chiede geofencing → esegui il piano → deploy → poi abilita geofencing sulla sede

- [x] **S.25** Missing Data Processing Agreement (DPA) — GDPR Art. 28 (HIGH) — ✅ **COMPLETATO Session 47 (2026-06-21)**
  - **Fix:** `req.user.id` → `req.user.user_id` in `admin.js:158,172` — bug silenzioso che avrebbe causato FK violation in produzione
  - **Test:** 8 test TDD in `backend/src/__tests__/admin-dpa.test.js` (POST 201/400/403/401, GET 200/empty/403)
  - **Pagina HTML:** `frontend-web/public/dpa-template-it.html` — template DPA v2.0 stampabile, accessibile su `badge.dataxiom.it/dpa-template-it`
  - **Frontend:** Tab 7 "DPA" in AdminPage (`DpaTab.jsx`) — status banner, download link, form registra firma, storico
  - **Commits:** a67f3aa (fix+test), ea2d708 (HTML+redirects), 75ac619 (DpaTab)
  - **Da fare prima del primo contratto:** aprire tab DPA → scaricare template → farlo firmare al cliente → registrare firma nel tab → archiviare PDF

- [ ] **S.26** Missing Explicit Consent Mechanism for GPS Data Collection — GDPR Art. 7 (HIGH, Confidence 0.85)
  - **Issue:** Geofencing abilitato per default (migration 010 `DEFAULT true`) senza consenso dipendente. GDPR Art. 7 richiede consenso: freely given, specific, informed, unambiguous. Se base legale è consenso (non contratto), senza consenso dichiarato è illegittimo. Impact: Privacy violazione, regolatore può forzare disabilitazione feature.
  - **TODO:**
    1. DB: colonna `employees.gps_consent_given` (boolean DEFAULT false) + tabella `employee_consent_log` (employee_id, consent_type, timestamp, version)
    2. Mobile app (QRScannerScreen): prima di primo POST /api/checkins con GPS, mostra dialog "Il datore di lavoro richiede localizzazione GPS per il check-in. Dati usati solo per verificare sei in sede, cancellati dopo 90 giorni. Vedi Privacy Policy: <link>. [Accetto] [Rifiuto]" → POST /api/consent/gps-acceptance (con version=2.0)
    3. Backend: `POST /api/consent/gps-acceptance` → aggiorna `employees.gps_consent_given=true`, log in audit_log, soft-gate: se gps_consent_given=false e geofencing_enabled=true, POST /api/checkins ritorna 403 CONSENT_REQUIRED (non 400, così è chiaro cosa serve)
    4. AdminPage: nuova sezione "Consensi GPS" — tabella employees con colonna "GPS Accettato" (sì/no/data), bottone "Notifica dipendenti" (send email reminder)
  - **Effort:** 4-5 ore
  - **Success:** Dipendente vede consent dialog prima di primo GPS checkin, accettazione loggata in audit_log, admin vede storico consensi

---

### Trovati nella sessione 17 — non critici per MVP, da chiudere prima del lancio

- [x] **S.1** `auth.js:34` ✅ — DEMO_USERS limitati a `@badge.local`, tutti gli altri email usano DB bcrypt. Migration 007: password_hash per 4 seeded employees. Commit: d06e41e: se un admin crea un employee reale con la stessa email di un account demo (es. `pippo@badge.local`), il check demo vince sempre. **Fix:** eliminare o isolare DEMO_USERS su `NODE_ENV !== 'production'` oppure invertire l'ordine (DB check prima, DEMO fallback per i soli domini `@badge.local`). Da completare prima del lancio con il primo cliente.
- [x] **S.2** `AdminPage.jsx:476` ✅ — Rimosso dead code: guard `user?.role !== 'admin'` e dichiarazione `user` non più necessaria. `ProtectedRoute` è il gate autoritativo.

### Trovati nella sessione 19 — analisi senior-fullstack + senior-qa + senior-security (22 findings)

**4 CRITICAL — tutti fixati in commit bd338ef:**
- [x] **S.3** `admin.js:13` — `AuthorizationError` non esiste in `utils/errors.js` → TypeError crash per tutti i non-admin su `/api/admin/*`. Fix: → `ForbiddenError`.
- [x] **S.4** `pool.js:26` — `rejectUnauthorized: false` hardcoded in prod → MITM possibile su EC2→RDS. Fix: env var `DB_SSL_REJECT_UNAUTHORIZED` (default `true`). SSM: impostato `false` temporaneamente (CA non nel trust store container Alpine).
- [x] **S.5** `auth.js:37-80` — 5 password DEMO_USERS hardcoded in source code committato su GitHub. Fix: → `process.env.DEMO_*_PASSWORD`. Aggiunte su SSM `/badge/production/DEMO_*_PASSWORD`.
- [x] **S.6** `rateLimiter.js` — MemoryStore (default) resettato ad ogni riavvio container → brute-force su `/api/auth/login` possibile dopo crash. Fix: store ibrido Redis+memory. `Retry-After` ora prima di `res.json()`.

**3 ridondanze frontend fixate (commit bd338ef):**
- [x] **S.7** `LoginPage.jsx` — password prefillate in `useState` + hint box con tutte le credenziali visibile in produzione. Fix: `useState('')` + `{import.meta.env.DEV && ...}`.
- [x] **S.8** `frontend-mobile/endpoints.js` — `DEMO_ACCOUNTS.password: 'Diego1975'` nel bundle iOS. Fix: campo `password` rimosso.
- [x] **S.9** `frontend-mobile/LoginScreen.jsx` — `{DEMO_ACCOUNTS.password}` a schermo in tutti i build. Fix: `{__DEV__ && ...}` + solo email mostrata.

**6 HIGH — ✅ tutti fixati (Session 20):**
- [x] **S.10** `export.js:137` — `LIMIT 50000` + header `X-Total-Count` + `X-Truncated: true` se raggiunto.
- [x] **S.11** `shifts.js` — validazione `employee_id` spostata PRIMA del `withTransaction` → fail fast, no rollback costoso.
- [x] **S.12** `validation.js:379` — password min 6 → **8** char (NIST SP 800-63B).
- [x] **S.13** `admin.js` — `LIMIT 500` su GET /clients, GET /sites, GET /employees + `total` nel response body.
- [x] **S.14** `pool.js` — `statement_timeout` 120000 → **30000** ms.

**5 MEDIUM — ✅ tutti fixati (Session 20):**
- [x] **S.15** `app.js` — Sentry `beforeSend` scrubba `authorization`, `password`, `token`, `cookie`, `x-api-key`.
- [x] **S.16** Creato `src/utils/logger.js` singleton — export.js, checkins.js, audit.js, shifts.js ora condividono un'unica istanza Pino.
- [x] **S.17** Creato `src/utils/resolvers.js` — `resolveEmployeeId`/`resolveSiteId` estratti, rimossi da export.js e checkins.js.
- [x] **S.18** `shifts.js` — `logAudit(pool, ...)` aggiunto dopo `withTransaction`: registra `shift_created`/`shift_updated` con old/new value.
- [x] **S.19** `app.js` — `app.set('trust proxy', 1)` prima di tutto il middleware → `req.ip` ora riflette il client reale.

**4 LOW — backlog:**
- [x] **S.20** `app.js` ✅ — `dotenv.config()` spostato prima di tutti i `require()` (salvo Sentry che deve restare primo per instrumentazione).
- [x] **S.21** `app.js` ✅ — Rimosso commento stale `// Deployment test - mar 2 giu 2026`.
- [x] **S.22** ✅ — `uuid` package rimosso, sostituito con `crypto.randomUUID()` (Node 20+ builtin). `npm uninstall uuid` eseguito.
- [x] **S.23** ✅ Test coverage 9% → 40.37% statements / 41.34% lines. 78 test passati (0 falliti). 5 nuovi file di test con mock pool/Redis/rateLimiter.

---

## 🔲 TODO — LOW PRIORITY / PHASE 2

### Auth0 Migration (~5h)
*Trigger: when Badge System generates first revenue*

- [ ] **A.1** Auth0 tenant setup (eu region, badge-system app)
- [ ] **A.2** Replace mock DEMO_USERS in `backend/src/routes/auth.js`
- [ ] **A.3** Auth0 SDK integration in backend (token validation)
- [ ] **A.4** Auth0 Rules for role assignment (manager, employee, admin)
- [ ] **A.5** Face ID via Auth0 Biometric (or native device biometric + Auth0 MFA)
- [ ] **A.6** User management UI (Auth0 dashboard or custom)

### Advanced Planning Features (~5h)
- [x] **P.1** "Copia Settimana" button — copy week's shifts to next week ✅ Session 44
- [x] **P.2** PDF export of monthly planning (printable format) ✅ Session 44
- [x] **P.3** Double-shift warning (same employee assigned twice in one day) ✅ Session 44
- [x] **P.4** Weekly view (7 days instead of full month) ✅ Session 44

### Offline Mode (~10h)
- [ ] **O.1** Service Worker for mobile app offline caching
- [ ] **O.2** Queue check-ins when offline, sync when reconnected
- [ ] **O.3** Offline shift viewing (read-only cached schedule)

---

## 📋 SESSION LOG

| Date | Session | Completed | Notes |
|------|---------|-----------|-------|
| 2026-05-28 | Infrastructure Setup | 1.1–1.4 | GitHub, AWS, Docker, CI/CD |
| 2026-06-01 | Backend Deployment | 1.5, 1.6, 2.1–2.5 | DB schema, seed data, core API |
| 2026-06-02 | Backend Fixes + Testing | 2.6–2.12 | Transactions, pagination, audit log |
| 2026-06-03 | Auth + Dashboard | 3.1.1–3.1.5, 3.2.1–3.2.7 | Login, dashboard, CSV, HTTPS |
| 2026-06-04 | Role Filtering + Planning | 3.2.5, 3.3.1–3.3.9 | RBAC, shift matrix, employee view |
| 2026-06-04 | Deploy Tooling + CORS | 2.13, 3.x.1, 3.x.2 | deploy.sh, /deploy skill, CORS fix |
| 2026-06-05 | Corrections Page | 3.4.1–3.4.9 | CorrectionsPage, PUT checkins, audit fix |
| 2026-06-05 | Notifications | 3.5.1–3.5.7 | NotificationBell, polling, redis startup fix |
| 2026-06-05 | QR Code Management | 5.1–5.4 | GET /api/sites, SitesPage, PNG download, migration 004 |
| 2026-06-05 | Mobile App (Part 1) | 4.1–4.8 | Expo SDK 54, login flow, QR scanner (CameraView), Face ID, flow fixes |
| 2026-06-06 | FASE 4.1 Config Review | — | 7 config sources consolidated → 1, 3 critical bugs fixed, 97% production ready |
| 2026-06-06 | FASE 4.2 Device Testing Plan | — | Comprehensive testing plan (50+ scenarios), build instructions, readiness verification |
| 2026-06-07 | DevOps + Security (Session 9) | 3.x.3–3.x.14 | RBAC fixes, `/api-test` skill (23 tests), CI port-conflict fix, `wait-healthy.sh`, SSM Parameter Store bootstrap (14 params, IAM policy, entrypoint.sh — 23/23 ✅) |
| 2026-06-07 | Code Review + Fixes (Session 10) | 3.x.15–3.x.22 | Multi-angle code review (7 findings: 2 critical, 3 medium, 2 low) — JWT_SECRET fail-fast, RBAC export, next(err), fetchStats errors, race conditions, PlanningPage UX, apiClient cleanup. Jest setup fix. 17/17 ✅ deploy verified 12/12 ✅ |
| 2026-06-08 | MASVS L1 Security Baseline (Session 11) | 3.x.23–3.x.33 | JWT HS256→RS256 (15min access + 7d refresh, SSM keypair), bcryptjs module (cost 12), CORS localhost rimosso, CI npm audit + detect-secrets, GDPR audit-log retention script, frontend auto-refresh interceptor. Commits: f1837b6 + 184da25. 17/17 ✅ produzione RS256 verificata. |
| 2026-06-08 | FASE 4.9 + E2E Testing (Session 12) | 4.9, 3.x.34–3.x.38 | TestFlight ✅ (build 5). 3 bug critici fixati: employee_id UUID, client_id migration RDS, created_by UUID. IN/OUT toggle aggiunto. Flusso core verificato su iPhone reale. Commits: e2ee6f5→76aa4ba |
| 2026-06-08 | Manager Mobile Features + Build 9 (Session 13) | 4.10–4.15 | StorePresencesScreen (manager vede presenze store). Manager QR check-in (migration 005, employee_id JWT). Build 6→7→8→9: fix duplicate IN (useRef), fix crash import, 5 code review fixes (AbortController, truncation, initials, role guard, dead code). Build 9 ✅ testata su iPhone. Commit: 82e93fc |
| 2026-06-08 | FASE 6.1 Sentry + 6.2 HTTPS + 6.4 Load Test (Session 14) | 6.1, 6.2, 6.4 | Sentry attivo su 3 componenti (backend SSM, web Netlify, mobile EAS). HTTPS EC2 cleanup nginx. Load test k6: spike 50 VUs (100% OK, p95=621ms), sustained p95=179ms ✅, dashboard p95=136ms ✅. 0 crash/5xx. Bottleneck: db.t3.micro CPU a 50 write concorrenti. DB_POOL_MAX=20 ottimale. Script: scripts/load-test.js |
| 2026-06-13 | S.32: Error Prevention + S.32.6 ChangePasswordPage (Session 33) | S.32.1-S.32.7, S.32.6 Tasks 6-8 | MEMORY + CLAUDE.md + 3-level prevention system (demo-users.js fixture, validate-demo-users.js script, ecosystem.config.js PM2). Critical bug analysis + ChangePasswordPage component (Opzione B: intelligent error handling), PasswordChangeGuard (Opzione A: fail-closed redirect), E2E test suite documented. Design finalized via /grill-me (4 UX/security decisions). Frontend build ✅ 5.53s. Commits: adda37b (UUID fix), 45e55c4 (prevention), 38af0cc (ChangePassword). S.32.6 ✅ COMPLETE (backend 283+/283 tests, frontend ready). |
| 2026-06-08 | FASE 6.5 OWASP Security Review (Session 14 cont.) | 6.5 | 8 findings: 3 critical (DISABLE_AUTH prod guard, tenant isolation GET/CSV/stats), 2 high (/health info leak, shifts notification validation), 2 medium (resolve helpers scoped), 1 open (localStorage→httpOnly Phase 2). 17/17 tests ✅. Deploy verified: /health clean, auth enforced. Commit: eec052a |
| 2026-06-08 | FASE 6.7 + 6.6 (Session 15) | 6.6, 6.7 | CloudWatch: 8 alarms (EC2 status/CPU/disk, RDS CPU/storage/connections, API 5xx/slow), SNS email, CW agent, awslogs Docker driver, pino-http. GDPR: retention script (checkins >12m + audit_log >7y), cron 02:00 UTC. Commits: a8dff12, 1cd1477 |
| 2026-06-08 | FASE 6.8 (Session 16) | 6.8 | RDS backup retention 0→1 (free tier max). Snapshot `badge-backup-test-20260608`. Restore `badge-restore-test` verificato: 7 tabelle + dati intatti. Istanza test eliminata. |
| 2026-06-08 | FASE 7.1-7.3 + 7.6 (Session 16) | 7.1, 7.2, 7.3, 7.6 | Migration 006 (password_hash+role+site_id). /api/admin routes (clients/sites/employees/CSV import). Auth.js DB fallback. AdminPage (3 tab). Welcome email template. Commit: 8115eab |
| 2026-06-08 | Deep Code Review FASE 6+7 (Session 17) | S.1 parziale | 8 findings (2 critical, 2 high, 2 medium, 2 low). Fixati 6: /refresh DB lookup, cross-tenant login client_id, assigned_sites ownership check (entrambe route), audit_log per admin writes, UUID regex strict, useFetch AbortController. Aperti 2: DEMO_USERS bypass (S.1), dead role guard (S.2). Commit: 6bd7651 |
| 2026-06-08 | Code Review FASE 7 + 8 Fix (Session 18) | S.1 chiuso | Deep review FASE 7 admin panel: 8 findings ALL CONFIRMED, ALL FIXED. F1: CSV bcrypt parallel batches (event loop protection). F2: audit log CSV import (GDPR). F3: UUID guard /refresh (legacy token crash). F4: multi-tenant email guard + mobile clientId param. F5: assigned_sites $8::UUID[] (fragile $N fix). F6: CSV BEGIN/COMMIT transaction. F7: temp_password fuori da Alert string + Sentry scrubber. F8: createValidationMiddleware per admin POST routes. ESLint 0 warnings, build OK. Commit: 9963f4b |
| 2026-06-08 | 3-Skill Security Audit (Session 19) | S.3–S.9 | senior-fullstack + senior-qa + senior-security: 22 findings. 4 CRITICAL + 3 ridondanze frontend fixate (commit bd338ef). 6 HIGH aperti. EC2 SSM aggiornato: 6 nuovi parametri (DEMO_*_PASSWORD + DB_SSL_REJECT_UNAUTHORIZED). Login demo verificato su produzione. |
| 2026-06-09 | Security Fixes HIGH+MEDIUM (Session 20) | S.10–S.19 | 6 HIGH fixati: LIMIT 50000 export, employee_id pre-transaction, password min 8, LIMIT 500 admin lists, statement_timeout 30s. 5 MEDIUM fixati: Sentry scrubber, logger singleton, resolvers.js utility, shifts audit_log, trust proxy. CSV import limit 100→500. ESLint 0 warnings (argsIgnorePattern ^_). |
| 2026-06-09 | FASE 6.3 Custom Domain (Session 21) | 6.3 | `badge.dataxiom.it` → Netlify (custom_domain set). `api.dataxiom.it` → EC2 già attivo. CORS_ORIGIN SSM aggiornato. CNAME aggiunto su register.it. Let's Encrypt provisioned. E2E verificato. |
| 2026-06-09 | Tech Debt LOW (Session 21 cont.) | S.2, S.20, S.21, S.22 | S.2: rimosso dead role guard AdminPage. S.20: dotenv.config() spostato prima dei require. S.21: stale comment rimosso. S.22: uuid→crypto.randomUUID(), pacchetto rimosso. |
| 2026-06-09 | Test Coverage S.23 (Session 22) | S.23 | 5 nuovi file di test con mock pool/Redis/rateLimiter: auth.test.js (22), checkins.test.js (16), middleware.test.js (15), errors.test.js (16), employees.test.js (9). Coverage: 19% → 40.37% statements, 41.34% lines. 78/78 test passati. |
| 2026-06-09 | Guida Utente PDF 7.4 (Session 22 cont.) | 7.4 | docs/guida-utente.html — print-to-PDF A4. Copertina navy, 7 pagine, 5 sezioni: intro, dipendenti (mobile app), manager (dashboard+planning+CSV), FAQ (8 voci), supporto. Aprire nel browser e stampare su PDF. |
| 2026-06-09 | C.1 Reset Password + 3 Code Review Fix (Session 23) | C.1 ✅ | POST /api/admin/employees/:id/reset-password. Code review: SELECT+UPDATE → UPDATE...RETURNING atomico, logger singleton, logAudit.catch() logger.warn. Test aggiornati: 91/91 PASS. Commit: 4022dd6. |
| 2026-06-09 | C.5 Content Security Policy (Session 24) | C.5 ✅ | frontend-web/public/_headers con CSP policy (default-src, script-src, style-src Google Fonts, connect-src API+Sentry, frame-ancestors none) + security headers (nosniff, DENY, XSS-Protection). Commit: 71b7db8. Deploy live su Netlify (1-3 min). |
| 2026-06-10 | CSV Import Verification + Test Coverage (Session 25) | C.6.1 parziale | Verifica bug assigned_sites NULL (commit ecf3620 — parameterized query fix). Root cause analizzata: string interpolation ARRAY[uuid::uuid] causava disallineamento parametri. Debug endpoint diagnostico (f671c5b, c6479f0). 10 nuovi test in admin-csv-import.test.js: assigned_sites array nativo verificato, sito non trovato → skip, duplicati, debug endpoint. 101/101 test passati. Coverage 40.37% → 47.54%. Commit: fcebbfe |
| 2026-06-10 | QR Code Fix Live + Code Review (Session 26) | — | QR code verificato su iPhone reale: Torino Store ✅ (Maria Rossi) + Milano Store ✅ (Francesca). EC2 deploy riuscito (commit 530ec75 → Deploy to EC2 success). Fix ESLint bloccante CI/CD: admin-csv-import.test.js (doppi apici + unused vars), admin-reset-password.test.js (doppi apici), auth.test.js (verifyPassword unused). Code review admin.js: 4 finding fixati — (1) debug endpoint irraggiungibile da manager: spostato prima del middleware admin-only (era dead code), (2) `res.status(404).json()` → `next(new NotFoundError())` per rispettare error handler centralizzato, (3) UUID validation su employeeId param mancante, (4) requireAuth ridondante rimosso. Commits: 530ec75, dccd135. 10/10 test admin-csv-import passati post-refactor. |
| 2026-06-10 | Test Coverage C.6.2+C.6.3+C.6.4 (Session 27) | C.6.2 ✅, C.6.3 ✅, C.6.4 ✅ | shifts.test.js: 23 test (GET my-schedule, GET/:siteId, GET/:siteId/export, POST/:siteId) — shifts.js coverage 11%→98%. export.test.js: 11 test (RBAC, success paths, formula injection) — export.js coverage 14%→89%. Root cause fix: `jest.clearAllMocks()` non svuota coda `mockResolvedValueOnce` — 6 valori residui dal test precedente (`shifts_data: {}` bloccato da Zod) contaminano il test successivo e trasformano un 400 in 500. Fix: test usa `shifts_data` non-vuoto e consuma tutti i mock. 135/135 pass. Coverage 47.54%→60.42% ✅ |
| 2026-06-10 | C.4.2 + C.7 + C.8 (Session 27 cont.) | C.4.2 ✅, C.7 ✅, C.8 ✅ | C.4.2: token refresh verificato su iPhone — login → 16 min → scan QR → check-in OK, no 401. C.7: `docs/sla.md` creato (uptime 99%, severity SLA, manutenzione dom 02-04 UTC, GDPR cancellazione 30gg). C.8: CloudWatch metric filter `BadgeAPISuccessfulCheckins` + alarm `badge-zero-checkins-4h` (4×1h periodi consecutivi a 0 → email). Sentry source maps: `sentry.properties` creato, `SENTRY_DISABLE_AUTO_UPLOAD` rimosso da eas.json. TestFlight reminder: scadenza 2026-09-08, rinnovo entro 2026-08-25. Azione richiesta: `eas secret:create SENTRY_AUTH_TOKEN`. |
| 2026-06-11 | FASE 8 Portale Commercialista (Session 28) | 8.1–8.12 ✅ | viewer role (RBAC 4°): read presenze+export, blocco correzioni+admin. export.js: format=zucchetti (groupZucchetti, OreOrdinarie/Straordinarie, H,MM) + format=teamsystem (per-timbratura, tipo E/U). Migration 009 su RDS (meal_voucher_hours, viewer constraint). Admin viewers endpoint. ExportButton dropdown + AdminPage tab Commercialisti. DISABLE_AUTH=false pattern nei nuovi test. 161/161 ✅ lint 0 errori. Deploy Netlify ✅, deploy EC2 via CI/CD. Commit: f9c3080 |
| 2026-06-11 | FASE 9 Ore Lavorate & Buoni Pasto (Session 29) | 9.1–9.11 ✅ | hours.js: calculateDailyHours (greedy IN/OUT pairing, lunch-break sum, open presence) + aggregateMonthly (ore ord/straord, buoni pasto, giorni). presences.js: GET /api/presences/summary (RBAC: employee→403, manager→site-scoped, admin+viewer→all, meal_voucher_hours da clients). admin.js: PUT /api/admin/settings. SummaryPage.jsx: tabella mensile + navigazione mese + export CSV. PresencesTable: colonna Ore client-side. AdminPage: tab Impostazioni. App.jsx: route /summary. 190/190 test ✅ lint 0 errori. Commit: 3e792a0 |
| 2026-06-11 | FASE 10 Geofencing (Session 30) | 10.1–10.12 ✅ | backend: migration 010 (lat/lng/geofence_radius_meters/geofence_enabled su sites, checkin_lat/lng su checkins). geo.js haversine. GeofenceError (403 OUTSIDE_GEOFENCE + distance_meters). checkins.js: geofence validation post-assegnazione. PUT /api/admin/sites/:id. admin.js: GET sites include geofence columns. mobile: expo-location (tryGetLocation opzionale), payload lat/lng, alert "Fuori dalla sede". AdminPage: GeofenceDialog (toggle+lat/lng+raggio), colonna Geofencing con chip "150m". 22 nuovi test (geo.test.js + checkins-geofence.test.js). 212/212 ✅. Commits: b740dbf, 13c67e5 |
| 2026-06-11 | Bug Fix + FASE 8/9/10 Dashboard Testing (Session 31) | — | 3 bug produzione fixati: (1) presences.js `FROM check_ins` → `FROM checkins` (commit 5aee3f3), (2) presences.js `e.matricola` → `e.external_employee_id AS matricola` su 3 occorrenze (commit 0054404), (3) admin.js GET /sites mancavano geofence columns → GeofenceDialog non pre-popolava (commit ea156fa). Web dashboard FASE 8/9/10 verificata via browser: viewer RBAC ✅, SummaryPage ore+buoni pasto ✅, Impostazioni meal_voucher_hours save/reload ✅, GeofenceDialog pre-populate ✅. Deploy Netlify frontend ✅. EAS Build 17 pending (in attesa conferma). |
| 2026-06-11 | Final Code Review + Security Audit (Session 32) | — | Max-effort code review FASE 8-10 (5 CRITICAL + 6 MEDIUM + 4 deferred findings). All 11 fixes implemented + tested: logAudit pool param, presences ANY(assigned_sites), clientGeofencingEnabled wrong client, geofence feature flag !== false, settings dialog error handling, meal_voucher_hours optional, coordinate validation, assigned_sites .min(1), GeofenceDialog client flag, audit error logging, response validation. 216/216 test ✅. Security review identified 3 GDPR blockers: S.24 (GPS disclosure), S.25 (DPA template), S.26 (consent mechanism) — registered in TASKS.md SECURITY TECH DEBT section, PRIORITÀ MASSIMA for Italian market launch. Commit: 76ec7ef |
| 2026-06-12 | S.32.7 Refresh Token Rotation + Revocation — COMPLETE (Session 33 D) | S.32.7 ✅ | **All 5 Tasks Complete + Critical Bug Fixed** — Task 1: Migrations 016/017/018 (8 security fixes). Task 2: POST /refresh endpoint with token rotation + reuse detection. Task 3: POST /revoke-session endpoint with universal blacklist. Task 4: checkRevoked() middleware (pre-request enforcement). Task 5: useTokenRefresh hook + axios interceptor (frontend). **Critical Bug Fix:** Commit 907a6fb removed jti insert from login endpoint (was blocking all first refreshes). **Final Status:** 354/354 backend tests ✅, 30+ frontend tests ✅, All 8 security fixes verified ✅, Code quality APPROVED FOR PRODUCTION ✅, Security review APPROVED FOR PRODUCTION ✅. Key commits: afdf2e3, a314be3, 64a5e69, 0e33d01, fc9345f, 2dbf0cd, 907a6fb. Ready for merge to main and immediate deployment. |
| 2026-06-11 | GDPR Blockers + Safe Implementation + Monitoring (Session 33 A→B→C) | S.24 ✅, S.25 ✅, S.26 ✅ | **Part A — Implementation:** GPS Privacy Policy IT, DPA template, GPSConsentDialog, migrations 011/012, backend + frontend endpoints for DPA + consent. All 216 tests PASS. Commit: b6684ac. **Part B — Test Coverage (Safe Path):** consent.test.js (11 comprehensive tests), coverage 36%→90.9%, total tests 216→227 all PASS. Commit: e0b24e3. **Part B.2 — Migration Instructions:** apply-migrations-011-012.sh + MIGRATION-011-012-INSTRUCTIONS.md (3 safe methods). Commit: 7ddfc4b. **Part C — Admin Monitoring:** AdminPage tab 6 "Consensi GPS" with ConsentTab component, summary cards (Total/Consented/Pending/Rate %), employee table with consent status, notify button (Phase 2). Backend: GET /api/consent/admin/employee-consents (admin-only). Commit: f34f1fd. Ready for: (1) Apply migrations RDS, (2) Build 18 mobile, (3) Notify feature Phase 2. |
| 2026-06-13 | Leave Management Feature — COMPLETE (Session 34) | Tasks 1-9 ✅ | **All 9 tasks delivered + production ready:** Task 1: DB schema (leaves, leave_requests, leave_saldi tables + indexes). Task 2: 7 API endpoints (POST request, GET pending, PUT approve, GET my-requests, GET all, GET approved, GET admin/saldi). Task 3: LeaveCalendar component (date-range picker, MUI). Tasks 4-7: Frontend pages (EmployeeLeaveRequest, ManagerLeaveRequest, ManagerLeaveApprovalPanel, AdminLeaveManagement with 5 tabs). Task 8: GET /approved endpoint (RBAC-scoped). Task 9: PlanningPage integration (hard-block shifts on approved leave dates, visual indicators red background + lock icon + tooltip). **Testing:** 52/52 tests passing (18 backend + 28 frontend hooks + 6 blocking logic). **Build:** 100% success, no errors. **RBAC:** All endpoints fail-closed, fully scoped by role + site. **Ready for:** Production deployment, customer use. HANDOFF.md updated. Commits: 35aed34 (Task 9 final), 31537b1 (HANDOFF update). |
| 2026-06-13 | Task 10: EmployeeLeaveRequest Form Redesign (Session 35) | ✅ COMPLETED | **Form Layout Redesign per User Feedback:** (1) Titolo: "Richiedi ferie/malattia" ✅. (2) Layout split: Dropdown "Tipo Feria" (left) + "Richiedi Malattia" button (right, green state-aware) ✅. (3) Conditional file upload: visible solo se isRequestingMalattia=true, posizionato tra calendario e note, drag-drop styling con border dashed ✅. (4) Enhanced calendar styling: striscia selezione background #3b82f6 (blue-500) + border #2563eb (blue-600), white text, hover #2563eb ✅. **Code:** EmployeeLeaveRequest.jsx (new state, handlers, layout refactor, file upload Box). LeaveCalendar.jsx (styling for isRangeDay + isSelectedDay). Test file (3 new Malattia tests). **Manual Testing:** Localhost ✅ — title visible, layout OK, button state changes, file upload conditional rendering works, calendar styling (blue range + borders visible), dropdown disabled when Malattia active. **Commit:** 4d55703. **Next:** Fix backend UUIDs + missing schema. |
| 2026-06-14 | S.32.6 Complete — Forced Password Change Flow + Bug Fixes (Session 34) | S.32.6 ✅ | **All 8 Tasks VERIFIED END-TO-END ✅** — CSV import + Admin reset password both trigger mandatory password change. **3 CRITICAL BUG FIXES:** (1) audit_log column timestamp→created_at (transaction abort fix). (2) requireAuth middleware DISABLE_AUTH logic fixed (was ignoring real tokens, now extracts employee_id). (3) POST /change-password missing refresh_token+user in response (added). **Frontend fixes:** (4) authService saves must_change_password to localStorage, (5) PasswordChangeGuard reads from correct localStorage key, (6) ChangePasswordPage logout + redirect to /login (not dashboard). **Flow:** Admin reset password→set must_change_password=true → Employee login with temp password → auto-redirect /change-password → change password → logout → redirect /login → login with new password → dashboard. **Testing:** Manual E2E verified ✅ (CSV import flow ✅, Admin reset flow ✅). **Commits:** c84aebe (3 backend fixes), 8bf849f (5 frontend fixes + redirect flow). |
| 2026-06-14 | Task 11 Phase 2 COMPLETE + Malattia System (Session 38) | Task 11 Phase 2 ✅, Task 11 Phase 3 🟡 | **Phase 2: 17/17 test cases PASSING ✅** — F5 (admin vede tutto), F6 (manager filtra sede), F7 (employee vede solo sé), M1 (malattia auto-approvata), M2 (admin gestione), M3 (blocco Planning). **Malattia System COMPLETE:** backend (5 endpoint: POST /report, GET /admin, GET /manager, GET /by-date-range RBAC, DELETE soft), frontend (/illnesses/report employee, /admin/illnesses admin, ManagerIllnessModal, useIllness hook). **Dashboard navbar:** 🏥 Malattia (employee) + 🏥 Malattie (admin). **EmployeeShiftsPage:** giorni malattia mostrano `⚕️ Malattia` (badge rosso, background rosso), card "Giorni di Malattia". **3 Bug Fix in sessione:** (1) apiClient vs fetch raw (401 fix), (2) `updated_at` inesistente in UPDATE query (500 fix), (3) FK `cancelled_by→employees` rimossa per admin (500 fix — ALTER TABLE live). **Commit:** 9b327bc. **Rimanente:** 11.13 role-based visibility test. |
| 2026-06-15 | S.32.8 Split file monolitici + Task 11.13 RBAC — COMPLETE (Session 39) | S.32.8 ✅, Task 11 ✅ | **S.32.8 Frontend (9 task):** AdminPage.jsx 1455→50 righe (thin shell). 5 shared components (`admin/components/`: useFetch, ConfirmDeleteDialog, ConfirmSaveDialog, CopyButton, ResetPasswordDialog). 6 tab components (`admin/tabs/`: ConsentTab, ClientsTab, SitesTab+GeofenceDialog, EmployeesTab, ViewersTab, SettingsTab). 4 code review findings fixati prima del commit: EmployeeIllnessReport migrata a useIllness hook (rimosso apiClient.post diretto), `disabled={loading}` aggiunto a Dashboard button in 3 pagine. **S.32.8 Backend (5 sub-router):** admin.js 959→241 righe. `admin/clients.js` (95r), `admin/sites.js` (146r), `admin/employees.js` (341r, include CSV import + reset-password), `admin/viewers.js` (88r), `admin/settings.js` (59r). `s326-csv-temp-password.test.js` aggiornato. Zero nuove regressioni test. **Task 11.13 RBAC (6/6 PASS):** Employee→/leave/my-requests: 7 record solo user_id=Maria ✅. Manager→/leave/all: 403 FORBIDDEN ✅. Manager→/leave/pending: 0 PENDING (DB vuoto) ✅. Admin→/leave/all: 9 record da 3 dipendenti ✅. Employee→/illnesses/admin: 403 ✅. Employee→/leave/all: 403 ✅. **Commits:** 4304966→e0f9c91 (frontend), 794ba3a (backend), 294c94f (docs). |

---

## 🏗️ PRE-LANCIO PRIMO CLIENTE REALE — Requisiti Obbligatori

> Questi task NON bloccano l'MVP demo interno, ma sono **obbligatori** prima di dare accesso a qualunque cliente pagante.

### STAGING — Ambiente di staging obbligatorio (post-MVP demo)
**Decisione (Session 45, 2026-06-20):** Per l'MVP demo interno non introduciamo staging. È obbligatorio prima del lancio con il primo cliente reale.

**Razionale:** La cascata di bug in Session 45 (4 bug di integrazione successivi, tutti invisibili ai test unitari) ha dimostrato che il gap "test unitari verdi → produzione" è critico. Con un cliente reale che usa il sistema, questi bug causerebbero churn immediato.

- [ ] **STG.1** Provisioning ambiente staging: EC2 t3.micro (~€15/mese) + RDS t3.micro separato + Netlify preview branch `staging`
- [ ] **STG.2** GitHub Actions: aggiungere job `deploy-staging` che si attiva su push `develop` (main rimane produzione)
- [ ] **STG.3** SSM staging: replicare tutti i parametri `/badge/production/*` sotto `/badge/staging/*` con credenziali separate
- [ ] **STG.4** Script smoke test E2E: bash script che esercita il golden path completo contro staging:
  - Login Maria → richiesta ferie → logout
  - Login Diego → approva ferie → logout
  - Login Maria → verifica ferie visibili in "I Miei Turni" → logout
  - Login Diego → verifica planning mostra 🏖️ Ferie → logout
- [ ] **STG.5** Gate CI: ogni PR su `develop` deve superare lo smoke test E2E su staging prima del merge in `main`
- [ ] **STG.6** Runbook staging: documentare la procedura "deploy su staging → smoke test → promuovi a main"

**Stima effort:** 4-6 ore (infrastruttura + CI + smoke test script)
**Costo mensile aggiunto:** ~€30-40/mese (EC2 micro + RDS micro staging)
**Trigger:** Da avviare 2-3 settimane prima dell'onboarding del primo cliente reale

---

## 🎯 MVP LAUNCH CHECKLIST (Settembre 2026)

- [x] Backend API deployed + stable
- [x] Web dashboard live on Netlify with HTTPS
- [x] Auth + role-based access working
- [x] Presences tracking (check-ins) working
- [x] Shift planning (manager + employee views)
- [x] **Corrections page** (3.4)
- [x] **Mobile app** (4.1–4.15) ✅ Build 9 testata su iPhone
- [x] **QR code management** (5.1–5.5) — critical path
- [x] **Production hardening** (6.1–6.8) ✅ custom domain badge.dataxiom.it live
- [x] **First customer onboarded** (7.1–7.6) — tutti i prerequisiti completati ✅
- [x] **Reset password dipendenti** (C.1) — ✅ completo Session 23
- [x] **API versioning /api/v1/** (C.2) — ✅ completo Session 23 (C.2.5 verify post-deploy)
- [x] **Runbook operativo** (C.3) ✅ — `docs/runbook.md`: restart EC2, rollback DB, onboarding, SLA, SSM refs
- [x] **Token refresh mobile** (C.4) ✅ — interceptor Build 14, verificato su iPhone 16 min (C.4.2)
- [x] **Content Security Policy** (C.5) ✅ — riduce superficie XSS su PC retail condivisi (commit 71b7db8)
- [x] **Test coverage ≥60%** (C.6) — ✅ 60.42% statements, 135/135 test passati (Session 27)
- [x] **SLA e contratto** (C.7) ✅ — `docs/sla.md`: uptime 99%, severity + SLA, manutenzione programmata, GDPR cancellazione 30gg (Session 27)
- [x] **Mobile monitoring + TestFlight reminder** (C.8) ✅ — CloudWatch alarm zero check-in 4h, Sentry source maps abilitati, TestFlight scade 2026-09-08 (reminder 2026-08-25)

---

*Update this file at the end of each session: mark completed tasks `[x]`, add the session to the log, and adjust priorities if needed.*
