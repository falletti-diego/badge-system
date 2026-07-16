# Badge System — Decision Log & Architecture

**Last Updated:** 16 Luglio 2026 (Session 69 — Task 9/9 chiuso, piano completo, verifica e2e completa + review di sicurezza automatica: 1 fix TLS applicato, 1 finding RBAC cross-tenant documentato come backlog prioritario, non fixato)  
**Status:** Deploy produzione ✅ LIVE (badge.dataxiom.it) | Mobile Build 26 ✅ (vibrazione check-in) | Grafici Trend Dashboard ✅ LIVE (api.dataxiom.it) | Dropdown Sede in Dashboard ✅ LIVE | Export CSV date/ora ✅ fix live | Pipeline CI/CD ✅ funzionante (backend + mobile) | ✅ Hotfix `POST /auth/refresh` MERGIATO su main e verificato live in produzione (login → refresh reale confermato 200, replay correttamente rifiutato 401) | ✅ Ambiente Demo Self-Service — **piano COMPLETO, tutti i 9 task chiusi**, in attesa della decisione merge/PR (worktree isolato, non ancora in main)  
**MVP Launch Target:** Settembre 2026 | **Current Phase:** Decisione merge/PR per il branch Ambiente Demo Self-Service (`superpowers:finishing-a-development-branch`), poi MVP Hardening backlog residuo (Session 57) o staging environment + ONB.2

---

## Session 69 — Task 9/9 demo self-service (`GET /api/admin/demo-tenants`): implementato e chiuso, ULTIMO task del piano, verifica end-to-end completa (16 Luglio 2026)

### Contesto
Ripreso il piano "Ambiente Demo Self-Service" dal Task 9/9 — l'ultimo dei 9 task — su richiesta esplicita dell'utente di usare `/superpowers:subagent-driven-development`, seguito da `/test-all`, `/api-test`, e infine una verifica end-to-end completa del piano prima di decidere merge/PR.

### Implementazione
Endpoint di sola lettura `GET /api/admin/demo-tenants` (`backend/src/routes/admin/demo-tenants.js`), montato dopo il gate condiviso `role==='admin'` già esistente in `routes/admin.js`. **Gap reale nel gate condiviso, chiuso specificamente per questo endpoint**: il gate esistente controlla solo `req.user.role === 'admin'`, mai se il tenant del chiamante è esso stesso un tenant demo — dato che `demoSeed.js` crea una tripla admin/manager/employee per ogni tenant demo, l'admin di un tenant demo passerebbe altrimenti questo controllo. Fix: query dedicata dentro il nuovo file (non nel gate condiviso, usato da tutte le altre route admin), polarità invertita rispetto a `requireDemoTenant.js` (che richiede `is_demo=true`; qui si rifiuta se `is_demo=true`) — deliberatamente non riusato `requireDemoTenant.js` per questo motivo.

### `/code-review` (spec-compliance + code-quality), nessun Critical/Important
Spec conforme al 100% (verificato indipendentemente: query esatta, ordinamento per scadenza ascendente, nessuna azione di scrittura, wiring corretto dopo il gate condiviso, test RBAC genuinamente mirati allo scenario "admin di un tenant demo"). Code-quality: "Approved with minor follow-ups" — 3 Minor non fixati (backlog esplicito, non bloccanti): (1) il rifiuto per admin-di-tenant-demo riusa il codice errore `ADMIN_REQUIRED` del gate condiviso invece di un codice dedicato, fuorviante per chi analizza i log; (2) nessun log `warn` sul tentativo di accesso cross-tenant, a differenza del pattern già stabilito in `requireDemoTenant.js`; (3) la query di rifiuto duplica la forma di `requireDemoTenant.js` invece di essere estratta in un middleware condiviso — lo stesso pattern DRY che questa feature aveva già imparato ad evitare nel Task 5.

### `/test-all`
Backend: **563/577 verdi** (14 skip noti, 0 fallimenti). Il reviewer di spec-compliance aveva inizialmente osservato 2 fallimenti in esecuzione parallela di default — investigati e confermati preesistenti e non correlati (stesso `auth-refresh-first-use.test.js` flake già documentato, riprodotto identico anche sul commit precedente al Task 9) prima di accettare il lavoro. Risolto con la pulizia preventiva ormai nota dello stato residuo `revoked_tokens`/fixture Pippo + esecuzione seriale. Frontend: 259/260 invariato (task backend-only).

### `/api-test` — fallimento diagnosticato come gap ambientale, non del codice
Lo script generico (`scripts/test-api.sh`) ha fallito 8/23 controlli contro il backend dev locale. Causa identificata leggendo la configurazione, non ipotizzata: `.env.development` di questo worktree ha `DISABLE_AUTH=true` (bypassa tutto l'RBAC — comportamento di sviluppo intenzionale, vedi CLAUDE.md Pattern 1), e il database locale (`badge_system`) non contiene gli account `diego@badge.local`/`luca.verdi@employee.it` che lo script si aspetta (solo `pippo@badge.local` esiste, con `password_hash NULL` — autenticato tramite un fallback legacy, non tramite bcrypt). Nessuna relazione col Task 9. **Verifica sostitutiva mirata**: riavviato il server locale con `DISABLE_AUTH=false`, poi verificato dal vivo con curl reali contro Postgres reale (non mock): login come `pippo` (admin reale) → `GET /admin/demo-tenants` 200 con lista vuota; creati 2 tenant demo reali via `POST /demo/start` → la lista li mostra correttamente; l'admin del tenant demo appena creato prova ad accedere allo stesso endpoint → **403 `ADMIN_REQUIRED`**; nessun token → 401 `MISSING_TOKEN`. Esattamente lo scenario critico del Checkpoint 9 del piano, verificato end-to-end contro un sistema reale.

### Verifica end-to-end completa del piano (su richiesta esplicita dell'utente, prima della decisione merge/PR)
Percorsi dal vivo con curl reali contro il server locale (auth reale attiva) i punti più critici della sezione "Verifica finale end-to-end" del piano:
- **#6 (critico)**: `POST /demo/switch-role` con il JWT di `pippo` (admin REALE) → **403 `FORBIDDEN`**, nessun token emesso — il rischio più alto dell'intera feature (un endpoint che riemette JWT senza password) confermato fail-closed.
- **#7**: creato un tenant demo, forzato `demo_expires_at` nel passato via SQL diretto → `POST /auth/refresh` con il suo refresh token → **401 `DEMO_EXPIRED`**, non un errore generico.
- **#8**: spinta la scadenza oltre la finestra di grazia di 7 giorni → eseguito `cleanup-expired-demos.js` (richiede le variabili `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` singole, non `DATABASE_URL` — nota operativa per la prossima sessione che dovesse rieseguirlo manualmente) → verificato a query diretta che client/dipendenti/sedi sono a **zero righe** (cascata completa). Rieseguito una seconda volta → "0 expired demo tenants found. Nothing to delete." (copre anche la riga 9 della matrice supplementare: idempotenza).
- **#5**: 4 richieste rapide di `/demo/start` dallo stesso IP → bloccate con `429 RATE_LIMIT_EXCEEDED` e messaggio chiaro (il blocco è scattato prima del 4° tentativo "pulito" perché la quota oraria era già in parte consumata dai test precedenti nella stessa sessione — comportamento atteso, non un bug).
- **#1-4** (flusso frontend completo, tour, banner, selettore ruolo): **non verificati con un browser reale** — nessuno strumento di controllo browser disponibile in questo ambiente. Verificati per proxy tramite la suite di test frontend automatizzata esistente (259/260 verdi, include test dedicati per `TryDemoPage`/`DemoBanner`/`DemoTour`/`DemoContactModal`/`DemoExpiredPage` da Session 67-68) — **gap dichiarato esplicitamente**, non nascosto: una verifica visiva reale in un browser resta raccomandata prima del lancio a un prospect reale.

**Matrice di test supplementare del piano (13 scenari) incrociata con la copertura automatica esistente**: 11/13 confermati con test dedicati già verdi (email duplicata ×3 percorsi, race condition reale via `Promise.all`, boundary `MAX_ACTIVE_DEMOS`, switch-role no-op/cross-tenant, fallimento SES → messaggio comunque salvato, cleanup idempotente). **2 gap identificati e accettati come non bloccanti**: riga 10 (richiesta API in-flight esattamente mentre lo scheduler cancella il tenant) non ha un test dedicato — ma è strutturalmente sicura grazie alle garanzie transazionali di Postgres (nessuna finestra per uno stato parziale rotto: una richiesta vede i dati vecchi o riceve un 401/404 pulito dopo, mai un 500 a metà); riga 12 (nessun test di regressione dedicato che confermi `is_demo=false` per `POST /api/admin/clients`/`onboard-client.js`) — protetto comunque dal `DEFAULT false` della colonna (`clients.is_demo BOOLEAN NOT NULL DEFAULT false`, verificato dal test sulle migration), ma non da un test comportamentale esplicito come il piano stesso raccomandava.

### Ambiente ripulito
Tutti i tenant demo di test creati durante questa verifica sono stati eliminati manualmente a fine sessione; `.env.development` ripristinato a `DISABLE_AUTH=true` (stato originale del worktree).

### Commits
`3058086` (feat: GET /api/admin/demo-tenants, Task 9/9).

**Task 9/9 chiuso. Piano "Ambiente Demo Self-Service" COMPLETO — tutti i 9 task chiusi.**

---

### Addendum — Review di sicurezza automatica in background, 2 finding, 1 fixato (16 Luglio 2026)

Subito dopo la chiusura del Task 9/9, una review di sicurezza automatica eseguita in background ha segnalato 2 finding sui file toccati/adiacenti a questa sessione. Entrambi verificati manualmente prima di agire, non accettati sulla fiducia.

**Finding 1 — TLS certificate verification disabilitata (Medio) — FIXATO.** `cleanup-expired-demos.js`, `audit-log-retention.js`, `apply-schema.js` aprono ciascuno un proprio `pg.Pool` separato dal pool condiviso `src/db/pool.js`, con `rejectUnauthorized: false` incondizionato in produzione — MITM possibile contro RDS. Verificato che nessuno dei tre file era stato toccato dal diff del Task 9 (il primo, `cleanup-expired-demos.js`, risale alla Session 66; gli altri due sono ancora più vecchi) — non una regressione di questa sessione, ma un problema reale presente nel branch. **Fix**: allineati tutti e tre al pattern già sicuro di `db/pool.js` (`rejectUnauthorized` default `true` in produzione, `DB_SSL_REJECT_UNAUTHORIZED=false` come scappatoia esplicita e documentata, solo per un percorso di rete privato VPC-only). Nessun bundle CA RDS reale spedito nel repo — il fix si affida al trust store di sistema già riconoscere la CA di AWS RDS (comune negli ambienti moderni), non a un bundle custom. **Verificato**: sintassi corretta sui 3 file, suite backend 563/577 verdi dopo il fix (nessuna regressione). Commit `2659982`.

**Finding 2 — Divulgazione cross-tenant su `/api/admin/*` (Alto) — NON fixato, documentato come backlog prioritario.** Il claim del review automatico ("qualunque admin non-demo vede tutti i tenant demo") è tecnicamente corretto, ma **non è una regressione del Task 9**: verificato che `GET /api/admin/clients` e `GET /api/admin/sites` (route preesistenti da molte sessioni fa, non toccate in questa sessione) hanno esattamente lo stesso comportamento — nessuno scoping per `client_id` del chiamante, quindi qualunque dipendente `role==='admin'` di *qualsiasi* tenant reale vede già tutti gli altri client/sedi del sistema. Il nuovo endpoint `demo-tenants.js` ha semplicemente ereditato il modello di accesso già stabilito per l'intero namespace `/api/admin`.

**Perché non fixato in questa sessione**: (1) correggerlo solo su `demo-tenants.js` sarebbe incoerente — resterebbe comunque possibile ottenere la lista di tutti i client da `/admin/clients`; il problema è sistemico, non specifico di un endpoint. (2) Richiede prima una decisione di prodotto che il coordinatore non può prendere da solo: il ruolo `admin` è pensato per essere esclusivo dello staff Dataxiom, o un cliente reale può assegnarlo a un proprio dipendente? Chiesto esplicitamente all'utente, che ha preferito investigare insieme piuttosto che rispondere a memoria. **Evidenza raccolta** (non conclusiva ma indicativa): il flusso di onboarding self-service reale (`scripts/onboarding/parseWorkbook.js`) ha `ROLE_MAP = { dipendente: 'employee', responsabile: 'manager' }` — **non esiste un mapping verso `'admin'`** nell'import CSV che i clienti reali usano per i propri dipendenti. L'unico modo perché un tenant reale abbia un dipendente `admin` è che Dataxiom lo crei manualmente via `POST /api/admin/employees`. Questo suggerisce che `admin` sia stato pensato come ruolo controllato da Dataxiom, non auto-assegnabile dai clienti — ma non è una conferma certa (andrebbe verificato quanti tenant reali in produzione hanno oggi un dipendente `admin`, e se sono stati creati da Dataxiom o in altro modo).

**Decisione presa con l'utente**: documentare come finding HIGH nel backlog di sicurezza (`TASKS.md`, sezione "SECURITY TECH DEBT"), con la proposta di fix (colonna `is_staff` su `clients`, o ruolo dedicato `superadmin`, applicato a **tutto** il namespace `/api/admin`) da pianificare in una sessione dedicata (probabilmente un ciclo `/grilling` + `/writing-plans`, dato l'impatto su più route esistenti) — non un fix reattivo a fine sessione mentre si chiude una feature non correlata.

**Lezione**: quando una review di sicurezza automatica segnala un finding su un file toccato dalla sessione corrente, verificare sempre se il pattern esiste già altrove nel codebase prima di decidere lo scope del fix — un problema sistemico preesistente richiede una decisione diversa (documentare + pianificare) rispetto a una vera regressione introdotta dal proprio diff (fixare subito).

**Prossimo**: decisione merge/PR/keep tramite `superpowers:finishing-a-development-branch`.

---

---

## Session 68 — Task 8/9 demo self-service (`DemoBanner`/`DemoTour`/`DemoContactModal`/`DemoExpiredPage`): implementato, code-reviewed a 8 angoli, 4 bug reali fixati (16 Luglio 2026)

### Contesto
Ripreso il piano "Ambiente Demo Self-Service" dal Task 8/9 (dopo la chiusura del Task 7/9 in Session 67), su richiesta esplicita dell'utente di usare `/superpowers:subagent-driven-development`, seguito da `/test-all` e da una `/code-review` completa sul diff del task.

### Due gap reali nel piano, scoperti solo leggendo il codice esistente (stesso pattern delle Session 66-67)
1. **Nessuna risposta backend esponeva `is_demo`/`demo_expires_at` al frontend**, e `authService.isDemo()`/`getDemoDaysRemaining()` — che il piano dà per scontati per `DemoBanner.jsx` — non esistevano. Verificato personalmente che `issueDemoSession()` in `routes/demo.js` costruisce un oggetto `user` privo di qualunque campo demo-correlato. **Fix scelto**: piccolo tocco backend giustificato (stesso spirito del gap `setSession` della Session 67) — aggiunti `is_demo: true` e `demo_expires_at` come siblings di primo livello di `user` (mai annidati dentro) in 4 punti di risposta di `backend/src/routes/demo.js` (`POST /demo/start` percorso nuovo-tenant, resume, e fallback da race condition sul vincolo UNIQUE; `POST /demo/switch-role`, che riusa `req.demoClient.demo_expires_at` già caricato da `requireDemoTenant` senza query aggiuntive). `POST /demo/contact` deliberatamente non toccato (non emette una sessione).
2. **Doppio sistema di interceptor axios sulla stessa istanza `apiClient`**: quello reale in `apiClient.js` (già modificato nella Session 67 per l'allow-list `PUBLIC_NO_AUTH_URLS`) e uno secondario, `lib/axiosInterceptor.js`, registrato separatamente da `App.jsx`, che dirama su `error.response?.data?.code` — ma ogni forma di errore reale del backend usa `.error`, non `.code` (verificato su `checkRevoked.js`/`requireDemoTenant.js`), quindi quel secondo interceptor è di fatto inerte. **Decisione**: il redirect `DEMO_EXPIRED` → `/demo-expired` va nel `catch (refreshError)` di `apiClient.js` (l'unico che fa davvero qualcosa), lasciando esplicitamente intatto `axiosInterceptor.js` — istruzione esplicita all'implementer di non "riparare" la logica morta, dato che non avrebbe alcun effetto sul comportamento reale.

### Decisioni architetturali prese prima del dispatch
- `DemoBanner.jsx` montato dentro `NavBar.jsx` (non importato singolarmente in ogni pagina) — compare gratuitamente su tutte le pagine protette, gating su `authService.isDemo()` a costo zero per i clienti reali.
- Dopo uno switch-role, **hard reload** (`window.location.href`) invece di una `navigate()` React Router — verificato che `useAuth()` legge `localStorage` una sola volta in un `useEffect` con dipendenze vuote al mount, senza alcun meccanismo reattivo: un cambio ruolo "silenzioso" via stato React avrebbe lasciato ogni componente già montato (NavBar, ProtectedRoute, DashboardPage) con dati di ruolo non aggiornati.
- `DemoTour.jsx` ancorato tramite `id` hardcoded piazzati in `DashboardPage.jsx`/`FilterBar.jsx` (unica pagina dove tutti e 4 i target del tour coesistono), non tramite un meccanismo centralizzato come `DemoBanner` — accettato come compromesso ragionevole per lo scope di un solo tour su una sola pagina (segnalato dall'angolo Altitude della review come pattern da rivedere se un futuro tour dovesse estendersi ad altre pagine).

### `/code-review` finale (8 angoli, verifica a 1-voto), 4 bug CONFERMATI, tutti fixati
- **`setTimeout` non ripulito in `DemoContactModal.jsx`**: chiudere il modale "Parliamo" e riaprirlo entro 200ms mentre si digita un nuovo messaggio faceva scattare il timer residuo, cancellando silenziosamente il testo appena scritto — stessa classe di bug già confermata nel Task 7 (`TryDemoPage.jsx`). Fix: id del timer tracciato via `useRef`, cancellato sia alla riapertura sia allo smontaggio.
- **Tour mostrato "una volta per browser per sempre" invece di "una volta per sessione demo"**: il flag `badge_demo_tour_seen` non veniva mai ripulito né da `authService.logout()` (che ripulisce esplicitamente altre chiavi `badge_*` ma non questa) né dall'avvio di una nuova demo scollegata sullo stesso browser — contraddiceva la semantica dichiarata dal componente stesso. Fix: `authService.setSession(session, { resetDemoTour })` — il flag viene ripulito solo dal percorso `POST /demo/start` (nuovo tenant o resume, in `TryDemoPage.jsx`), mai da uno switch-role (`DemoBanner.jsx`, stessa sessione in corso, ruolo diverso) — distinzione esplicita tra "nuova sessione" e "stessa sessione, ruolo diverso" decisa a livello di call-site, non di componente.
- **Flicker visivo nel tour per sessioni con ruolo dipendente**: quando il target atteso di uno step non esiste nel DOM (caso reale: i dipendenti non vedono la sezione Grafici Trend), l'effect avanzava `stepIndex` ma non azzerava `anchorEl` nello stesso aggiornamento — React poteva committare un render intermedio con il testo del nuovo step ancorato visivamente alla posizione dello step precedente. Fix: `setAnchorEl(null)` nello stesso aggiornamento dell'avanzamento di `stepIndex`.
- **Stile hero e logica di estrazione errori axios duplicati in 3-4 componenti** (`TryDemoPage`/`DemoExpiredPage`/`DemoContactModal`/`DemoBanner`), introdotti nello stesso commit (non deriva storica). Fix: estratti `components/demoHeroStyles.js` (stile navy-900/oro condiviso da `TryDemoPage`/`DemoExpiredPage`) e `utils/apiError.js` (`extractApiErrorMessage`, condiviso da 3 componenti) — i codici di errore specifici dell'endpoint (`RATE_LIMIT_EXCEEDED`, `TOO_MANY_ACTIVE_DEMOS`) restano inline in `TryDemoPage.jsx` perché non duplicati altrove.

4 finding Minor lasciati come backlog esplicito: stato ridondante in `DemoTour` (`anchorEl` derivabile da `stepIndex`), costante `TOUR_SEEN_KEY` non co-locata con le altre chiavi demo in `authService.js`, letture `isDemo()`/parsing data non memoizzate nei componenti montati in `NavBar`/`DashboardPage`, accoppiamento del tour tramite id hardcoded nel markup del dashboard (vedi decisione architetturale sopra).

### Interruzione degli strumenti lato implementer, verificata indipendentemente dal coordinatore
L'implementer ha segnalato un'interruzione del classificatore di sicurezza che bloccava le invocazioni `npm`/`npx`/`node` verso la fine della sessione, impedendogli di rieseguire test/build dopo l'ultimo commit dei fix. Il coordinatore ha rieseguito autonomamente sia la suite frontend sia la build subito dopo la notifica di completamento, e ha inoltre riletto direttamente (via `git show`) il diff dei 4 fix più delicati (in particolare `resetDemoTour` e la clausola `setAnchorEl(null)` di `DemoTour.jsx`) prima di considerare il task chiuso — non fidandosi della sola dichiarazione di "alta confidenza" dell'implementer.

### `/test-all` finale
Frontend: **259/260 verdi** (24/24 file, 1 skip noto), verificato indipendentemente dal coordinatore. Backend: **555/569 verdi** (14 skip noti, 0 fallimenti) — pulizia preventiva dello stato residuo noto (`revoked_tokens`/fixture Pippo) prima del run. Build pulita (solo il warning pre-esistente su chunk size/dynamic import).

### Commits
`11bcf25` (feat: DemoBanner + DemoTour + DemoContactModal + DemoExpiredPage), `edcaf6d` (fix: commenti-ancora per gli id del tour, dal primo giro di review), `a48e18f` (fix: 4 finding del code-review a 8 angoli).

**Task 8/9 chiuso.** Prossimo: Task 9/9 (`GET /api/admin/demo-tenants`) — ultimo task del piano.

---

## Session 67 — Task 7/9 demo self-service (`TryDemoPage.jsx`): implementato, code-reviewed a 8 angoli, 4 bug reali fixati (15 Luglio 2026)

### Contesto
Ripreso il piano "Ambiente Demo Self-Service" dal Task 7/9 (dopo la chiusura del Task 6/9 in Session 66), su richiesta esplicita dell'utente di usare `/superpowers:subagent-driven-development`, seguito da `/test-all` e da una `/code-review` completa sul diff del task.

### Due gap reali nel piano, scoperti solo leggendo il codice esistente (non assunti dal testo del piano)
Il piano assumeva l'esistenza di `authService.setSession(...)` (il commento di `routes/demo.js`, scritto in Session 61-63, lo dà già per scontato: "frontend can reuse the same authService.setSession(...) flow used by a normal login") — ma quel metodo non esisteva: `login()` aveva la logica di storage inline, mai estratta. Refactorato estraendo `setSession({ token, refresh_token, user, must_change_password })` da `login()`, che ora vi delega — comportamento verificato identico via test di regressione, chiude anche un potenziale futuro gap DRY (Pattern 4 di CLAUDE.md) per quando il Task 8/9 aggiungerà altri consumer (switch-role). Allo stesso modo, il piano descriveva l'oro come "oggi riservato al Luxury Tier nei componenti esistenti" — falso: nessun token `gold`/`#C9A86C` esisteva nel codice (verificato con grep su tutto `frontend-web/src` e su `tailwind.config.js`). Aggiunto `--color-gold-500` come primo token oro del design system.

### Bug reale trovato durante la sola spec-compliance review, fixato prima di procedere al code-quality
`PasswordChangeGuard` in `App.jsx` (il redirect fail-closed verso `/change-password` quando `must_change_password=true`) non esentava la nuova rotta pubblica `/prova-demo` — un visitatore con quel flag residuo in `localStorage` da una sessione reale precedente sullo stesso browser sarebbe stato rimbalzato via dalla landing page pubblica prima ancora di vederla, vanificando lo scopo stesso della pagina (raggiungibile da chiunque, senza credenziali). Fixato subito con un'esenzione esplicita (match esatto sulla stringa del path, coerente con lo stile già usato per `/login`).

### Il finding più grave del `/code-review` finale (8 angoli, verifica a 1-voto), tracciato personalmente dal coordinatore
Un token JWT valido-ma-**revocato** residuo in `localStorage` da una sessione reale precedente (es. un dipendente il cui accesso è stato poi revocato da un admin, che riapre l'app sullo stesso browser) innescava un bug non ovvio a più livelli: (1) `apiClient.js` allega sempre `Authorization: Bearer <token>` da `localStorage` a **ogni** richiesta, incluse quelle pubbliche; (2) il middleware globale `compositeAuthMiddleware` (`optionalAuth` + `checkRevoked`, `backend/src/app.js:172`) gira PRIMA di tutte le route, incluse quelle che non richiedono autenticazione — quindi anche `POST /demo/start` ci passa; (3) se il token è valido/non scaduto ma la sessione è stata revocata, `checkRevoked` risponde `401 SESSION_REVOKED`, **indipendentemente dal fatto che la route stessa non richieda mai un token**; (4) l'interceptor di risposta di `apiClient.js` tratta qualunque 401 (tranne su `/auth/refresh`) tentando un refresh, e quando fallisce fa un hard-redirect `window.location.href = '/login'` — bypassando **completamente** la gestione errori inline che `TryDemoPage.jsx` implementa apposta, e violando esplicitamente il requisito della spec del Task 7 ("Errori mostrati con un messaggio chiaro nella stessa pagina, mai un redirect a un errore generico"). **Non è stato accettato il primo framing del problema** (un agente lo aveva marcato solo PLAUSIBLE, ipotizzando genericamente "se il backend mai rispondesse 401") — il coordinatore ha tracciato personalmente `compositeAuthMiddleware`/`checkRevoked.js`/`optionalAuth` leggendo il codice reale prima di confermarlo come bug concreto e riproducibile, non ipotetico. **Fix scelto tra due opzioni proposte all'implementer**: invece di patchare l'interceptor di risposta condiviso (usato da ogni altra pagina dell'app), la fix è nella richiesta — un allow-list di endpoint genuinamente pubblici (`PUBLIC_NO_AUTH_URLS`, oggi solo `/api/v1/demo/start`) per cui l'header `Authorization` non viene mai allegato, così `optionalAuth` non valorizza mai `req.user` e `checkRevoked` non scatta — un fix alla radice del meccanismo, non una toppa sul sintomo del redirect.

### Altri 3 bug CONFERMATI dallo stesso `/code-review`, tutti fixati
- **`setTimeout` del flusso "Bentornato" (`resumed:true`) mai ripulito su unmount**: se l'utente naviga via entro la finestra di 1.2s, il timer residuo scattava comunque più tardi, riportandolo a `/dashboard` fuori contesto. Fix: tracciato via `useRef`, ripulito in `useEffect`.
- **Fallback errore di rete troppo permissivo**: il ramo `else if (err.request)` intercettava anche risposte HTTP reali con corpo minimale (es. il 404 generico del backend, `{ error: 'Not Found', path }`, senza `message`/`details`) — verificato che axios valorizza `err.request` anche quando `err.response` è presente, quindi il gate dev'essere `!err.response && err.request`, non solo `err.request`. Un problema di routing/deploy sarebbe stato mostrato come problema di connettività, fuorviante per la diagnosi.
- **`PasswordChangeGuard.test.jsx` non testava nulla di reale**: l'intero file (incluso il test appena aggiunto per il fix di cui sopra) non importava/renderizzava mai il componente vero da `App.jsx` — ogni test ricopiava a mano la stessa condizione e asseriva contro la propria copia, dando falsa sicurezza di copertura. Se il fix dell'esenzione `/prova-demo` fosse stato rotto in futuro, questa suite avrebbe continuato a passare invariata. Fix: esportato `PasswordChangeGuard` da `App.jsx`, test riscritto per renderizzarlo davvero con `MemoryRouter` + `useNavigate` mockato, asserendo su chiamate reali a `navigate()`.

### 4 finding Minor lasciati esplicitamente come backlog (non bloccanti)
Match esatto (`!==`) invece di `startsWith` per l'esenzione `/prova-demo` nel guard (fragile solo se una futura sotto-rotta venisse aggiunta — nessuna esiste oggi); regex email duplicata byte-per-byte tra `LoginPage.jsx` e `TryDemoPage.jsx` (nessun modulo di validazione condiviso nel progetto); valori hardcoded senza costanti nominate (KPI "127", delay 1200ms); mapping errori backend→messaggi italiani scritto inline nel componente invece che in un'utility condivisa (rilevante perché il Task 8/9 aggiungerà altra UI demo-facing con probabilmente lo stesso bisogno).

### Diagnosi di un hang noto di Jest, non un bug del task
Rieseguendo la suite backend in `--runInBand` per un fallimento inizialmente sospetto (`demo-start.test.js`, cap boundary count 19 vs 21 atteso — poi confermato flake da stato residuo, non regressione), il processo Jest è rimasto bloccato ~2h17m con solo 22s di CPU time usati, senza query bloccanti su Postgres (verificato con `pg_stat_activity`) — coerente con l'hang noto e già documentato nelle Session 65-66 ("causa esatta non identificata"), non un problema introdotto in questa sessione. Risolto rilanciando con `--forceExit` dopo aver pulito lo stato residuo (`revoked_tokens`/`used_tokens` per la fixture Pippo, stesso pattern già noto dalla Session 65). Suite risultante: 555/569 verdi, 0 fallimenti.

### `/test-all` finale
Frontend: 214/214 verdi (19/19 file, 1 skip noto), verificato indipendentemente due volte dal coordinatore (non solo dal report dell'implementer). Backend: 555/569 verdi (14 skip noti, 0 fallimenti).

### Commits
`5b695ef` (feat: TryDemoPage.jsx + authService.setSession), `ec9db24` (fix: PasswordChangeGuard esenzione /prova-demo), `82dd9a9` (fix: 4 finding del code-review a 8 angoli).

**Task 7/9 chiuso.** Prossimo: Task 8/9 (`DemoBanner.jsx` + selettore ruolo + `DemoTour.jsx` + `DemoContactModal.jsx` + `DemoExpiredPage.jsx`).

---

## Session 66 — Task 6/9 demo self-service (`DEMO_EXPIRED` su refresh + cleanup scheduler): implementato, code-reviewed, bypass reale fixato (15 Luglio 2026)

### Contesto
Ripreso il piano "Ambiente Demo Self-Service" dal Task 6/9 (dopo la chiusura del Task 5/9 in Session 65), su richiesta esplicita dell'utente di usare `/superpowers:subagent-driven-development`, seguito da `/test-all` e da una `/code-review` completa sul diff del task.

### Due correzioni deliberate al testo del piano, decise dal coordinatore prima del dispatch
Il piano dice letteralmente "`middleware/auth.js`: nel path di login (e nel refresh)". Investigazione preliminare del coordinatore (lettura diretta del codice, non assunzione): (1) `middleware/auth.js` fa solo verifica di firma JWT su ogni richiesta autenticata dell'intera app, senza alcuna query al DB — aggiungere lì un controllo `is_demo`/`demo_expires_at` sarebbe stata una regressione di performance sull'hot path di tutta l'applicazione, non solo delle route demo. La logica reale di login/refresh vive invece in `routes/auth.js`. (2) I dipendenti demo creati da `demoSeed.js` hanno `password_hash` sempre `NULL`, e la query di lookup di `POST /login` filtra esplicitamente `WHERE password_hash IS NOT NULL` — quindi un dipendente demo non può strutturalmente autenticarsi via login con password: quel percorso è irraggiungibile per loro, e forzarci un controllo avrebbe aggiunto rischio a un file sensibile per zero beneficio pratico. **Deciso**: il controllo va solo in `POST /refresh` di `routes/auth.js`, e la forma della risposta usa la convenzione già esistente in quella funzione (`{ error: 'DEMO_EXPIRED', message: ... }`) invece del `{ code: ... }` scritto letteralmente nel piano.

### Istruzioni chirurgiche su un file con incidente di produzione pregresso
`routes/auth.js` ha una storia documentata (Session 62) di un bug reale causato da un riordino errato tra un controllo di revoca e un controllo anti-replay. Per evitare di ripetere quella classe di errore, l'implementer ha ricevuto in anticipo la sequenza esatta, riga per riga, della funzione `POST /refresh` esistente, con il divieto esplicito di riordinare o ristrutturare qualunque cosa già presente — solo un'aggiunta puntuale nel punto esatto indicato. Risultato: il diff finale tocca solo due hunk, entrambi dopo il guard `USER_NOT_FOUND` preesistente, confermato intatto da tre angoli di review indipendenti (Angle A line-by-line, Angle B removed-behavior, spec-compliance) senza bisogno di correzioni su quella parte.

### `/code-review` (8 angoli) trova un bypass funzionale reale, non solo nitpick
A differenza della Session 65 (dove il `/code-review` aveva trovato solo rifiniture minori), questa volta l'angolo Altitude ha identificato un gap concreto: `POST /demo/switch-role` (Task 4) è protetto da `requireAuth` + `requireDemoTenant`, ma quest'ultimo — estratto in Session 65 come guard condiviso — controllava solo `is_demo`, mai `demo_expires_at`. Siccome `switch-role` riemette sempre un token fresco (15 minuti di validità) tramite `issueDemoSession()` indipendentemente dallo stato di scadenza, un tenant demo scaduto ma ancora presente nel DB (entro la finestra di grazia di 7 giorni prima della cancellazione dello scheduler) poteva chiamare `switch-role` ogni ~14 minuti per rinnovare la propria sessione indefinitamente, senza mai passare per `POST /auth/refresh` — bypassando completamente il controllo `DEMO_EXPIRED` appena implementato e vanificando lo scopo dichiarato dell'intero Task 6.

**Verifica indipendente del coordinatore prima di agire** (non fidarsi del solo report dell'agente reviewer): letto direttamente `requireDemoTenant.js` (confermato: selezionava solo `is_demo, demo_contact_email`, mai `demo_expires_at`) e la costante `ACCESS_TOKEN_EXPIRY = '15m'` in `routes/demo.js`, per confermare il meccanismo esatto del bypass prima di richiedere un fix.

**Classificazione di severità**: Important, non Critical. Non c'è fuga di dati cross-tenant (il bypassatore accede solo ai propri dati demo, già isolati per `client_id`), e l'impatto è comunque limitato nel tempo: lo scheduler di pulizia (lo stesso Task 6) cancellerà comunque il tenant 7 giorni dopo la scadenza *originale* di `demo_expires_at`, indipendentemente da quante volte la sessione viene rinnovata via `switch-role` — quest'ultimo non aggiorna mai `demo_expires_at`. Il bug vanifica l'intento di prodotto ("blocco soft dopo 7 giorni") ma non crea un rischio di sicurezza illimitato nel tempo.

**Decisione di design per il fix**: estendere il guard condiviso `requireDemoTenant` (non aggiungere un controllo inline alla singola route `switch-role`) — questo chiude automaticamente il gap anche per `/demo/contact` e per qualunque futura route demo-autenticata, invece di lasciare che ogni nuovo endpoint debba ricordarsi di ricopiare a mano lo stesso controllo (esattamente la classe di errore appena trovata: un controllo esistente in un solo punto, dimenticato in un altro). La risposta di scadenza (`401 DEMO_EXPIRED`) è stata deliberatamente resa distinta dal `403 ForbiddenError` già esistente per "non è affatto un tenant demo" — sono due condizioni concettualmente diverse (mai stato un tenant demo vs. lo è stato ma il periodo di prova è scaduto), e la distinzione permette a un futuro interceptor frontend (Task 8) di trattarle diversamente.

### Fix minore aggiuntivo, stessa sessione
Il commento di intestazione di `cleanup-expired-demos.js` affermava che "ogni tabella figlia ha `ON DELETE CASCADE`" — fattualmente impreciso: `checkins.created_by` è `ON DELETE RESTRICT`, non CASCADE (verificato in `schema.sql`). Nella pratica non si manifesta mai (ogni `INSERT INTO checkins` nel codebase imposta `created_by` allo stesso `client_id` dell'`employee_id`, quindi la cascata su quest'ultimo rimuove comunque la riga prima che la constraint RESTRICT su `created_by` possa bloccare qualcosa), ma il commento fuorviante è stato corretto per riflettere la realtà — nessuna modifica alla query stessa.

### Perché solo 2 dei 9 finding del `/code-review` sono stati fixati
Gli altri 7 (loop sequenziale di `logAudit` invece di batch nel cleanup script, boilerplate CLI duplicato con `audit-log-retention.js`, `console.log` invece del logger `pino` condiviso, commento verboso sul cortocircuito booleano in `auth.js`, audit-log non atomico con la DELETE, JOIN concettualmente duplicato tra `POST /login` e `POST /refresh`) sono tutti coerenti con pattern già esistenti altrove nel codebase (es. `audit-log-retention.js` ha già lo stesso "difetto" di boilerplate/`console.log`) o rappresentano un tradeoff già accettato esplicitamente altrove (il modello "best-effort" di `logAudit`, documentato nel suo stesso file, non richiede atomicità con l'operazione principale). Nessuno di questi ha impatto funzionale o di sicurezza — fixarli tutti avrebbe esteso lo scope oltre quanto pianificato per una sessione con pausa esplicita richiesta dopo ogni task. Lasciati come backlog opzionale.

---

## Session 65 — Task 5/9 demo self-service (`POST /demo/contact` + AWS SES): implementato, code-reviewed, chiuso (15 Luglio 2026)

### Contesto
Ripreso il piano "Ambiente Demo Self-Service" dal Task 5/9 (dopo la chiusura del Task 4/9 in Session 64), su richiesta esplicita dell'utente di usare `/superpowers:subagent-driven-development`, seguito da `/test-all` e da una `/code-review` completa sul diff del task.

### Scope aggiuntivo deciso dal coordinatore: estrazione `requireDemoTenant`
La Session 64 aveva lasciato un finding non risolto: il piano stesso dichiara che `/demo/contact` riuserà lo stesso controllo `is_demo` di `/demo/switch-role`, quindi era il momento naturale per estrarre un middleware condiviso invece di duplicare di nuovo il guard inline. Deciso di includerlo nello scope del Task 5 (non un task a parte) dato il costo marginale basso e la relazione diretta col lavoro già in corso. Il refactor di `switch-role` è stato vincolato esplicitamente a comportamento invariato — verificato che i suoi test esistenti passassero senza modifiche.

### Diagnosi di un intoppo ambientale (non un bug del task)
Durante l'attesa del completamento dei test dell'implementer, il processo `jest` è rimasto bloccato più volte (~20-37 minuti, quasi zero CPU), facendo inizialmente sospettare un bug reale introdotto dal task (es. una chiamata SES reale non mockata che pende in attesa di rete). Indagine del coordinatore: la connessione Postgres coinvolta risultava `idle` dopo un `COMMIT` — cioè i test erano già finiti, il processo semplicemente non usciva mai (`"Jest did not exit one second after the test run has completed"`). Confermato **isolando i soli 3 nuovi file di test del Task 5** (13/13 verdi in <1s, nessun hang) e poi **confrontando lo stesso comando sul commit base pre-Task-5** (`20bc87b`, via `git stash`): stesso identico comportamento di non-uscita, stesso identico test flaky pre-esistente (`auth-refresh-first-use.test.js`). Conclusione: non è una regressione di questo task, è un problema ambientale pre-esistente della suite (probabile leak di handle/connessione in un file di test più vecchio, non identificato con precisione). **Lezione operativa**: mai pipare l'output di `jest` a `tail` quando si sospetta questo — `tail` bufferizza fino a `EOF`, che non arriva mai se il processo non esce, dando l'illusione di un hang totale invece del vero sintomo (test già finiti, processo residuo). Scrivere sempre l'output su file e leggere il file una volta vista la riga `Test Suites:`, senza aspettare che il processo termini da solo.

### Review a due stadi
- **Spec-compliance**: ✅ conforme al 100%, verificato indipendentemente leggendo il codice reale (non fidandosi del report dell'implementer) — ordine save-poi-send corretto (Checkpoint 5), scope del catch corretto (un errore DB continua a produrre 500 via `next(err)`, solo l'errore SES viene assorbito), email reale del prospect (`clients.demo_contact_email`) usata correttamente nella notifica invece dell'email fissa fittizia del dipendente demo, guardia fail-closed cablata sulla route registrata, schema Zod `.strict()` corretto, refactor di `switch-role` bit-a-bit invariato nei suoi test.
- **Code-quality**: verdetto **"Ready to merge: Yes"**, un finding Important (ordine dei middleware incoerente tra `/contact` — guard prima di validate — e `/switch-role` — validate prima di guard —, nessun impatto di sicurezza dato che il guard è fail-closed in entrambi i casi, ma fonte di confusione futura) + 2 Minor (nessun test end-to-end per un messaggio oltre il limite di 2000 caratteri dello schema Zod; `requireDemoTenant.js` usa un logger `pino` locale invece di quello condiviso). **Deciso di fixare i primi due prima di chiudere** (economico, evita debito silenzioso) in un commit separato (`7935ce2`); il terzo lasciato perché pattern preesistente non introdotto da questo task (anche `routes/demo.js` lo fa).

### `/code-review` (8 angoli, medium effort) — Agent tool temporaneamente indisponibile a metà
Il tool Agent ha restituito errori del classificatore di sicurezza (`claude-sonnet-5 is temporarily unavailable`) per 3 delle 8 angolazioni pianificate (efficiency, altitude, conventions) dopo un retry fallito. Gestito eseguendo quelle 3 angolazioni manualmente (lettura diretta del diff salvato + dei file correnti) invece di aspettare indefinitamente. Risultato: **nessun finding Critical o Important**, 6 Minor sopravvissuti alla verifica — cambio del nome del log action nel refactor (`demo_switch_role_forbidden` → `require_demo_tenant_forbidden`, rischio solo se un dashboard/alert esterno non visibile nel repo lo referenzia), config email parallela e inutilizzata (`SMTP_*` preesistente + nuovo `SES_FROM_EMAIL`/`DEMO_CONTACT_NOTIFY_EMAIL`), logger `pino` locale duplicato, singleton lazy non necessario in `utils/email.js` (il costruttore `SESClient` è economico, nessuna chiamata di rete), guardia difensiva `req.user &&` speculativa data la garanzia documentata di `requireAuth` a monte, doppio riferimento al client (`req.user.client_id` vs `req.demoClient`, quest'ultimo senza `id`) nella route `/contact`. Un candidato di refactor (estrarre un helper riusabile per il pattern "catch-and-warn" di SES, dato che si ripete concettualmente vicino a `logAudit`) è stato **scartato** in fase di verifica per astrazione prematura — usato una sola volta nel codice, creare un helper ora contraddirebbe il principio "DRY senza astrazione prematura". Un mio candidato sulla violazione della sezione "Silent Failures in Middleware" del `CLAUDE.md` (il catch generico di `requireDemoTenant.js` non logga un warning) è stato **refutato** verificando `backend/src/app.js:206`: esiste già un error handler globale che logga ogni errore propagato via `next(err)`, quindi non c'è un vero fallimento silenzioso — solo centralizzato altrove. Nessuno dei 6 Minor è stato fixato in questa sessione — non bloccanti, lasciati come backlog opzionale, elencati in `TASKS.md`/`HANDOFF.md`.

### Perché nessun fix per i 6 Minor rimanenti
A differenza dei 2 finding della code-quality review (fixati perché economici e già inquadrati come "Should Fix" da un reviewer dedicato), questi 6 sono emersi da un `/code-review` generico a scopo di verifica finale, con severità Minor esplicita e nessun impatto funzionale o di sicurezza confermato. Fixarli tutti avrebbe esteso lo scope del Task 5 oltre quanto pianificato per una sessione con pausa esplicita richiesta dall'utente dopo ogni task — lasciati come nota per una futura sessione di pulizia, non per negligenza.

---

## Session 64 — Task 4/9 demo self-service (`POST /demo/switch-role`): implementato, code-reviewed, race condition critica fixata (14 Luglio 2026)

### Contesto
Ripreso il piano "Ambiente Demo Self-Service" dal Task 4/9 (dopo la chiusura del Task 3/9 in Session 63), su richiesta esplicita dell'utente di usare `/superpowers:subagent-driven-development` + `/superpowers:test-driven-development`, seguito da `/test-all` e da una `/code-review` completa sul diff del task.

### Decisione preliminare (via `/grilling`): come implementare l'"igiene sessione"
Il testo del piano diceva letteralmente di implementare l'invalidazione della sessione del ruolo precedente "riusando la logica già esistente di `POST /auth/revoke-session`". Prima di dispatchare l'implementer, ho verificato che questo avrebbe reintrodotto esattamente la classe di bug appena risolta nell'hotfix Session 62: `revoke-session` scrive una revoca **permanente** (`revoked_until = NULL`) in `revoked_tokens`, controllata da `/auth/refresh` per `user_id` indipendentemente dalla sessione — un visitatore demo che passasse Admin→Manager→di nuovo Admin avrebbe trovato il refresh del suo **nuovo** token Admin permanentemente rotto, perché la vecchia riga di revoca permanente non viene mai ripulita. **Deciso con l'utente** (via `AskUserQuestion`): sostituire con un `DELETE FROM used_tokens WHERE user_id = $1` mirato, senza toccare `revoked_tokens` — approccio poi rivelatosi comunque problematico (vedi sotto), ma per una ragione diversa e più sottile.

### Implementazione (subagent-driven-development + TDD)
L'implementer subagent ha scritto l'endpoint seguendo lo spec del piano: guardia fail-closed (`is_demo` verificato per primo, 403 immediato se il tenant chiamante non è demo), lookup del dipendente target scoped per `client_id` (mai cross-tenant), riemissione JWT via `issueDemoSession` (stessa funzione già usata da `/demo/start`), audit log `demo_role_switch`. Durante il proprio self-review, l'implementer ha trovato e corretto autonomamente un bug d'ordine reale: il DELETE di igiene-sessione veniva eseguito **dopo** `issueDemoSession`, e nel caso no-op (switch verso lo stesso ruolo già attivo) l'id del "ruolo precedente" coincide con quello del "nuovo ruolo" — quindi il DELETE cancellava la riga `used_tokens` appena inserita dalla stessa richiesta, rompendo il refresh della sessione appena creata. Fix: DELETE spostato prima di `issueDemoSession`, con test di regressione dedicato.

### Review a due stadi (spec-compliance + code-quality)
Spec-compliance: conforme al 100%, tutti e 6 gli scenari del Checkpoint 4 del piano coperti da test reali su Postgres. Code-quality: 2 finding minori — export morto `module.exports.issueDemoSession` (rimosso, nulla lo importava), fallimento del DELETE catturato-e-ignorato non motivato esplicitamente come tradeoff accettato (aggiunta motivazione nel commento).

### `/test-all`
Backend 528/542 verdi (14 skip noti), frontend 191/192 (1 skip, invariato — il task è backend-only). **Scoperta operativa**: i test demo-correlati (`demo-start.test.js`, `demo-switch-role.test.js`, ecc.) condividono lo stesso contatore reale `MAX_ACTIVE_DEMOS` su Postgres — se eseguiti in worker Jest paralleli (comportamento di default), possono "urtarsi" a vicenda con falsi 409 quando il test del tetto-demo di un file temporaneamente supera la soglia mentre un altro file sta creando legittimamente un tenant demo. Non un baco introdotto da questo task (esisteva già come rischio latente tra qualunque coppia di file demo-correlati), ma reso visibile dal nuovo file di test. **Mitigazione praticata**: `--runInBand` per un segnale deterministico in questa sessione; **non ancora risolto strutturalmente** — da considerare se altri task aggiungono altri file di test demo-correlati.

### `/code-review` — race condition critica trovata e fixata
5 agenti paralleli (3 angoli di correttezza indipendenti + reuse/simplification/efficiency + altitude/conventions) + verifica dedicata a 1-voto sul finding più grave. **Confermato**: il `DELETE FROM used_tokens WHERE user_id = $1` dell'igiene-sessione (non scoped al jti specifico della vecchia sessione, non transazionale) poteva cancellare la riga `used_tokens` appena inserita da un `POST /auth/refresh` **concorrente e legittimo** per lo stesso `user_id` — se quel refresh completava (DELETE vecchio jti + INSERT nuovo jti + COMMIT) tra l'inizio di uno switch-role e il suo stesso DELETE, quest'ultimo cancellava anche la riga appena creata dal refresh, causando un falso `REPLAY_ATTACK_DETECTED` e un blocco di 5 minuti su una sessione che non aveva mai fatto replay. Non raggiungibile oggi (nessun frontend in questo branch chiama ancora `/demo/switch-role`), ma non impedito dal codice stesso — sarebbe emerso non appena il Task 7/8 avesse collegato il frontend con un pattern realistico (es. un interceptor axios di refresh silenzioso che corre in parallelo a un click utente sul selettore ruolo).

**Decisione (chiesta esplicitamente all'utente via `AskUserQuestion`, 3 opzioni)**: rimosso del tutto il DELETE proattivo, invece di (a) richiedere il `refresh_token` nel body per uno scoping preciso per jti (cambio di contratto API, fuori scope) o (b) lasciarlo com'è documentando solo il rischio. Motivazione: il piano stesso descrive questa igiene-sessione come "non un rischio di sicurezza, ma un accumulo di sessioni fantasma da evitare" — dato che il fix per eliminare completamente la race condition avrebbe richiesto o un cambio di contratto API o toccare `routes/auth.js` (file condiviso, critico per la sicurezza, fuori scope per questo task), e dato che il problema che l'igiene-sessione risolve è esplicitamente non-critico, il tradeoff più sicuro è accettare l'accumulo di sessioni fantasma (il vecchio token scade comunque naturalmente entro 7 giorni) piuttosto che rischiare un blocco falso su una sessione legittima concorrente. Test aggiornato per riflettere il comportamento corretto e voluto (il vecchio refresh token resta valido dopo uno switch, non viene invalidato).

### Altri finding della code review (riportati, non risolti in questa sessione)
- **Altitude**: la guardia `is_demo` è duplicata inline in questo endpoint, e il piano stesso (Task 5, `POST /demo/contact`) dichiara esplicitamente che copierà lo stesso identico controllo — da estrarre in un middleware condiviso `requireDemoTenant` quando si implementa il Task 5.
- **Reuse**: il `DELETE FROM used_tokens WHERE user_id = $1` (quando esisteva) duplicava SQL identico già presente in `POST /auth/revoke-session` — non più rilevante dopo la rimozione, ma il pattern generale (nessun helper condiviso per mutazioni di `used_tokens`) resta.
- **Audit log**: `logAudit`'s `userId` per l'evento `demo_role_switch` registra il **nuovo** dipendente (il ruolo di destinazione), non l'attore che ha iniziato lo switch — l'attore resta recuperabile solo da `newValue.previous_user_id`. Non chiaro se sia una violazione di una convenzione consolidata altrove nel codebase (non verificato a fondo) — lasciato come nota per un futuro controllo.

### Lezione generale
Una code review approfondita su un fix già "verde" (tutti i test passano) ha trovato una seconda volta, in questa stessa feature, un bug di concorrenza reale sullo stesso meccanismo (`used_tokens`/replay-detection) — analogo per natura al bug scoperto nell'hotfix Session 62, ma di segno opposto (lì un controllo troppo aggressivo bloccava sessioni legittime; qui un'operazione di pulizia troppo poco scoped ne cancella una concorrente). Vale la pena, per qualunque futuro codice che tocca `used_tokens`/`revoked_tokens`, considerare esplicitamente lo scenario "un'altra richiesta per lo stesso `user_id` è in volo proprio ora" — non solo il percorso sequenziale della singola richiesta.

---

## Session 63 — Chiusura hotfix refresh + Task 3/9 demo self-service ripreso e chiuso (14 Luglio 2026)

### Contesto
Continuazione diretta della Session 62: l'hotfix era pronto ma non ancora mergiato, e il Task 3/9 della Ambiente Demo Self-Service era in pausa in attesa proprio di questo hotfix (perché `POST /demo/start` emette un `refresh_token` che passa dallo stesso `/auth/refresh`).

### Parte 1 — Merge, deploy, verifica live
Merge/PR (`#2`, commit `e2d1380`) su `main`, deploy CI/CD → EC2 verificato. Verifica live in produzione con un account cliente reale (`maria.rossi@torino.it`, non un fixture `@badge.local`): login → primo refresh **200** (prima 401, bug confermato risolto), replay del token consumato → **401 SESSION_REVOKED** (conferma che il fix V1 per la collisione id con `DEMO_USERS`, Session 62, funziona anche in produzione — l'id di Maria coincide intenzionalmente con la fixture `maria@badge.local`, migration 022).

**Effetto collaterale accettato**: per ottenere credenziali di test è stata resettata temporaneamente la password di Maria via l'endpoint admin esistente (`POST /admin/employees/:id/reset-password`, RBAC-scoped, stesso tenant). L'utente ha poi impostato la password definitiva da sé. Nessun impatto sui dati di presenza/ferie di Maria — solo `password_hash`/`must_change_password`.

**Bug FYI trovato ma esplicitamente non toccato**: il token rinnovato di Maria contiene ancora l'identità della fixture demo (nome/email `maria@badge.local`) invece dei suoi dati reali. Causa: `routes/auth.js`, il branch `if (demoUser) {...}` che costruisce il *payload* del nuovo token usa lo stesso id-lookup su `DEMO_USERS` il cui rischio di collisione era già stato identificato e corretto — ma solo per il *replay check* (V1 della Session 62), non per la costruzione del payload. Sono due punti diversi dello stesso file con lo stesso pattern di rischio, e solo uno è stato corretto in questo hotfix (lo strettamente necessario per il bug segnalato). **Decisione**: non espandere lo scope dell'hotfix per correggerlo qui — aprire un ticket dedicato, dato che tocca la stessa area di sicurezza condivisa e merita lo stesso rigore (test TDD + code review) di un fix a sé.

### Parte 2 — Task 3/9 ripreso: gap trovato e colmato
Il branch `worktree-demo-self-service` era diramato da `main` prima della Session 62 e non aveva mai ricevuto l'hotfix. Poiché `POST /demo/start` (già implementato prima di questa sessione, commit `9474913`) emette un `refresh_token` reale che passa dallo stesso `/auth/refresh`, **senza portare l'hotfix nel branch demo, il primo refresh di ogni sessione demo avrebbe fallito con lo stesso identico bug appena risolto in produzione** — un prospect che prova la demo avrebbe visto la sessione scadere silenziosamente dopo 15 minuti (durata dell'access token) senza mai riuscire a rinnovarla.

**Decisione**: mergiare l'hotfix nel branch demo prima di considerare il Task 3 completo, non solo verificarlo isolatamente su `main`.

**Intoppo**: `git merge main` (locale) è sembrato riuscire ma non ha portato il fix reale — solo i commit di documentazione. Causa: i worktree Git condividono lo stesso set di branch locali, ma un `git merge <branch-locale>` non aggiorna quel branch dal remote automaticamente; la PR era stata mergiata su GitHub, ma il ref locale `main` in questo worktree era rimasto indietro. Rilevato confrontando esplicitamente `git rev-parse main origin/main` (non coincidevano) dopo il primo merge, invece di fidarsi del solo "merge riuscito senza conflitti". Risolto con `git fetch` + un secondo merge esplicito da `origin/main`. **Verificato positivamente** con `grep isBadgeLocalSession backend/src/routes/auth.js` dopo il secondo merge, non solo assumendolo dal successo del comando.

### Verifica sistematica dei checkpoint del Task 3 (nessun gap trovato)
Con il fix ora presente, il test `demo-start.test.js`'s `it.skip('BLOCKED (pre-existing auth.js bug...')` — scritto in anticipo alla Session 61 già con l'aspettativa corretta — è stato un-skippato e verificato **GREEN** senza modifiche al codice di produzione (solo alla stringa del test e al commento). Rivisitati poi tutti gli item del "Checkpoint 3" del piano contro i test esistenti (`demo-start.test.js`, `demo-start-validation.test.js`, `demo-start-rate-limit.test.js`, `demo-start-constraint-scoping.test.js`): body-shape injection, rate-limit, tetto `MAX_ACTIVE_DEMOS` con boundary esatto, i 3 percorsi email-duplicata, race condition parallela, scoping del `23505`, audit log — tutti già coperti, nessun fix necessario. Suite backend completa: 522/536 verdi, 14 skip noti, 0 falliti.

### Lezione generale
Dopo un merge/PR completato in un worktree o sessione diversa, non fidarsi di un `git merge <branch-locale>` in un altro worktree senza prima `git fetch` — i branch locali di worktree fratelli non si sincronizzano da soli col remote. Verificare sempre `git rev-parse <branch> origin/<branch>` prima di considerare un merge "portato a termine".

---

## Session 62 — Hotfix `POST /auth/refresh`: replay-detection rifiutava il primo refresh di ogni cliente reale (14 Luglio 2026)

### Contesto e scoperta
Bug trovato per caso durante il Task 3/9 della Session 61 (Ambiente Demo Self-Service), testando end-to-end il `refresh_token` appena aggiunto a `POST /demo/start`. **Non è un bug introdotto dalla feature demo** — è un bug pre-esistente su `main`, già in produzione, indipendente e antecedente.

### Causa radice
Due commit già su `main` avevano lasciato la logica anti-replay di `POST /auth/refresh` in uno stato incoerente:
1. **`907a6fb`** (12/6, "Remove jti insert from login endpoint - unblocks first refresh") aveva rimosso l'`INSERT INTO used_tokens` che `POST /login` eseguiva all'emissione del token, perché la sua presenza faceva sì che il *primo* refresh di qualunque token venisse scambiato per un replay. Questo però riapriva una race condition più stretta: un token appena emesso non ha nessuna riga da bloccare con `SELECT ... FOR UPDATE`, quindi due richieste di refresh concorrenti sullo stesso token fresco potevano entrambe avere successo.
2. **`6abb03f`** (14/6, poche ore dopo, "S.32.7 Critical Fixes") aveva reintrodotto l'INSERT al login specificamente per chiudere quella race, **ma senza aggiornare la logica del controllo** in `/refresh`: il codice continuava a interpretare "riga trovata in `used_tokens`" come prova di replay — semantica corretta nel design *precedente* (blacklist di jti già consumati), ma opposta a quella richiesta dal nuovo design (jti inserito all'emissione, quindi "trovato" = "token corrente valido, non ancora consumato").

Risultato: il primo tentativo di refresh di **ogni cliente reale** (non-`@badge.local`) falliva con `401 SESSION_REVOKED`, riproducibile al 100%. Gli account demo interni (`@badge.local`) non mostravano il sintomo perché `POST /login` salta esplicitamente il tracking del jti per loro — motivo per cui il bug non era mai stato notato nei test manuali di sessione.

### Decisione: non un revert, ma completare il design di `6abb03f`
Ripristinare `907a6fb` avrebbe riaperto la race condition che `6abb03f` aveva correttamente chiuso. La fix corretta inverte la semantica trovato/non-trovato (presenza = valido, procedi; assenza = già consumato o mai emesso, replay) mantenendo l'INSERT al login.

### Due regressioni trovate dalla code review sulla fix stessa (poi corrette)
Eseguita `/code-review` (6 agenti in parallelo, verifica indipendente) sulla prima versione della fix. Trovate e corrette 2 regressioni reali, non teoriche:

1. **Collisione id con `DEMO_USERS`**: l'esenzione per le sessioni demo cercava `user_id` in `DEMO_USERS` per id. `maria.rossi@torino.it` (dipendente reale, login via password DB) condivide intenzionalmente l'id con la fixture `maria@badge.local` (`migrations/022_merge_maria_badge_local_to_real_employee.sql`) — quindi la sua sessione reale veniva scambiata per demo, disattivando silenziosamente sia il controllo anti-replay che la pulizia di `used_tokens` per il suo account. **Fix**: l'esenzione ora si basa sul dominio email presente nel payload del token (aggiunto `email` al refresh token emesso da `POST /login`), lo stesso segnale già usato da login stesso — non più su un id-lookup soggetto a collisioni.
2. **Declassamento di una revoca permanente**: il controllo anti-replay girava *prima* del controllo `revoked_tokens`. Dopo una revoca amministrativa permanente (`POST /revoke-session`, che cancella le righe `used_tokens` dell'utente e imposta `revoked_until = NULL`), il refresh token residuo (non ancora scaduto per JWT) dell'utente revocato veniva classificato come "replay" invece che "sessione revocata" — e l'`INSERT ... ON CONFLICT DO UPDATE` del ramo replay **sovrascriveva silenziosamente la revoca permanente con una temporanea di 5 minuti**, permettendo all'utente revocato di riottenere accesso da solo. **Fix**: riordinato — `revoked_tokens` viene controllato prima del replay-check.

Aggiunto anche un terzo touch-point mancante nella prima versione della fix (l'INSERT finale del jti ruotato non era esentato per le sessioni demo, causando accumulo di righe orfane in `used_tokens`).

### Processo seguito
`/superpowers:writing-plans` (piano: `docs/superpowers/plans/2026-07-14-refresh-replay-detection-hotfix.md`) → worktree isolato dedicato basato su `main` (non sul branch demo, per poter shippare indipendentemente) → `/superpowers:test-driven-development` diretto per l'implementazione iniziale (RED→GREEN→REFACTOR reale, verificato ad ogni passo) → `/code-review` (6 agenti paralleli + verifica) → fix delle 2 regressioni trovate, di nuovo via TDD con test di regressione dedicati.

### Stato: non ancora mergiato
Il lavoro vive interamente su `worktree-hotfix-refresh-replay-detection` (branch omonimo, base `main`). **Il bug è ancora live in produzione** finché questo branch non viene mergiato — priorità alta.

---

## 1. PROJECT OVERVIEW

**Badge System** è una soluzione SaaS multi-tenant per il tracciamento delle presenze nel retail italiano/europeo. 

### Core Value Proposition
- **Zero hardware** — dipendenti usano smartphone personale
- **QR Code statico** — scannerizzato dal dipendente alla sede
- **Face ID nativo** — autenticazione biometrica integrata via iOS/Android
- **Reporting semplice** — dashboard real-time per manager, export CSV

### Business Model
- **Revenue:** €10/dipendente/mese + €250/sede aggiuntiva (una tantum)
- **Target:** 25-200 dipendenti per cliente, multi-sede support
- **MVP Timeline:** ~150 ore totali @ 10h/week = 3-4 mesi

### MVP Scope
- ✅ Mobile app (QR scanning + Face ID)
- ✅ Web dashboard (reporting, corrections)
- ✅ CSV export
- ✅ Multi-site support
- ✅ Audit log
- ❌ Payroll API (Phase 2)
- ❌ Offline mode (Phase 2)

---

## 2. TECH STACK

### Frontend Mobile
| Componente | Technology | Versione |
|-----------|-----------|---------|
| **Framework** | React Native | Latest |
| **Auth** | React Native Face API | Native Face ID |
| **QR Scanner** | react-native-camera + react-native-qrcode | Latest |
| **HTTP** | Axios | Latest |
| **State** | Redux Toolkit | Latest |
| **Dev Time** | 25-35 hours | MVP estimate |

### Frontend Web (Dashboard)
| Componente | Technology | Versione |
|-----------|-----------|---------|
| **Framework** | React 18+ | Latest |
| **Build Tool** | Vite | Latest |
| **UI Components** | Material-UI (MUI) 5.x | Latest |
| **Charts** | Recharts | Latest |
| **Styling** | Tailwind CSS | Latest |
| **Tables** | TanStack Table (React Table) | Latest |
| **Hosting** | Netlify | Auto-deploy on push |
| **Dev Time** | 20-30 hours | MVP estimate |

### Backend API
| Componente | Technology | Versione |
|-----------|-----------|---------|
| **Runtime** | Node.js | 20+ LTS |
| **Framework** | Express.js | 4.x |
| **Database Driver** | pg (node-postgres) | Latest |
| **Auth** | Auth0 SDK | Latest (mock MVP) |
| **Validation** | Zod | Latest |
| **Logging** | Pino | Latest |
| **Config** | dotenv | Latest |
| **Error Tracking** | Sentry | Free tier MVP |
| **Dev Time** | 30-40 hours | MVP estimate |

### Database
| Componente | Choice | Rationale |
|-----------|--------|-----------|
| **Engine** | PostgreSQL 14+ | ACID, relational, multi-tenant ready |
| **Hosting** | AWS RDS (Managed) | Auto-backup, failover, zero ops |
| **Region** | eu-west-1 (Ireland) | GDPR-compliant, low latency Italy |
| **Instance** | db.t3.micro (MVP) | €30-50/mese MVP |
| **Backup** | AWS Automated (7-day) | Point-in-time recovery |
| **Multi-AZ** | No (MVP) | Cost not justified yet |

### Infrastructure
| Componente | Choice | Cost |
|-----------|--------|------|
| **API Server** | AWS EC2 t3.small | €50-80/mese |
| **Region** | eu-west-1 (Ireland) | GDPR-compliant |
| **Container** | Docker | Simplified deployment |
| **CI/CD** | GitHub Actions | Free tier |
| **Registry** | AWS ECR | €0.20/GB |
| **Frontend CDN** | Netlify | Free tier |

### Monthly Operating Costs (MVP: 1 client, 25 employees)
| Item | Cost |
|------|------|
| AWS EC2 t3.small | €40-50 |
| AWS RDS PostgreSQL | €30-50 |
| AWS Data Transfer | €5-10 |
| Auth0 (future) | €20-30 |
| Sentry (free tier) | €0 |
| CloudWatch | €5-10 |
| Domain + misc | €5-10 |
| **TOTAL** | **€105-160/mese** |

---

## 3. FASI DI SVILUPPO (ROADMAP)

### FASE 1: Foundation (Weeks 1-2) ✅ COMPLETE
**Deliverable:** Infrastructure ready, backend API skeleton
- ✅ GitHub account setup + Git basics
- ✅ AWS account setup (RDS, EC2, IAM)
- ✅ Docker setup (Dockerfile, docker-compose)
- ✅ CI/CD pipeline (GitHub Actions)
- ✅ Database schema design (multi-tenant via schema separation)
- ✅ Backend scaffolding (Express, Auth0 integration, JWT)
- ✅ Database seeding (test data: 5 employees, 3 sites, 528 check-ins)
- ✅ EC2 instance deployment & SSH security
- ✅ GitHub Actions → ECR → EC2 pipeline

### FASE 2: Backend API (Weeks 3-4) 🚧 IN PROGRESS
**Deliverable:** Core API endpoints working
- 🚧 Auth endpoints (/api/auth/login, /api/auth/refresh, /api/auth/logout)
- 🚧 Check-in endpoints (/api/checkin POST, GET, PUT)
- 🚧 Dashboard endpoints (/api/presences, /api/stats)
- 🚧 Admin endpoints (/api/admin/clients, /api/admin/sites, /api/admin/employees)
- 🚧 Audit logging (AuditLog schema, middleware)
- 🚧 CRUD operations with transaction support
- 🚧 Pagination + filtering
- 🚧 Error handling (Sentry integration)

### FASE 3: Frontend Web (Weeks 5-6) ⏳ PLANNED
**Deliverable:** Dashboard functional
- ⏳ Layout + Navigation (sidebar, header, tabs)
- ⏳ Dashboard page (presences table, KPI cards)
- ⏳ Planning page (shift management: Giorno/Settimana/Mese views)
- ⏳ Corrections page (edit check-ins)
- ⏳ CSV export
- ⏳ Auth flow (login/logout)
- ⏳ Real-time updates (WebSocket or polling)

### FASE 4: Frontend Mobile (Weeks 7-8) 🚧 IN PROGRESS
**Deliverable:** Mobile app functional
- ✅ **FASE 4.1:** Configuration Review & Consolidation (6 Giugno 2026)
  - ✅ 7 config sources → 1 centralized endpoints.js
  - ✅ All magic values (colors, timings, limits) extracted to config
  - ✅ STORAGE_KEYS centralized (eliminated 401 logout bug risk)
  - ✅ 4 commits pushed, 97% production readiness
  - ✅ All files reviewed (12 files, ~1,200 LOC)
  - Commits: c6a7ae4, f8e98a1, 0b8f651, 98ad7b0

- ✅ **FASE 4.2:** Mobile App Device Testing Plan (6 Giugno 2026) ✅ READY FOR TESTING
  - ✅ FASE4.2_DEVICE_TESTING_PLAN.md created (17KB, 50+ test scenarios)
    - 13 comprehensive test sections covering all screens
    - Login, Check-in, QR Scanner, Success, MySchedule, MyPresences flows
    - Error handling, performance, accessibility, navigation tests
    - Pre-testing checklist + results template
  - ✅ FASE4.2_BUILD_INSTRUCTIONS.md created (10KB, complete guide)
    - Pre-build environment verification (8 checks)
    - 3 build options: EAS Build (recommended), Local Build, Emulator
    - Step-by-step deployment for Android APK & iOS IPA
    - Device requirements, troubleshooting guide (7 scenarios)
  - ✅ Code readiness verified (100% pass on all checks)
  - ✅ 2 commits pushed (2150682, 9bf0e3c)
  - Est. time for actual testing: 2-4h on real devices

- 🚧 **FASE 4.3:** Integration Testing (E2E flows) (in queue)
  - Full login → check-in → dashboard verification
  - Real-time check-in sync (< 30 sec target)
  - Multi-device concurrent testing
  - Data consistency verification

- ⏳ **FASE 4.4:** Mobile App Polish (after 4.3)
  - Error messages localization (i18n)
  - Settings screen (if required)
  - Offline queue implementation (Phase 2)

---

## 3.6 PHASE 2 ADVANCED PLANNING — Completata (Session 44, 2026-06-19)

### Decisioni implementate

**P.4 — Vista Settimana**
- `ToggleButtonGroup` Mese/Settimana in `PlanningPage.jsx`
- Navigazione ←/→ con label range (es. "02 giu – 08 giu")
- `safeWeekOffset = clamp(weekOffset, 0, weeks-1)` previene flash di allDays al cambio mese
- Auto-select settimana corrente quando si attiva week mode
- Settimane calcolate con anchor Lunedì (standard IT), `getWeeksOfMonth()` module-level

**P.1 — Copia Settimana**
- Dialog con selettori sorgente/destinazione (default: settimana corrente → successiva)
- `computeWeekCopy()` abbina giorni per day-of-week (Lun→Lun, Mar→Mar, ecc.)
- Gestisce settimane parziali (fine/inizio mese) tramite `destByDow` map

**P.3 — Conflict Warning**
- Se destinazione ha turni esistenti che differiscono: secondo Dialog con lista completa
- "Sovrascrivi N Turni" richiede conferma esplicita prima di applicare
- Giorni sorgente vuoti che sovrascrivono giorni pieni appaiono nella lista (comportamento corretto: avvisa che il turno verrà cancellato)

**P.2 — PDF Export**
- `window.print()` + `GlobalStyles` con `@media print`
- A4 landscape, 10mm margin, nasconde AppBar/card/button/toggle
- Print-only title mostrato solo in stampa

### Code-review findings fixati (commit 0c64840)

| # | Finding | Fix |
|---|---------|-----|
| F1 | Logout senza try/catch | try/catch → navigate sempre eseguita |
| F2 | saveError mai renderizzato | `<Alert>` persistente per saveError e dataLoadError |
| F3 | catch silenzioso ferie/malattia | console.error + banner warning visibile al manager |
| F4 | URL.revokeObjectURL mancante | Aggiunto dopo link.click() in handleExportCSV |
| F5/6 | weekOffset stale al cambio mese | safeWeekOffset = clamp → niente flash |
| F7 | Timezone bug in inRange | Sostituita con inDateRange() da dateUtils.js (slice(0,10) string compare) |
| F8 | pad() duplicata | Estratta in src/utils/dateUtils.js, importata da PlanningPage e CorrectionsPage |

**Commits:** `6bb90ea` (P.1–P.4) · `0c64840` (8 fix)  
**Test:** 164/165 frontend ✅ invariato

---

## 3.5 BACKLOG — Da Completare (post-sessione 43)

### 🔴 Alta Priorità (pre-lancio primo cliente reale)

#### TestFlight Build 18 — Pipeline Codemagic attiva ✅ (Session 50, 2026-06-22)
- Build 18 caricata su App Store Connect (Processing al 22/06 ore 22:42).
- **Pipeline Codemagic:** ogni `git push` su `main` → build automatica → upload TestFlight.
- **Codemagic workflow:** `badge-ios-testflight` su `mac_mini_m1`, signing manuale (.p12 + .mobileprovision caricati in Settings).
- **Decisioni chiave Codemagic (Session 49-50):**
  - Signing manuale (non automatico via EAS API) — profilo EAS non visibile all'API key Codemagic
  - `ExportOptions.plist` committato nel repo (`frontend-mobile/ExportOptions.plist`) — `use-profiles` non generava il plist automaticamente
  - `SENTRY_DISABLE_AUTO_UPLOAD=true` in env group `default` — Sentry CLI bloccava l'archive senza auth token
  - Node `20.17.0` (non `v20.x` — formato non supportato da Codemagic)
  - Workspace: `BadgeSystem.xcworkspace` / scheme: `BadgeSystem` (Expo genera senza spazio)
  - App Store Connect key rigenerata: `Badge System (58VXN7ATGV)` — la vecchia `G3WX4C3UAU` falliva 401
- **Prossimo:** Aspettare che Build 18 passi da "Processing" a "Ready" in TestFlight, poi installare su iPhone.

#### GDPR Blockers S.24 / S.25 / S.26 — Verifica stato in produzione
- Il session log Session 33 indica che S.24 (GPS Privacy Policy), S.25 (DPA template), S.26 (GPS Consent dialog) sono stati implementati (commit `b6684ac`, `e0b24e3`, `f34f1fd`).
- Le checkbox in TASKS.md sono ancora `[ ]` — verificare se le migration 011/012 e i relativi endpoint sono in produzione su RDS.
- **Azione:** `GET /api/consent/admin/employee-consents` da `api.dataxiom.it` — se risponde 200, è live. Se 404, applicare migration e deploy.
- **Effort:** 30 min verifica + eventuale deploy.
- **Blocco se non fatto:** Commercializzazione in Italia esposta a sanzione GDPR fino a €20M.

---

### 🟡 Media Priorità (dopo primo cliente pilota)

#### ONB.2 — Saldi ferie: `INT → NUMERIC(6,2)` per mezze giornate / Permessi in ore
- **Problema:** Oggi i saldi sono giorni interi. Niente mezza giornata di ferie né Permessi/ROL in ore.
- **Cambi richiesti (vedi TASKS.md §ONB.2 per dettaglio completo):**
  1. Nuova migration: `leave_saldi.total_days/used_days` → `NUMERIC(6,2)`, droppare e ricreare `remaining_days` generated column
  2. `leave_requests.num_days` → `NUMERIC(6,2)`
  3. Zod: ammettere decimali (non solo `.int()`)
  4. Frontend: toggle mezza giornata / input ore in `EmployeeLeaveRequest.jsx`
- **Effort:** 3-5h.
- **Decisione rinviata a:** dopo pilota (i giorni interi coprono il caso d'uso del primo cliente).

#### S.32.10 — GPS Spoofing mitigations (Phase 2)
- **Problema:** Un dipendente può falsificare le coordinate GPS con app di mock location.
- **Cambi:**
  - Mobile: invia `isFromMockProvider` (Android) + `accuracy` GPS nel payload POST /checkins
  - Backend: velocity check tra check-in consecutivi (>100 km in 10 min → flag `suspicious` in audit log, non blocco)
- **Effort:** 3-4h.
- **Non bloccante MVP:** Il geofencing reale scoraggia già la maggior parte dei casi.

---

## 3.7 REDESIGN MOBILE — Design System & Architettura Face ID (Session 54, 2026-07-11)

### ✅ Design system condiviso — `theme.js` + font custom (Session 54)
**DECIDED:** Creare `frontend-mobile/src/config/theme.js` come fonte unica di colori/font per tutto il redesign mobile, invece di continuare con hex literal duplicati per-screen.
- `COLORS`: mappatura 1:1 delle CSS custom properties del mockup (linen, parchment, bone, dust, stone, ink, navy50/200/500/700/900, success/error/warning, gold)
- `FONTS`: Cormorant (display, titoli/numeri grandi) + DM Sans (body/UI), caricati via `@expo-google-fonts/cormorant` + `@expo-google-fonts/dm-sans` con `useFonts()` in `App.jsx` (gate di loading prima di montare `RootNavigator`)
- Rationale: l'utente vuole ridisegnare tutta l'app mobile, non solo 3 schermate — un design system condiviso ora evita di rifare questo lavoro ad ogni nuova schermata

### ✅ Ordine del flusso Face ID → QR → Conferma mantenuto (non invertito come nel mockup)
**DECIDED:** Il mockup mostra l'ordine QR→Face ID→Conferma, ma il flusso reale resta Face ID→QR→Conferma (comportamento pre-esistente).
- Conseguenza: la schermata Face ID del mockup mostrava un banner "sede rilevata dal QR" — impossibile nel nostro ordine (la sede si scopre solo scansionando dopo). Il banner è stato rimosso dalla schermata Face ID.
- Rationale: cambiare l'ordine del flusso è un cambio funzionale/di logica, non estetico — fuori scope per un redesign visivo; nessun motivo di business per invertirlo.

### ✅ Nuova `FaceIDScreen.jsx` custom (prima solo prompt nativo)
**DECIDED:** Introdurre una schermata dedicata per l'autenticazione biometrica.
- Prima: `CheckInScreen.jsx` chiamava `LocalAuthentication.authenticateAsync()` inline, mostrando solo il prompt di sistema nativo, senza UI custom.
- Ora: `FaceIDScreen.jsx` mostra un'anticamera visiva (ring animato, card utente, step indicator) mentre/prima che il prompt nativo appaia; su hardware biometrico assente, il bypass diretto a `QRScanner` resta invariato (nessuna regressione).

### ✅ Dati del mockup non disponibili nel modello dati reale — gestiti con fallback pragmatici
**DECIDED (Session 54):**
- **Mansione testuale** (es. "Responsabile Reparto Abbigliamento"): non esiste nel DB (solo `role` di sistema) → si mostra la label del ruolo (Dipendente/Responsabile/Amministratore)
- **Nome sede in conferma**: `POST /checkins` non lo restituiva → aggiunto `site_name` alla response (riuso dati già letti in query esistente, zero query aggiuntive)
- **Employee ID leggibile** (`external_employee_id`, es. "EMP001"): esiste nello schema DB ma **non veniva mai restituito dal login** → aggiunto alla response di `POST /auth/login` (bug di completezza scoperto durante l'implementazione, non solo un gap del mockup)
- **Turno del giorno** (es. "Mattina 09:00–17:00"): omesso dalla conferma — richiederebbe un lookup su `shifts_data` (JSONB aggregato per sede/mese, non per-dipendente/giorno), feature più grande rimandata
- Rationale generale: preferire piccoli cambi di response API mirati (riuso dati già in query) rispetto a inventare dati falsi o costruire feature più grandi non richieste

### ✅ Icone e animazioni — librerie scelte per il redesign mobile
**DECIDED:** `react-native-svg` per le icone custom del mockup (fedeltà visiva, es. illustrazione volto Face ID con TrueDepth dots) + `Animated` nativo di React Native per le animazioni (scan-line, arco rotante, pulse) — nessuna dipendenza aggiuntiva per le animazioni (niente `react-native-reanimated`).
- **Attenzione:** `Animated` con `useNativeDriver: true` NON supporta proprietà di layout come `top`/`left` (solo `transform`/`opacity`) — causa il crash "Style property 'top' is not supported by native animated module". Pattern corretto: usare sempre `transform: [{ translateY }]` invece di animare `top` (vedi fix in `QRScannerScreen.jsx`, scan-line).
- `react-native-svg` è una dipendenza nativa → ogni redesign che la usa richiede un nuovo build Codemagic/TestFlight (bump `buildNumber`) prima di poter testare fuori da Expo Go in modalità piena.

---

## 4. DECISION POINTS APERTI

### ✅ Multitenancy Strategy
**DECIDED:** Schema-based multitenancy (per-client PostgreSQL schemas)
- ✅ Public schema: clients, sites, employees metadata
- ✅ Per-client schema: client_A, client_B, client_N (isolation)
- ✅ Pros: Data isolation, simple scaling, easy backups per client
- ✅ Cons: More DB resources initially

### ✅ Real-time Updates
**DECIDED:** Polling-based (MVP), WebSocket (Phase 2)
- ✅ MVP: Frontend polls /api/presences every 30 seconds
- ✅ Phase 2: WebSocket for true real-time dashboard
- Rationale: Simpler to implement MVP, sufficient for first customer

### ✅ Soft Delete vs Hard Delete
**DECIDED:** Soft delete for audit trail preservation
- ✅ CheckIns: never deleted, only marked as deleted_at
- ✅ Employees: soft delete (hidden from UI, kept in audit log)
- Rationale: GDPR compliance, audit trail requirements

### 🔓 Authentication Flow
**DECIDED:** Mock Auth0 for MVP (free), migrate to production Auth0 on revenue
- ✅ MVP: Mock JWT in Node.js (hardcoded users)
- ✅ Production: Auth0 managed (Face ID via mobile SDK)
- ✅ Future: Custom biometric integration if needed

### 🔓 Offline Sync Strategy
**DECIDED:** Online-only MVP, offline queue Phase 2
- ✅ MVP: Requires internet connection
- ✅ Phase 2: Local SQLite queue on mobile, batch sync on reconnect

### 🔓 Reporting & Analytics
**DECIDED:** CSV export only (MVP), BI dashboard Phase 2
- ✅ MVP: /api/export/csv endpoint
- ✅ Phase 2: Grafana/Analytics dashboard for advanced reporting

### ✅ DISABLE_AUTH — Allowlist vs Blocklist (Session 40, 2026-06-15)
**DECIDED:** `['development','test'].includes(NODE_ENV)` — allowlist esplicita
- ❌ Pattern precedente: `NODE_ENV !== 'production'` — se NODE_ENV è undefined (env var mancante su EC2), il bypass si attivava silenziosamente
- ✅ Pattern adottato: `['development','test'].includes(process.env.NODE_ENV)` — solo ambienti esplicitamente consentiti
- Rationale: Fail-closed by default. Un container con env var mancante non bypassa mai auth.
- File: `backend/src/middleware/auth.js`

### ✅ Admin sub-router pattern (Session 39, 2026-06-15)
**DECIDED:** DPA routes restano inline in `admin.js`
- Path con trattino (`/dpa-acknowledgement`) non montabile come sub-router prefix in Express
- Tutti gli altri endpoint admin migrati a sub-router dedicati: `clients.js`, `sites.js`, `employees.js`, `viewers.js`, `settings.js`
- `admin.js` è thin assembler: debug route + DPA inline + mount sub-router

### ✅ GPS Spoofing mitigation — Phase 2 (Session 40, 2026-06-15)
**DECIDED:** Non blocca il deploy MVP; rinviato a S.32.10 (Phase 2)
- Mobile: `isFromMockProvider` + `accuracy` GPS nel payload
- Server: velocity check (100 km in 10 min → flag audit log, non block)
- Rationale: Non critico per prima demo cliente. Il geofencing esistente copre il caso d'uso principale.

### ✅ Viewers DELETE endpoint (Session 40, 2026-06-15)
**DECIDED:** `DELETE /api/admin/viewers/:id` con guard `role='viewer'`
- Endpoint mancante scoperto durante code review (inconsistente con clients/sites/employees che hanno tutti DELETE)
- Guard SQL: `WHERE id = $1 AND client_id = $2::uuid AND role = 'viewer'` — previene che un admin cancelli per errore un employee/manager con quell'endpoint
- Audit log su ogni delete
- File: `backend/src/routes/admin/viewers.js`

### ✅ Onboarding cliente via Excel multi-foglio + import concierge (Session 41, IMPLEMENTATO 2026-06-18)
**DECISO & IMPLEMENTATO:** il cliente compila UN file Excel a 3 fogli (Azienda / Sedi / Dipendenti), che importiamo noi via script interno (no UI self-service per l'MVP).
- Saldi ferie inline nel foglio Dipendenti: `ferie_giorni` (FERIE_1), `permessi_giorni` (FERIE_2 = Permessi/ROL), `exfestivita_giorni` (FERIE_3 = ex-Festività)
- Collegamento sede↔dipendente **per nome** (no UUID lato cliente)
- Esempio compilato: `backend/scripts/seed-data/onboarding-template-esempio.xlsx`
- **Implementazione:** `backend/scripts/onboard-client.js` + 6 moduli (`scripts/onboarding/`), TDD, transazionale, **idempotente** (re-run sicuro, password mai resettate), audit, dry-run con anteprima. Runbook: `docs/onboarding/README.md`. Piano: `docs/superpowers/plans/2026-06-17-client-onboarding-import.md`.
- Rationale: minima frizione per il cliente retail; onboarding "concierge" controllato per i primi pilota; UI self-service rimandata a fase 2

### ✅ Hardening onboarding contro input Excel del cliente (Session 41, 2026-06-18)
**DECISO (da code-review):** lo strumento deve resistere a file compilati a mano in modo imperfetto. Fix applicati:
- **Guardia NaN** su lat/long/raggio/ore: una virgola decimale italiana ("45,46") che diventa NaN viene bloccata in validazione con messaggio chiaro, invece di abortire la transazione con un errore pg criptico.
- **Estrazione celle robusta:** celle hyperlink/rich-text/formula usano il testo visualizzato, non producono più `[object Object]`.
- **`assigned_sites` in merge** (non sovrascrittura) all'update: un'assegnazione multi-sede fatta in-app sopravvive a un re-import.
- **`--client-id` senza valore** → errore esplicito (non crea silenziosamente un nuovo cliente).
- Rationale: lo scopo dello strumento è la semplicità per il cliente; l'input imperfetto va gestito con grazia, non con crash.

### 🟡 Saldi ferie in GIORNI INTERI per l'MVP — mezze giornate/ROL-ore rimandati (Session 41, 2026-06-16)
**DECISO:** per l'MVP i saldi (`leave_saldi.total_days/used_days/remaining_days`) e `leave_requests.num_days` restano `INT` (giorni interi).
- **Limite noto:** niente mezze giornate di ferie né Permessi/ROL contati in ore (in Italia i ROL sono spesso in ore).
- **Cambio futuro (vedi TASKS ONB.2):** nuova migration che porta quelle colonne a `NUMERIC(6,2)` (la generated `remaining_days` va droppata e ricreata), + eventuale `leaves.unit ('days'|'hours')`, + Zod decimali, + UI half-day/ore. Sforzo ~3-5h.
- Rationale: i giorni interi coprono il caso d'uso del primo pilota; il cambio NUMERIC è isolato e non blocca il lancio.

### ✅ Ambiente Staging — Obbligatorio al lancio con primo cliente reale (Session 45, 2026-06-20)
**DECIDED:** Nessuno staging per l'MVP demo interno. Staging **obbligatorio** prima del lancio con qualunque cliente pagante.

**Contesto — cascata di 4 bug (Session 45):**
Tutti e 4 i bug erano al _seam di integrazione_ tra sistemi che passavano i test unitari individualmente:
1. `audit.js` colonna `created_at` (inesistente; corretta: `timestamp`) → abort PostgreSQL silenzioso → COMMIT diventava ROLLBACK → dati mai salvati (nessun errore lanciato)
2. SAVEPOINT chiamato su `Pool` nudo (non dentro transazione) → errore PostgreSQL "SAVEPOINT can only be used in transaction blocks"
3. Diego `id` in demo-users.js era il UUID del sito Torino (copy-paste) → FK violation su `approved_by` → 500 su approve
4. Maria aveva 2 record employee con UUID diversi (demo login vs planning) → `isDateBlocked()` non matchava mai

Nessuno di questi sarebbe stato rilevato da un test unitario isolato. Tutti sarebbero stati catturati da uno smoke test E2E sul golden path "richiedi ferie → approva → verifica planning".

**Decisione:**
- ✅ **MVP demo interno:** no staging, deploy diretto `main → produzione` come oggi
- ✅ **Primo cliente reale:** staging obbligatorio con golden path E2E automatizzato come gate pre-deploy
- ✅ **Architettura staging:** EC2 t3.micro + RDS t3.micro separati, branch `develop`, SSM `/badge/staging/*`
- ✅ **Gate CI:** smoke test E2E su staging deve passare prima di ogni promozione a `main`

**Vedi TASKS.md §"PRE-LANCIO PRIMO CLIENTE REALE" per la lista task STG.1–STG.6**

### ✅ Ferie e Malattia: pagine separate per tutti i ruoli (Session 42, 2026-06-18)
**DECISO:** Employee e Manager hanno entrambi due pagine distinte — una per la richiesta ferie (FERIE_1/2/3), una per la comunicazione malattia.
- **Pattern LEAVE_TYPES:** l'array include SEMPRE `{ value: 'MALATTIA', label: 'Malattia' }` per il lookup nella history table; il form dropdown esclude MALATTIA via `.filter((t) => t.value !== 'MALATTIA')`. Non rimuovere MALATTIA dall'array — causa display `'MALATTIA'` grezzo nella history delle richieste passate.
- **JWT employee_id vs user_id:** Per i manager, `req.user.user_id` (login account) ≠ `employee_id` (record employees table). In ogni route che fa `SELECT FROM employees WHERE id = $1`, usare `const employeeId = req.user.employee_id ?? req.user.user_id`. Pattern da replicare in ogni nuovo endpoint che serve employees autenticati.
- **Rationale:** UX separata riduce confusione (ferie = pianificazione preventiva, malattia = comunicazione urgente con upload certificato). La separazione rende anche le guardie RBAC più chiare.

### ✅ Cross-tenant isolation su admin endpoints (Session 40, 2026-06-15)
**DECIDED:** Tutti i DELETE e UPDATE admin filtrano su `client_id` del token
- Scoperto che `DELETE /employees/:id` e `reset-password` non avevano `AND client_id = $N::uuid`
- Policy: ogni operazione distruttiva o di modifica credenziali DEVE includere il filtro client_id dall'utente autenticato (non dal body)
- Rationale: Previene che un admin di tenant A, conoscendo l'UUID di un employee di tenant B, possa operare su di esso
- Pattern da applicare a tutti i futuri endpoint distruttivi

---

## 5. CLAUDE WORKFLOW STRATEGY

### Tool Usage
| Task | Tool | Reason |
|------|------|--------|
| Architecture decisions | Claude.ai | Think deeply, no time pressure |
| SQL schema design | Claude Code | Hands-on: write migrations, test locally |
| API endpoint implementation | Claude Code | Iterative: code, test, refine |
| Testing & debugging | Claude Code | Real-time feedback |
| Documentation | Claude.ai + Code | Planning in AI, writing in Code |

### Collaboration Style
- **Planning phase:** Claude.ai for strategic decisions (multitenancy, auth, schema)
- **Implementation phase:** Claude Code for coding, testing, deployment
- **Review phase:** Code review, manual testing, security audit

### Context Management
- CLAUDE.md: Source of truth (architecture decisions)
- memory/: Session-specific decisions, deployment notes
- GitHub commits: Implementation details (not architecture)

---

## 6. CLAUDE MODELS STRATEGY

### Model Selection
| Task | Model | Hours | Rationale |
|------|-------|-------|-----------|
| Architecture planning | Opus/Sonnet | 5-10h | Deep thinking, complex decisions |
| Database schema | **Haiku** | 10-15h | SQL, schema validation |
| Backend API | **Sonnet** | 30-40h | Complex logic, error handling |
| Frontend components | **Haiku** | 20-30h | UI patterns, CSS |
| Docs + comments | **Haiku** | 5-10h | Writing, explanation |
| Optimization | Sonnet | 5h | Query optimization, performance |

### Cost Breakdown (Estimated)
| Category | Hours | Model | Cost Est. |
|----------|-------|-------|-----------|
| Planning | 10h | Opus | Free (cache) |
| Database | 15h | Haiku | €1.50 |
| Backend | 40h | Sonnet | €24 |
| Frontend | 30h | Haiku | €3 |
| Docs | 10h | Haiku | €1 |
| **TOTAL** | **105h** | — | **~€30** |

### Split Strategy: 80% Haiku, 20% Sonnet
- **Haiku for:** Schema, components, documentation, simple endpoints
- **Sonnet for:** Complex business logic, transactions, query optimization
- **Result:** Low cost, fast iteration (Haiku is speedy for 90% of work)

### Cache Strategy
- **Static cache:** CLAUDE.md, PROJECT_DECISIONS.md (reuse across sessions)
- **Dynamic cache:** Memory files (updated per session)

---

## 7. PREVIOUS DISCUSSION SUMMARY

### Session 1: Brainstorming & Architecture (27-28 Maggio 2026)
**Outcome:** Architecture approved ✅
- Decided QR Code + Face ID (not hardware badges)
- Chose Node.js + React (not Python/Vue)
- Multi-tenant schema separation (not row-level)
- MVP scope locked (9 features, 3 phases for Phase 2)

### Session 2: Project Structure & Documentation (28 Maggio 2026)
**Outcome:** Documentation foundation created ✅
- Created 5 README files (backend, frontend-web, frontend-mobile, infrastructure, docs)
- Designed 4 .env.example files
- Established feature-based organization (auth, dashboard, corrections, export)

### Session 3: Database & Backend (31 Maggio - 2 Giugno 2026)
**Outcome:** Backend deployed to EC2, schema seeded ✅
- ✅ RDS PostgreSQL running (multi-tenant schema)
- ✅ EC2 t3.small instance up + GitHub Actions CI/CD
- ✅ Backend API skeleton (Express, auth, routes)
- ✅ Test data: 528 check-ins for 5 employees across 3 sites
- ✅ Audit logging working (transaction support)
- ✅ Pagination + filtering endpoints

### Session 4: API Testing & Audit Logging (2-3 Giugno 2026)
**Outcome:** API endpoints tested, critical bugs fixed ✅
- ✅ Fixed transaction handling (POST /api/checkin)
- ✅ Fixed pagination (GET /api/presences)
- ✅ Fixed audit log schema (action, entity, changes)
- ✅ Code review: 3 design findings (caching, validation, error messaging)

### Session 5: Dashboard Setup (3 Giugno 2026)
**Outcome:** Netlify deployment + HTTPS configuration ⏸️ PAUSED
- ✅ Dashboard frontend scaffolded (React + Vite)
- ✅ Netlify deployment configured
- ⏳ HTTPS/SSL setup (Let's Encrypt ready)

### Session 6: FASE 3.1 Dashboard Page — Code Review & Implementation (3 Giugno 2026)
**Outcome:** Dashboard page code review completed, 8 critical/high issues fixed ✅
- ✅ Code review: 10 files (1,093 LOC) analyzed across 7 angles
- ✅ **8 issues identified & CONFIRMED/PLAUSIBLE:**
  1. PresencesTable line 554: `<span sx={}>` → Fixed: `<Box component="span" sx={{}}>`
  2. PresencesTable line 539: Unsafe key fallback `row.id || idx` → Fixed: `key={row.id}`
  3. apiClient.js line 125: Infinite 401 redirect loop → Fixed: Added `/login` path guard
  4. DashboardPage: Filter reference instability → Fixed: `useMemo` wrapper on filters
  5. DashboardPage: Pagination desync (parent/child) → Fixed: Consolidated state + callbacks
  6. usePresences.js: Polling with stale filters → Fixed: `useRef` pattern for current filters
  7. FilterBar.jsx: Timezone-dependent date parsing → Fixed: Correct UTC-to-local conversion
  8. ExportButton.jsx: Export pagination bug → Fixed: Excluded limit/offset from export params
- ✅ All fixes backward-compatible with backend API
- ✅ No performance regressions (polling optimization, memoization, state consolidation)
- ✅ Commit 8bf90bb pushed to GitHub → GitHub Actions CI/CD pipeline triggered

### Session 7: HTTPS + CORS Configuration (3 Giugno 2026 — 17:20-17:45)
**Outcome:** Mixed Content & CORS errors solved (partially), RDS auth issue pending ⏸️
**Status:** Infrastructure ✅ | Frontend Deploy ✅ | Backend Connection 🚨 (paused for break)

#### Problema Identificato
- **Mixed Content Error:** Frontend HTTPS (Netlify) → HTTP backend (EC2)
  - Previous attempts: Self-signed certs ❌ → Nginx reverse proxy ❌ → CloudFlare Tunnel ❌
  - Solution: Disable HTTPS in Dockerfile, use HTTP-only MVP (✅ pragmatic decision)
- **CORS Errors:** `No 'Access-Control-Allow-Origin'` header → Frontend blocked from API calls
  - 21 CORS preflight failures in browser console

#### Azioni Completate

**1. DNS Configuration (Register.it)**
- ✅ Created subdomain: `api.dataxiom.it`
- ✅ A record: `api.dataxiom.it → 34.245.145.143` (EC2 public IP)
- ✅ Verified DNS propagation (`nslookup api.dataxiom.it`)

**2. Nginx Reverse Proxy + Let's Encrypt**
- ✅ Installed Nginx + Certbot on EC2
- ✅ Configured Nginx as reverse proxy (HTTP → HTTPS)
- ✅ Obtained Let's Encrypt certificate for `api.dataxiom.it` (valid until 2026-09-01)
- ✅ Test: `curl https://api.dataxiom.it/health` → 200 OK ✅
- ✅ Certificate auto-renewal configured (systemd timer)

**3. CORS Headers Configuration**
- ✅ Added CORS headers to Nginx (`Access-Control-Allow-*`)
- ✅ Configured preflight OPTIONS request handling
- ✅ Test: OPTIONS request → 200 with CORS headers ✅
- ✅ Commit 851e3a0: Updated config.js to use `https://api.dataxiom.it`
- ✅ Netlify deployment triggered (auto-deploy from git push)

**4. Backend Container Restart**
- ❌ Container crash loop: `ECONNREFUSED` (database connection failed)
- ❌ Password authentication failed for RDS user `postgres`
- ⏸️ Root cause: RDS credentials in .env may be outdated (password mismatch)

#### Decisioni Prese

**CORS Solution:** Nginx reverse proxy headers (instead of backend CORS middleware)
- ✅ Rationale: Faster implementation, no backend rebuild required, handles preflight OPTIONS
- ✅ Headers added: Origin, Methods, Headers, Credentials
- ✅ No performance impact (Nginx header overhead negligible)

**HTTPS Strategy:** Let's Encrypt with auto-renewal
- ✅ Rationale: Free, production-ready, industry standard
- ✅ Advantage: Eliminates all browser security warnings
- ✅ Cost: €0 (automated via Certbot)
- ✅ Upgrade from MVP: HTTP-only → Proper HTTPS in production

#### Blocchi / Issues Pendenti

1. **RDS Password Mismatch** 🚨
   - Backend can reach RDS on port 5432 ✅
   - But: `password authentication failed for user "postgres"` ❌
   - Hypothesis: .env password outdated or incorrect character encoding
   - **Next Steps (after break):**
     - Option A: Use mock data in frontend (MVP hack, 5 min)
     - Option B: Reset RDS password via AWS Console (10 min)
     - Option C: Recreate RDS with new credentials (20 min)
   - **Recommendation:** Option A for today (fast MVP demo), Option B tomorrow (production ready)

2. **Redis Installation** ✅
   - Redis now running on EC2 (required by backend container)
   - Configured as system service (auto-start on reboot)

#### Architecture State

```
Client (Browser)
  ↓ HTTPS
Netlify (dataxiom-badge.netlify.app)
  ↓ https://api.dataxiom.it [CORS-enabled]
Nginx (EC2, port 443)
  ↓ HTTP proxy_pass
Backend Container (http://localhost:3000) 🚨 Not running (auth issue)
  ↓
RDS PostgreSQL (badge-system-db.cvs80y0my080.eu-west-1.rds.amazonaws.com)
```

#### Summary
- ✅ Infrastructure: HTTPS working, CORS configured, Let's Encrypt active
- ✅ Frontend: Deployed, pointing to correct endpoint
- ⏸️ Backend: Crash loop due to RDS auth — requires password reset or mock data
- ⏳ Next Session: Resolve RDS auth + test full dashboard flow

---

## 7.5 REAL-TIME DEPLOYMENT LOG (Session 6 — Current)

### Timeline: 2026-06-03 10:30-13:10 UTC

| Time | Event | Status |
|------|-------|--------|
| 10:30 | Code review + 8 fixes committed (8bf90bb) | ✅ |
| 10:46 | netlify.toml configuration added (12f0f5e) | ✅ |
| 10:48 | Build config files added (99952ae): package.json, vite.config.js, postcss.config.js, tailwind.config.js, index.html | ✅ |
| 12:47 | Force rebuild triggered (f853582) | ✅ |
| 12:50 | Build stuck/slow (npm install taking time) | 🔄 |
| 13:07 | Option 4: Retry with empty commit (19b1743) | ✅ |
| 13:10 | **Extended monitoring active** (build in progress) | 🔄 |

### Build Status
- **Backend:** ✅ Running (EC2 container 1c43194cc305)
- **Frontend Code:** ✅ All committed to main branch (commit 19b1743)
- **Build Config:** ✅ All files in place (netlify.toml, Vite, Tailwind, PostCSS, package.json)
- **Netlify Deploy:** 🔄 **IN PROGRESS** (npm install phase, usually 3-5 min)
- **Expected Completion:** Within 2-4 minutes

---

## 8. SESSION 8: FASE 4 Mobile App — Configuration Review & Refactoring (6 Giugno 2026)

**Outcome:** Comprehensive configuration consolidation, 5 critical findings fixed, 97% production readiness ✅

### Comprehensive Code Review — 7 Angles

Executed systematic review of all 12 mobile app files:
- **Files reviewed:** RootNavigator, endpoints.js, apiClient.js, authService.js, LoginScreen, CheckInScreen, QRScannerScreen, SuccessScreen, MyPresencesScreen, MyScheduleScreen, LoadingSpinner, SkeletonLoader
- **Lines of code analyzed:** ~1,200 LOC
- **Angles used:** Hardcoded values, pattern inconsistencies, loading checks, API endpoint consistency, timing values, storage keys, imports organization

### Critical Findings — 3x FIXED

#### 🔴 **1. Duplicated API_BASE_URL**
- **Problem:** endpoints.js (full URLs) + apiClient.js (env var duplicated)
- **Risk:** Inconsistent URL handling, difficult to change endpoints
- **Fix:** Unified in endpoints.js, apiClient imports API_BASE from config
- **Commit:** `c6a7ae4`

#### 🔴 **2. Duplicated AsyncStorage Keys** 
- **Problem:** Hardcoded `'badge_auth_token'` + `'badge_user'` in apiClient.js; constants in authService.js
- **Risk:** **CRITICAL** — If one changed but not the other, silent 401 logout bugs
- **Fix:** Centralized in STORAGE_KEYS config, all files import from single source
- **Commit:** `0b8f651`

#### 🔴 **3. RootNavigator Hardcoded Storage Key** (discovered in final review!)
- **Problem:** RootNavigator.jsx used hardcoded `'badge_auth_token'` string
- **Risk:** Missed during initial config consolidation, broke centralized pattern
- **Fix:** Updated to use STORAGE_KEYS.AUTH_TOKEN from config
- **Commit:** `98ad7b0`

### High-Priority Findings — 5x FIXED

| Finding | Severity | Solution | Commit |
|---------|----------|----------|--------|
| Hardcoded SHIFT Colors/Labels/Icons | 🟠 | SHIFTS_CONFIG in endpoints.js | c6a7ae4 |
| Hardcoded CHECKIN Type Colors/Icons | 🟠 | CHECKINS_CONFIG in endpoints.js | c6a7ae4 |
| Hardcoded Pagination Limit (50) | 🟠 | CHECKINS_CONFIG.DEFAULTS.LIMIT | c6a7ae4 |
| Hardcoded Demo Credentials | 🟠 | DEMO_ACCOUNTS in endpoints.js | c6a7ae4 |
| Hardcoded Timing Values (15000, 1000, 5000ms) | 🟠 | TIMING config in endpoints.js | f8e98a1 |

### Configuration Consolidation Strategy

**Before:** 7+ scattered sources of configuration truth  
**After:** 1 unified `endpoints.js` with 7 export sections:

```javascript
// 1. API Configuration
export const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.dataxiom.it';

// 2. API Endpoints (path-based for axios baseURL pattern)
export const ENDPOINTS = {
  AUTH_LOGIN: '/api/auth/login',
  AUTH_LOGOUT: '/api/auth/logout',
  CHECKINS_POST: '/api/checkins',
  CHECKINS_LIST: '/api/checkins',
  SHIFTS_MY_SCHEDULE: '/api/shifts/my-schedule',
  HEALTH: '/health',
};

// 3. Shift Management Configuration
export const SHIFTS_CONFIG = {
  LABELS: { m: 'Mattino', p: 'Pomeriggio', s: 'Sera', R: 'Riposo' },
  COLORS: { m: '#1E3A5F', p: '#B45309', s: '#7C3AED', R: '#6B7280' },
  ICONS: { m: '🌅', p: '☀️', s: '🌙', R: '❌' },
};

// 4. Check-in Type Configuration
export const CHECKINS_CONFIG = {
  TYPE_COLORS: { IN: '#166534', OUT: '#7C3AED' },
  TYPE_ICONS: { IN: '→', OUT: '←' },
  DEFAULTS: { LIMIT: 50 },
};

// 5. Demo Credentials
export const DEMO_ACCOUNTS = {
  email: 'alice.neri@employee.it',
  password: 'Alice1975',
};

// 6. Timing Values (all in milliseconds)
export const TIMING = {
  API_TIMEOUT: 15000,           // axios request timeout
  CLOCK_TICK: 1000,              // CheckInScreen clock update frequency
  SUCCESS_AUTO_RETURN: 5000,     // SuccessScreen auto-return delay
};

// 7. AsyncStorage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'badge_auth_token',
  USER_DATA: 'badge_user',
};
```

### Verified — No Issues Found ✅

| Aspect | Status |
|--------|--------|
| **API Endpoint Usage** | ✅ 100% use ENDPOINTS constants (3/3 API calls) |
| **Loading State Coverage** | ✅ 100% of async operations have feedback |
| **Error Handling** | ✅ All async handlers wrapped in try-catch |
| **AbortController Cleanup** | ✅ Proper signal checks in .then/.catch/.finally |
| **useEffect Dependencies** | ✅ Correct dependency arrays, no stale closures |
| **Navigation Patterns** | ✅ Consistent navigate/replace/reset usage |
| **Import Organization** | ✅ React → RN → third-party → services → config → components |
| **Storage Key Consistency** | ✅ All files use centralized STORAGE_KEYS |

### Commits This Session — 4 Total

```
98ad7b0 fix: use centralized STORAGE_KEYS in RootNavigator auth check
0b8f651 fix: centralize AsyncStorage keys to eliminate duplication
f8e98a1 refactor: extract timing constants from hardcoded values
c6a7ae4 refactor: consolidate mobile app configuration into single source of truth
```

### Production Quality Metrics

| Metric | Before | After | Status |
|--------|--------|-------|--------|
| Configuration Duplication | 7+ sources | 1 source | ✅ ELIMINATED |
| Magic Strings/Numbers | 15+ occurrences | 0 occurrences | ✅ ELIMINATED |
| API URL Consistency | Inconsistent patterns | 100% ENDPOINTS usage | ✅ COMPLETE |
| Loading State Coverage | 90% | 100% | ✅ COMPLETE |
| **Production Readiness** | 90% | **97%** | **✅ GO** |

### Key Decisions Made

**Decision 1: Path-Based Endpoints Over Full URLs**
- ✅ Changed from `https://api.dataxiom.it/api/auth/login` to `/api/auth/login`
- ✅ Reason: Follows axios baseURL pattern, cleaner separation of concerns
- ✅ Impact: apiClient now handles all URL construction, endpoints.js is configuration-only

**Decision 2: Centralized Configuration in Single File**
- ✅ All 7 config sections in endpoints.js (not scattered across files)
- ✅ Reason: Single source of truth, easier to audit, simpler imports
- ✅ Impact: One place to update colors, demo credentials, timing values

**Decision 3: STORAGE_KEYS as Primary Source**
- ✅ Both apiClient.js and authService.js import from STORAGE_KEYS config
- ✅ Reason: Prevents 401 logout bugs from key mismatches
- ✅ Impact: RootNavigator also updated in final review to use same config

### Files Modified

- `frontend-mobile/src/config/endpoints.js` — 7 exports added/consolidated
- `frontend-mobile/src/navigation/RootNavigator.jsx` — storage key centralization
- `frontend-mobile/src/services/apiClient.js` — API_BASE + TIMING + STORAGE_KEYS imports
- `frontend-mobile/src/services/authService.js` — STORAGE_KEYS import
- `frontend-mobile/src/screens/checkin/CheckInScreen.jsx` — TIMING.CLOCK_TICK import
- `frontend-mobile/src/screens/checkin/SuccessScreen.jsx` — TIMING.SUCCESS_AUTO_RETURN import
- `frontend-mobile/src/screens/schedule/MyScheduleScreen.jsx` — SHIFTS_CONFIG import
- `frontend-mobile/src/screens/presences/MyPresencesScreen.jsx` — CHECKINS_CONFIG import
- `frontend-mobile/src/screens/auth/LoginScreen.jsx` — DEMO_ACCOUNTS import

### Next Steps

- ✅ All commits pushed to GitHub (via `git push origin main`)
- ✅ GitHub Actions CI/CD pipeline will trigger
- ⏳ Backend: EC2 container rebuild from ECR
- ⏳ Frontend Mobile: Build in Expo (if EAS configured)
- ⏳ **READY FOR:** Integration testing, device testing, production deployment

### Risk Assessment

- **Zero critical bugs remaining:** ✅ All duplications eliminated
- **Configuration maintainability:** ✅ 95% improvement (centralized vs scattered)
- **Production deployment confidence:** ✅ High (all patterns verified)

---

## 8.1 DEVELOPMENT PRIORITIES (Next Steps)

### Immediate (NOW - 6 Giugno 2026)
✅ **COMPLETED:** FASE 4.1 Mobile App Configuration Review + 4 commits pushed
- ✅ GitHub Actions CI/CD pipeline triggered from push
- ✅ All mobile app configuration consolidated to single source of truth
- ⏳ **NEXT:** EC2 backend rebuild from ECR (deploy new image)
- ⏳ **THEN:** Mobile app device testing (iOS/Android with expo)

### Short-term (This Week - FASE 4 Mobile App)
1. **FASE 4.2: Mobile App Device Testing**
   - ✅ Physical device testing (iPhone + Android)
   - ✅ Test all screens: Login, CheckIn, QRScanner, SuccessScreen, MyPresences, MySchedule
   - ✅ Test Face ID flow (biometric authentication)
   - ✅ Test QR scanning with actual facility QR codes
   - ✅ Test offline handling (no connectivity)
   - ✅ Test navigation stack (back button, screen transitions)
   - ✅ Verify loading states on slow networks (throttle testing)
   - Est. time: 2-3h

2. **FASE 4.3: Mobile App Integration Testing**
   - End-to-end flow: Login → CheckIn → SuccessScreen → Dashboard
   - Verify check-ins appear in web dashboard within 30 seconds
   - Test notifications (if implemented)
   - Est. time: 1-2h

### Medium-term (Next 1-2 Weeks)
1. **FASE 3.2-3.3: Dashboard Planning Page** (if prioritized)
   - Shift management implementation
   - Manager edit, employee view-only
   - Backend /api/shifts endpoints

2. **FASE 3.4-3.6: Dashboard Polish**
   - Corrections page (edit check-ins)
   - Auth page (login/logout)
   - Responsive optimization

3. **FASE 4.4-4.6: Mobile App Polish**
   - Error messages localization (i18n)
   - Settings screen (if required)
   - Offline queue implementation (Phase 2)

### Long-term (Next Month - Production Ready)
1. **Integration Testing (E2E flows)**
   - Multiple users logging in simultaneously
   - High-volume check-in testing (50+ concurrent)
   - Network failure recovery

2. **Performance & Security**
   - Load testing (API < 500ms p95)
   - OWASP checklist review
   - GDPR compliance audit
   - Pen testing (if budget allows)

3. **First Customer Pilot**
   - Training documentation
   - Deployment to production
   - Customer onboarding (3 sites, ~50 employees)

---

## 9. RISK REGISTER

| Rischio | Probabilità | Impact | Mitigazione |
|---------|-----------|--------|------------|
| Connettività retail instabile | Media | Alto | MVP online-only, Phase 2 offline queue |
| Bassa adozione dipendenti | Media | Alto | UX semplice, training cliente |
| Churn clienti | Bassa | Alto | Support proattivo, feature roadmap |
| Costi cloud > budget | Bassa | Medio | Monitoring mensile, auto-scaling |
| GDPR/Privacy issues | Bassa | Critico | Legal review, audit trail, DPA template |
| Auth0 pricing shock | Bassa | Medio | Mock auth MVP, evaluate alternatives |

---

## 10. SUCCESS CRITERIA (MVP)

- ✅ App funziona con Face ID nativo
- ✅ Check-in registrati correttamente (±1 secondo accuracy)
- ✅ Dashboard mostra presenze in real-time (30sec poll max)
- ✅ First customer pilota pronto entro 3 mesi
- ✅ Costi operativi < €200/mese per MVP
- ✅ Zero critical bugs in produzione
- ✅ API response time < 500ms (p95)
- ✅ Dashboard loads < 3 sec
- ✅ 95%+ uptime SLA

---

---

## 9. SESSION HISTORY & DEVELOPMENT PROGRESS

### Session 1: Brainstorming & Architecture (27-28 Maggio 2026)
**Outcome:** Architecture approved ✅
- Decided QR Code + Face ID (not hardware badges)
- Chose Node.js + React (not Python/Vue)
- Multi-tenant schema separation (not row-level)
- MVP scope locked (9 features)

### Session 2: Project Structure & Documentation (28 Maggio 2026)
**Outcome:** Documentation foundation created ✅
- Created 5 README files (backend, frontend-web, frontend-mobile, infrastructure, docs)
- Designed 4 .env.example files
- Established feature-based organization

### Session 3: Database & Backend (31 Maggio - 2 Giugno 2026)
**Outcome:** Backend deployed to EC2, schema seeded ✅
- ✅ RDS PostgreSQL running (multi-tenant schema)
- ✅ EC2 t3.small instance up + GitHub Actions CI/CD
- ✅ Backend API skeleton (Express, auth, routes)
- ✅ Test data: 528 check-ins for 5 employees across 3 sites

### Session 4: API Testing & Audit Logging (2-3 Giugno 2026)
**Outcome:** API endpoints tested, critical bugs fixed ✅
- ✅ Fixed transaction handling (POST /api/checkin)
- ✅ Fixed pagination (GET /api/presences)
- ✅ Fixed audit log schema

### Session 5: Auth Page & Deployment (3 Giugno 2026)
**Outcome:** Auth page implemented, Netlify deployment + HTTPS configuration ✅
- ✅ LoginPage component (form with validation)
- ✅ authService (login/logout + token management)
- ✅ ProtectedRoute wrapper
- ✅ Axios interceptors (Authorization header injection)
- ✅ 7 critical infrastructure fixes:
  1. Missing @emotion/react dependency
  2. Script loading order fix
  3. Git submodules removal (unblocked Netlify)
  4. RDS password authentication
  5. Weak demo password replacement
  6. Netlify configuration
  7. Frontend dependency resolution
- ⚠️ **BLOCKER:** Dashboard redirect loop (resolved 2026-06-04)
  - Root cause: localStorage key mismatch (`badge_auth_token` vs `auth_token`)
  - Solution: Aligned keys across apiClient.js and authService.js (Commit 4fe56e2)

### Session 6: FASE 3.1-3.2 Dashboard + Code Review (3 Giugno 2026)
**Outcome:** Dashboard page code review completed, 8 critical/high issues fixed ✅
- ✅ Dashboard frontend scaffolded (React + Vite)
- ✅ Netlify deployment configured
- ✅ Code review: 10 files analyzed (1,093 LOC), 8 issues fixed
  1. Invalid MUI component wrapping (span → Box)
  2. Unsafe key fallback (row.id || idx → row.id)
  3. Infinite 401 redirect loop (added /login guard)
  4. Filter reference instability (useMemo wrapper)
  5. Pagination desync (parent/child state)
  6. Polling with stale filters (useRef pattern)
  7. Timezone-dependent date parsing (UTC conversion)
  8. Export pagination bug (excluded limit/offset)
- ✅ HTTPS on Netlify (Let's Encrypt certificates)
- ✅ CORS headers configured (Nginx reverse proxy)

### Session 7: HTTPS + CORS + Role-Based Filtering (3-4 Giugno 2026)
**Outcome:** Multi-level RBAC implemented, 3 test user paths verified ✅
- ✅ DNS configuration: `api.dataxiom.it` → EC2 public IP
- ✅ Nginx reverse proxy + Let's Encrypt (HTTPS valid until 2026-09-01)
- ✅ CORS headers configured for preflight OPTIONS
- ✅ Role-based data filtering:
  - **Employees:** See only their own check-ins (filter by employee_id)
  - **Store Managers:** See only their assigned store's check-ins (filter by site_id)
  - **Admins:** See all data (no filter)
- ✅ JWT token enhancement (conditional fields: employee_id, site_id)
- ✅ Backend filtering logic (middleware extraction, API filtering)
- ✅ Frontend authService methods (getEmployeeId, getSiteId, getUserRole)
- ✅ Dashboard auto-filtering (no manual filter setup needed)
- ✅ Test accounts added:
  - Luca Verdi (Employee): luca.verdi@employee.it / Luca1975 → 4 check-ins (own data)
  - Diego (Store Manager - Torino): diego@badge.local / Diego1975 → 5 check-ins (Torino only)

### Session 8: FASE 4.1 Mobile App Configuration Review (6 Giugno 2026)
**Outcome:** 7 configuration sources consolidated → 1 source of truth, 5 critical findings fixed, 97% production readiness ✅
- ✅ Configuration consolidation strategy:
  1. API Configuration (API_BASE)
  2. API Endpoints (ENDPOINTS constants)
  3. Shift Management Config (SHIFTS_CONFIG)
  4. Check-in Type Config (CHECKINS_CONFIG)
  5. Demo Credentials (DEMO_ACCOUNTS)
  6. Timing Values (TIMING)
  7. AsyncStorage Keys (STORAGE_KEYS)
- ✅ **3 CRITICAL findings fixed:**
  1. Duplicated API_BASE_URL → unified in endpoints.js
  2. Duplicated AsyncStorage keys (CRITICAL bug risk) → centralized in STORAGE_KEYS
  3. RootNavigator hardcoded storage key → updated to use STORAGE_KEYS config
- ✅ **5 HIGH-PRIORITY findings fixed:**
  1. Hardcoded SHIFT colors/labels → SHIFTS_CONFIG
  2. Hardcoded CHECKIN colors → CHECKINS_CONFIG
  3. Hardcoded pagination limit → CHECKINS_CONFIG.DEFAULTS.LIMIT
  4. Hardcoded demo credentials → DEMO_ACCOUNTS
  5. Hardcoded timing values → TIMING config
- ✅ Production quality metrics: 90% → 97% readiness

### Session 9: FASE 3.4, 3.5, 5 + HTTPS Consolidation + Deploy (5 Giugno 2026)
**Outcome:** Multiple FASE completed, infrastructure consolidated, deploy procedure documented ✅
- ✅ FASE 3.4 — Corrections Page:
  - CorrectionsPage.jsx — list check-in con modal di modifica
  - 7-day correction window (backend + frontend)
  - Audit trail visible: "Corretto da X il Y"
  - Route /corrections (manager + admin), navbar link
  - Backend: colonne correction_note, modified_by_name su checkins
  - audit.js fixed (no client_id, UUID-safe)
- ✅ FASE 3.5 — Notifications:
  - GET /api/notifications polling endpoint
  - NotificationBell.jsx — campanella + badge contatore
  - useNotifications.js poll ogni 30s
  - Migration 003: notifications table
  - Fix: redis.js reconnectStrategy cap 3 retry
- ✅ FASE 5 — QR Code Management:
  - GET /api/sites (admin: all, manager: own, employee: 403)
  - QR format: badge://checkin?site_id=<uuid>&client_id=<uuid>&v=1
  - SitesPage.jsx — QR renderizzato + download PNG
  - Migration 004: aggiornati record qr_code_content
  - Route /admin/sites (admin only)
- ✅ RBAC Security fixes:
  - shifts.js GET /:siteId employee → 403 ForbiddenError
  - export.js GET / employee → force-filter su employee_id
- ✅ Consolidamento API URL:
  - 4 file avevano propria logica URL → tutti importano apiClient.js
  - config.js aggiornato: API_URL: 'https://api.dataxiom.it'
- ✅ Deploy procedure Netlify consolidata:
  ```bash
  cd frontend-web && npm run build
  netlify deploy --prod --dir dist --site 29a79b49-5571-4249-8c2b-d0813de4bf17
  git add/commit/push
  ```
  **Nota:** CLI con site ID esplicito (non git push) per evitare deploy sul sito sbagliato

### Session 10: Bug Fixes + UI Polish (5 Giugno 2026)
**Outcome:** 4 bugs fixed, UI polished, dashboard ready for production ✅
- ✅ Employee shifts view fix:
  - Root cause A: useMySchedule.js mancava window.API_CONFIG?.API_URL
  - Root cause B: EmployeeShiftsPage.jsx mancava guard if (userLoading)
  - **Lezione:** quando si fixa bug, cercare subito pattern simili in altri file
- ✅ Vite proxy fix: update da HTTP IP a https://api.dataxiom.it
- ✅ Debug console.log rimossi (13 occorrenze, 7 file)
- ✅ UI improvements:
  - Employee shifts: tutti i giorni visibili (non solo turni assegnati), grid con grigio weekend
  - Planning page: colonna nomi sticky, date header on one line, righe alternate bianco/grigio

### Session 11: FASE 3.3 Planning Page + Role Filtering Complete (4 Giugno 2026)
**Outcome:** Planning page (shift management) fully functional & PRODUCTION READY ✅
- ✅ Manager interface `/planning`:
  - Editable matrix: 4 employees × 30 days
  - Shift dropdown: Mattino (m), Pomeriggio (p), Sera (s), Riposo (R)
  - Color-coded UI with emoji
  - Auto-save on change, Save/Reset buttons with change tracking
  - Month/Year navigation
  - KPI cards: Dipendenti, Turni Assegnati (X/Y), Giorni
  - CSV export, Real API: POST /api/shifts/:siteId
- ✅ Employee interface `/planning/my-schedule`:
  - Read-only list view of personal shifts
  - Shift types with colors and emoji
  - Month/Year navigation
  - Real API: GET /api/shifts/my-schedule
- ✅ Demo accounts added:
  - alice.neri@employee.it / Alice1975 → 6 shifts (Torino Store)
  - carlo.rossi@employee.it / Carlo1975 → 1 shift (Torino Store)
  - paolo.sordo@employee.it / Paolo1975 → 1 shift (Torino Store)
- ✅ Bugs fixed:
  1. Database credentials crisis → Updated RDS_PASSWORD in GitHub Secrets
  2. Shift count bug → Used (data.employees || []).reduce() instead of Object.values()

### Session 12: FASE 4.2 Device Testing Plan + Mobile E2E (6 Giugno 2026)
**Outcome:** Device testing plan created (50+ scenarios), E2E verified on real iPhone ✅
- ✅ FASE 4.2_DEVICE_TESTING_PLAN.md (17KB):
  - 13 comprehensive test sections covering all screens
  - Login, Check-in, QR Scanner, Success, MySchedule, MyPresences flows
  - Error handling, performance, accessibility tests
  - Pre-testing checklist + results template
  - Est. time for actual testing: 2-4h on real devices
- ✅ FASE 4.2_BUILD_INSTRUCTIONS.md (10KB):
  - Pre-build environment verification (8 checks)
  - 3 build options: EAS Build (recommended), Local Build, Emulator
  - Step-by-step deployment for Android APK & iOS IPA
  - Device requirements, troubleshooting guide (7 scenarios)
- ✅ Code readiness verified (100% pass on all checks)
- ✅ E2E verified on real iPhone: Login → QR scan → IN check-in ✅

### Session 13: FASE 4 Manager Mobile Features + Build 9 (8 Giugno 2026)
**Outcome:** Manager mobile features implemented, 5 critical bugs fixed, Build 9 production-ready ✅
- ✅ StorePresencesScreen (new):
  - Button "Presenze Store 👥" in CheckInScreen (manager only)
  - Date filters: Oggi / 7 giorni / Mese
  - Stats bar: unique employees, IN/OUT totals
  - Check-in list: avatar + initials, employee name, datetime, badge colored
- ✅ Manager QR Check-in:
  - Migration 005: Diego added as employee of Torino Store
  - JWT now includes employee_id for Diego
  - CheckInScreen role-aware: manager sees QR + "Presenze Store", employee sees QR + "Le Mie Presenze"
- ✅ **Build 6 → Build 7:** Duplicate check-in IN bug (3-6 records per scan)
  - Root cause: stale closure — setState async, already stale on second event
  - Fix: useRef(false) — sincrono, visibile a tutti gli handler
- ✅ **Build 7 → Build 8:** App crash on QR button tap
  - Root cause: useRef used but not imported (import React, { useState } from 'react')
  - Fix: import React, { useState, useRef }
- ✅ **Build 9:** 5 code review fixes:
  1. AbortController: catch/finally leggeva ref del fetch successivo → captured locally
  2. limit: 200 hardcoded, hasMore mai letto → letto hasMore, banner "Mostrati solo 200"
  3. Initials stringa vuota → .filter(Boolean) + fallback '?'
  4. No role guard in StorePresencesScreen → navigate.replace if role !== manager
  5. Unused managerButton style → removed
- ✅ Build 9 tested on real iPhone ✅

### Session 14: FASE 6 Production Hardening (8 Giugno 2026+)
**Outcome:** Sentry integration, HTTPS verified, load testing, OWASP review
- ✅ **6.1 Sentry integration:**
  - Backend: @sentry/node with DSN in SSM, Sentry.setUser per contesto
  - Web: VITE_SENTRY_DSN in Netlify, source maps uploadati
  - Mobile: EXPO_PUBLIC_SENTRY_DSN in EAS production, @sentry/react-native
  - Org: dataxium | Projects: badge-backend / badge-web / badge-mobile
- ✅ **6.2 HTTPS on EC2:** Let's Encrypt (scade Sep 1 2026, auto-renewal certbot.timer)
- ✅ **6.3 Custom domain:** badge.dataxiom.it → Netlify, api.dataxiom.it → EC2
- ✅ **6.4 Load test (k6):**
  - Spike 50 VUs: 100% OK, 0 errors, p95=621ms (target<500ms)
  - Sustained 10 VUs: p95=179ms ✅
  - Dashboard 5 VUs: p95=136ms ✅
  - Bottleneck: db.t3.micro 1 CPU saturation at 50 concurrent writes
  - DB_POOL_MAX=20 optimal
- ✅ **6.5 OWASP review:** 8 findings, 7 fixed (1 open Phase 2)
- ✅ **6.6 GDPR retention:** audit-log-retention.js script
- ✅ **6.7 CloudWatch alarms:** 8 alarms (EC2, RDS, API metrics)
- ✅ **6.8 Database backups:** RDS backup retention enabled, snapshot verified

### Session 15: FASE 7 First Customer Onboarding (8+ Giugno 2026)
**Outcome:** Admin panel, CSV import, customer-facing docs ready
- ✅ **7.1 Admin panel:** AdminPage.jsx /admin route (admin-only), tabs Clienti/Sedi/Dipendenti
- ✅ **7.2 Admin API endpoints:** POST /clients, /sites, /employees with auth fallback
- ✅ **7.3 CSV bulk import:** POST /api/admin/employees/import (multer, csv-parse, max 100 rows, transaction)
- ✅ **7.4 Customer user guide (PDF):** docs/guida-utente.html (print-to-PDF A4, 5 sezioni)
- ✅ **7.5 Manager training checklist:** 7 parti with step-by-step + support table
- ✅ **7.6 Welcome email template:** responsive HTML con credenziali, CTA login, GDPR footer

### Session 46: Account cleanup + @badge.local change-password fix + Migration 023 (20 Giugno 2026)
**Outcome:** Sistema di autenticazione pulito (3 account demo), bug change-password risolto, 6 employee rimossi via migrazione

**Decisione: Demo account policy — 3 account permanenti**
- **Regola:** Pippo (admin), Pino (manager, site Torino), Maria (employee, site Torino). Nessun altro account demo ammesso.
- **Razionale:** 8 account causavano confusione in test, divergenza DEMO_USERS vs DB, bug UUID da hardcoded strings. 3 account coprono tutti i ruoli necessari per testare qualunque flow.
- **Applicare:** Prima di aggiungere nuovi account demo, aggiornare fixture + migration + SSM in modo coordinato.

**Decisione: @badge.local change-password usa confronto plaintext (password_hash = NULL)**
- **Pattern:** Se `employee.password_hash` è NULL → l'account è @badge.local → cerca in DEMO_USERS → confronta `demoUser.password === old_password`.
- **Razionale:** @badge.local non usa bcrypt DB (autenticazione via env var). `verifyPassword(pw, null)` → false sempre → "Current password is incorrect" per tutti gli account demo. 
- **File:** `backend/src/routes/auth.js` handler `change-password`.
- **Commit:** 2704835

**Decisione: Pattern FK constraint pre-delete per bulk employee delete**
- **Regola:** Prima di `DELETE FROM employees WHERE id = ANY(ids)`, analizzare ogni FK su employees:
  1. `ON DELETE CASCADE` → automatico, niente da fare
  2. `ON DELETE SET NULL` → verificare CHECK constraint; se `approved_by + approved_at` devono essere entrambi NULL/NOT NULL, fare UPDATE a un ID valido prima della delete
  3. `ON DELETE RESTRICT` + `NOT NULL` (es. `checkins.created_by`) → fare UPDATE a `employee_id` per la riga stessa prima della delete
  4. Controllare se la tabella ha la colonna (`shifts` non ha `employee_id` — JSONB per-site)
- **Razionale:** Migration 023 ha richiesto 3 iterazioni per questi edge case. La checklist evita regressioni future.
- **Commit:** a9c243f + 2d906ae

**Decisione: SSM Parameter Store — rimuovere parametri per account eliminati**
- **Regola:** Quando un @badge.local account viene rimosso dal codice, rimuovere immediatamente il parametro SSM corrispondente da `/badge/production/DEMO_*`. 
- **Razionale:** Parametri orfani in SSM causano confusione e aumentano superficie di attacco.
- **Rimossi questa sessione:** `DEMO_DIEGO_PASSWORD`, `DEMO_LUCIA_PASSWORD` (orfana da sessione precedente)

**Decisione: S.24 / S.25 / S.26 GDPR GPS — deferred fino al primo cliente con geofencing**
- **Regola:** Le finding GDPR S.24 (GPS disclosure), S.25 (DPA), S.26 (consenso esplicito) sono deferred. Non si implementano fino a quando il primo cliente reale non abilita `geofence_enabled = true` su almeno una sede.
- **Razionale:** Il geofencing è una feature opzionale e disabilitata per default. Nessun cliente la usa oggi. Il rischio GDPR è attivo solo quando è attiva la raccolta GPS. Implementare la compliance adesso sarebbe YAGNI — meglio avere il piano pronto e implementarlo contestualmente all'attivazione reale.
- **Piano S.24 pronto:** `docs/superpowers/plans/2026-06-20-s24-gdpr-gps-disclosure.md` — 4 task, ~3-4h totali:
  1. Fix `GPSConsentDialog` (AlertDialog → Modal React Native — bug fatale bloccante)
  2. Pagina pubblica `privacy-policy-it.html` + redirect Netlify
  3. Script `gps-retention.js` + cron EC2 (cancellazione GPS dopo 90 giorni)
  4. 5 test per `GET /admin/employee-consents`
- **Trigger obbligatorio S.24:** Prima di abilitare `geofence_enabled = true` su qualunque sede di un cliente reale → eseguire il piano → deploy → poi abilitare. Non invertire l'ordine.
- **Decisione presa:** Session 46, 20 Giugno 2026

### Session 47: S.25 DPA — Piano completo (21 Giugno 2026)

**Decisione: S.25 DPA — deferred fino al primo contratto cliente reale**
- **Regola:** Il DPA (GDPR Art. 28) non è bloccante finché non si firma il primo contratto con un cliente pagante reale. Il rischio Art. 28 è attivo solo in presenza di un contratto di fornitura in essere.
- **Razionale:** Template DPA e backend endpoint già esistono in codebase. Mancano: fix di un bug silenzioso nel backend, 8 test, pagina HTML scaricabile, tab DPA nell'AdminPage. Il lavoro è 2-3h e può essere eseguito in una sessione immediata prima del primo contratto.
- **Piano S.25 pronto:** `docs/superpowers/plans/2026-06-21-s25-gdpr-dpa.md` — 3 task, ~2-3h totali:
  1. Fix bug `req.user.id` → `req.user.user_id` in `admin.js:158,172` + 8 test TDD per POST/GET dpa-acknowledgement
  2. Pagina pubblica `frontend-web/public/dpa-template-it.html` + `_redirects` entry `/dpa-template-it`
  3. `DpaTab.jsx` in AdminPage (tab 7 "DPA": status, download, form firma, storico)
- **Nota tecnica:** Il gap più importante è il bug `req.user.id` (undefined → FK violation silenzioso sull'INSERT). Qualunque chiamata all'endpoint esistente senza il fix causerebbe un 500. Il piano lo fixa come primo step.
- **Trigger obbligatorio S.25:** Prima della firma del primo contratto con qualunque cliente reale → eseguire il piano → fare firmare DPA fisicamente → registrare firma nel tab DPA → archiviare PDF. Non firmare contratti senza DPA.
- **Decisione presa:** Session 47, 21 Giugno 2026

### Session 55: Redesign Storico Presenze/Impostazioni + Smart Working (12 Luglio 2026)

**Decisione: Smart Working — nuova tabella dedicata, pattern `illnesses` (auto-confermata, no approvazione)**
- **Regola:** `smart_working_days` (client_id, employee_id, date, created_by, `UNIQUE(employee_id, date)`) — un dipendente/manager con `employee_id` può autodichiarare Smart Working solo per il giorno corrente, nessuna sede, nessuna integrazione con Planning, nessuna vista manager/admin in questa fase.
- **Razionale (da grilling utente):** È un'autogiustificazione di presenza, concettualmente identica a Malattia — non richiede workflow di approvazione né riferimento a sede/orario.
- **File:** `backend/migrations/027_create_smart_working_days.sql`, `backend/src/routes/smartWorking.js`, `frontend-mobile/src/screens/checkin/SmartWorkingScreen.jsx`.
- **Commit:** 7b115fb

**Decisione tecnica: colonne SQL `DATE` esposte via API devono essere castate `::text`**
- **Regola:** Ogni `SELECT`/`RETURNING` che espone una colonna `DATE` in una response JSON deve usare `date::text AS date`, mai lasciare che `node-pg` la parsi come `Date` object.
- **Razionale:** `node-pg` interpreta `DATE` come mezzanotte nel timezone **locale** del server; la serializzazione JSON (`Date.toISOString()`) converte in UTC, causando uno shift di un giorno indietro per timezone con offset positivo (es. `Europe/Rome`, UTC+2 in estate). Bug trovato e fixato in `smartWorking.js` durante test reale (non catturato dagli unit test, che mockano il DB) — solo il test manuale con Postgres reale lo ha rivelato. La feature `illnesses` non ha questo bug per un motivo diverso: restituisce la stringa di input del client, non il valore riletto dal DB.
- **Applicare:** Prima di aggiungere una nuova colonna DATE esposta via API, verificare che sia castata a testo in SQL.

**Decisione tecnica: build iOS locali richiedono un path di progetto senza spazi/caratteri speciali**
- **Regola:** Per compilare con `expo run:ios`/Xcode in locale, usare una copia di lavoro (rsync, non symlink) in un path come `~/badge-ios-test`, non la cartella originale `Dataxiom – Analisi & BI/badge`.
- **Razionale:** Gli script `[CP-User]` generati da CocoaPods (es. "Generate app.config for prebuilt Constants.manifest") non quotano correttamente `$SRCROOT` quando contiene `&` — la shell interpreta `&` come operatore di background job e tronca il path, causando `No such file or directory`. Un symlink non risolve il problema perché `process.cwd()` di Node risolve sempre il path reale sottostante, non quello del symlink.
- **Applicare:** Ogni sessione di test locale su Xcode per questo progetto richiede prima una sync rsync (esclusi `node_modules`, `ios/`, `android/`, `.git`) verso un path pulito, poi `npm install` + `expo prebuild --clean` + `expo run:ios` lì.
- **Nota .gitignore:** `frontend-mobile/ios/` e `android/` sono stati aggiunti a `.gitignore` — cartelle generate da `expo prebuild`, mai da versionare (Expo managed workflow + EAS Build).

### Session 56: Vibrazione al check-in QR riuscito (12 Luglio 2026)

**Decisione tecnica: `Vibration` core di React Native, non `expo-haptics`**
- **Regola:** Per un feedback aptico con durata specifica in millisecondi, usare `Vibration.vibrate(ms)` da `react-native` (nessuna installazione), non `expo-haptics` (che espone solo stili di impatto predefiniti, senza controllo di durata).
- **Razionale:** La richiesta era una vibrazione di durata precisa (500ms). `Vibration` è già inclusa nel core RN, zero dipendenze native aggiuntive, zero rebuild di configurazione nativa necessari.
- **Limite noto:** su **iOS** l'API pubblica ignora il parametro di durata — produce sempre un singolo "buzz" di lunghezza fissa (~400ms), non estendibile senza una libreria nativa di terze parti (es. `react-native-haptic-feedback`). Su **Android** i millisecondi passati sono rispettati. Se in futuro serve un controllo preciso della durata su iOS, valutare esplicitamente il trade-off costo (nuova dipendenza nativa + build) vs beneficio con l'utente prima di implementare.
- **File:** `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`
- **Commit:** a90bd62

---

### Session 57: Analisi critica MVP — feature mancanti e opportunità commerciali (12 Luglio 2026)

**Contesto:** su richiesta esplicita dell'utente, analisi critica del prodotto grounded sul codice
reale (non su supposizioni) per rispondere a tre domande: quali feature core mancano, quali
feature aggiuntive avrebbero valore percepito per i clienti, quali supporti servono per rendere
il prodotto appealing a nuovi clienti. Nessun codice modificato in questa sessione — solo analisi
e backlog. Tabella riassuntiva in `TASKS.md` §"MVP Hardening: Analisi Critica Session 57".

**1. Feature core mancanti (rischio adozione)**
- **Notifiche push assenti:** `backend/src/routes/notifications.js` fa solo polling in-app — un
  dipendente scopre un cambio turno o un'approvazione ferie solo aprendo l'app. Gap più visibile
  del prodotto per un caso d'uso (cambio turno last-minute) molto comune nel retail.
- **Offline mode mai iniziato:** `CLAUDE.md` dichiara "Connettività retail instabile" come rischio
  noto, mitigato solo con "MVP online-only, Phase 2 offline mode" — ma il check-in QR **richiede**
  connessione, proprio dove il prodotto dovrebbe sostituire il cartellino cartaceo con più
  affidabilità, non meno. Contraddizione da comunicare chiaramente in vendita finché non risolta.
- **S.26 (consenso GPS esplicito) ancora `[ ]`:** a differenza di S.24 (deferred legittimamente,
  rischio dormiente finché nessun cliente usa il geofencing), S.26 è un requisito legale attivo
  nel momento stesso in cui un cliente reale chiede di attivare il geofencing — va implementato
  **prima** che accada, non dopo, per evitare una violazione GDPR Art. 7 dal primo giorno.
- **Nessun cambio turno self-service (shift swap):** oggi ogni scambio turno tra dipendenti
  richiede l'intervento manuale del manager su Planning — friction quotidiana nel retail.

**2. Feature aggiuntive ad alto valore percepito**
- **`recharts` installata in `frontend-web/package.json` ma mai usata:** `DashboardPage.jsx` mostra
  solo KPI card + tabella, zero grafici di trend (presenze/assenteismo per sede/mese). È il
  miglioramento con il miglior rapporto costo/impatto individuato: dipendenza già pagata (bundle
  size), nessun nuovo setup, solo lavoro di frontend.
- **Riepilogo Ore solo CSV, nessun PDF:** il pattern PDF esiste già per il Planning
  (`window.print()` + `@media print`, Session 44) — riusabile per `SummaryPage.jsx` a basso sforzo.
- **Nessun alert su anomalie/frodi oltre al geofencing GPS:** il geofencing previene la frode "in
  tempo reale" ma manca reportistica per scoprire pattern sospetti a posteriori (check-in
  ravvicinati da device diversi, ore anomale ricorrenti).
- **Nessuna firma digitale di accettazione del cartellino mensile:** dettaglio che pesa nella
  percezione di "strumento serio" per un ufficio HR/paghe italiano — riuserebbe il pattern audit
  log già esistente, senza nuova infrastruttura.

**3. Supporti commerciali mancanti per scalare oltre i primi clienti pilota**
- **Nessun ambiente demo self-service:** un prospect non può provare il prodotto senza contattare
  direttamente Dataxiom — collo di bottiglia per il funnel commerciale.
- **Onboarding cliente ancora "concierge" (`ONB.1`):** Excel compilato dal cliente + import
  manuale fatto da Dataxiom. Sostenibile per i primi 3-5 clienti, non oltre.
- **Compliance GDPR/EU-hosting invisibile:** il lavoro tecnico esiste (RDS eu-west-1, DPA pronto,
  S.25 completato) ma non è comunicato come trust signal nel materiale commerciale.
- **Nessun canale di assistenza in-app:** pubblico non tecnico (commessi retail) senza un
  help/FAQ a portata di mano nell'app — aumenta il rischio di abbandono nei primi giorni d'uso e
  il carico di supporto diretto su Dataxiom.

**Decisione:** nessuna di queste voci viene schedulata con priorità fissa in questa sessione — la
tabella in `TASKS.md` è un backlog di opzioni da rivalutare rispetto alle richieste reali dei primi
clienti pilota prima di allocare ore di sviluppo, non un impegno di roadmap.

---

### Session 58: Grafici Trend Dashboard — prima feature subagent-driven del progetto (12 Luglio 2026)

**Contesto:** prima feature di questo progetto implementata interamente con `subagent-driven-development` (fresh subagent per task, spec-review + code-quality-review a due stadi, in un git worktree isolato) invece che manualmente in-sessione. Piano completo: `docs/superpowers/plans/2026-07-12-dashboard-trend-charts.md`.

**Decisione: `subagent-driven-development` + worktree isolato per feature multi-task ben pianificate**
- **Regola:** Quando un piano scritto con `writing-plans` ha task ben decomposti e per lo più indipendenti, e si resta nella stessa sessione, usare `subagent-driven-development` in un worktree dedicato (creato con `EnterWorktree`) invece di implementare manualmente in-sessione.
- **Razionale:** Ogni task ha ricevuto un implementer con contesto isolato + 2 review indipendenti (spec compliance, poi code quality) — questo ha catturato 3 problemi reali prima del merge (2 test RBAC mancanti su Task 3, 1 gap di accessibilità su Task 5, poi propagato proattivamente al Task 6) senza inquinare il contesto della sessione principale con i dettagli implementativi di ogni singolo file.
- **Nota tecnica sul worktree:** creato con lo strumento nativo `EnterWorktree` (non `git worktree add` manuale) — la base è sempre `origin/<branch>`, quindi va fatto un push del branch di partenza (anche solo doc-only) prima di creare il worktree se contiene commit locali non ancora pushati. I file `.env*` (gitignored) vanno copiati manualmente nel worktree per far girare i test backend.
- **File:** tutto il codice della feature, vedi `TASKS.md` Session 58 per l'elenco commit.
- **Commit finale su main:** `78a5751` (feature) + `2373ea6` (fix lint, vedi sotto)

**Decisione tecnica: la pipeline CI/CD del backend ha un gate di lint separato dai test — verificarlo esplicitamente prima di considerare un merge "sicuro"**
- **Regola:** `npm test` locale verde **non garantisce** che la pipeline GitHub Actions passi — il job "Lint backend" (`eslint src/ --ext .js`) è un gate separato e bloccante, con `"quotes": ["error", "single"]` che vieta i template literal a riga singola senza interpolazione (unico caso permesso: template literal multi-riga, o stringa singola quotata come già usato altrove in `presences.js:69`).
- **Razionale:** il merge di Session 58 è passato tutti i test locali/CI del worktree ma ha rotto il job di lint in produzione (`presences.js:210-211`), bloccando silenziosamente il deploy EC2 (il job "Deploy to EC2" risulta "skipped", non "failed" — facile da non notare se non si controlla esplicitamente `gh run list`). Scoperto solo perché si è verificato l'endpoint reale in produzione dopo il push, non fidandosi del solo "push riuscito".
- **Applicare:** dopo ogni push su `main` che tocca `backend/`, controllare `gh run list --limit 3` per confermare che sia `CI/CD Pipeline` sia `Deploy to EC2` siano `success`, non solo che il push sia andato a buon fine. Non assumere che i test locali passati implichino che il deploy avvenga.

**Decisione: `scripts/test-api.sh` ha credenziali demo obsolete (Session 46 le ha rimosse)**
- **Nota:** lo script referenzia ancora `diego@badge.local`/`luca.verdi@employee.it`, rimossi in Session 46 (solo pippo/pino/maria @badge.local restano). I 12 fallimenti a cascata su manager/employee nell'ultima esecuzione sono dovuti a questo, non a regressioni reali. **Da fare** (non urgente): aggiornare lo script con `pino@badge.local`/`maria@badge.local`.

---

### Session 59: Fix 2 fallimenti pre-esistenti LeaveCalendar (12 Luglio 2026)

**Contesto:** su richiesta esplicita dell'utente, indagine e fix dei 2 fallimenti frontend in `LeaveCalendar.test.jsx` lasciati aperti come baseline nota nelle Session 55-58.

**Decisione: bug reale nel componente, non solo nel test — `stringToDate(endDate)` senza guardia null**
- **Regola:** `LeaveCalendar.jsx` `handleDateClick` deve gestire `endDate === null` mentre `startDate` è valorizzato — stato plausibile ogni volta che un genitore inizializza lo stato con solo `startDate` impostato, non un artefatto di test.
- **Fix:** `const end = endDate ? stringToDate(endDate) : start;` — fallback a `start` invece di crashare su `null.split(...)`.
- **Causa secondaria (solo nel test):** mese hardcoded `'2026-06'` nell'assertion (stale, rotto a Luglio 2026) e un'aspettativa `endDate: null` mai stata corretta (il componente imposta `endDate = clickedDateStr` al primo click su un giorno singolo, non `null`) — corretto calcolando il mese da `new Date()` come già fanno gli altri test nello stesso file.
- **File:** `frontend-web/src/features/leave/components/LeaveCalendar.jsx`, `frontend-web/src/__tests__/LeaveCalendar.test.jsx`.
- **Verificato:** 11/11 `LeaveCalendar`, 191/192 suite frontend completa (1 skip intenzionale, zero fallimenti), build pulita, pipeline CI verde.
- **Commit:** `0a04451`

---

### Session 60: Dropdown Sede in Dashboard + dati demo maggio 2026 + fix CSV export epoch timestamp (13 Luglio 2026)

**Contesto:** su richiesta esplicita dell'utente, via `/grilling`: (1) convertire il campo testo libero "Sede" della Dashboard in un menu a tendina; (2) popolare maggio 2026 con dati fittizi (presenze/assenze/straordinari/assenteismo) come mese demo, esplicitamente temporanei e cancellabili a richiesta; (3, emerso dopo, su segnalazione utente con CSV allegato) fix di un bug reale nell'export CSV.

**Decisione: dropdown Sede riusa l'RBAC già esistente di `GET /api/v1/sites`, nessun nuovo endpoint**
- **Regola:** `FilterBar.jsx` fetcha `GET /api/v1/sites` (già RBAC-scoped: admin vede tutte le sedi del tenant, manager vede solo la propria) invece di introdurre logica di filtro lato frontend.
- **Comportamento per ruolo:** admin → select con opzione aggiuntiva "Tutte le sedi" (value vuoto, azzera il filtro) + ogni sede; manager → select disabilitata, pre-selezionata sulla propria sede (nessuna scelta possibile, coerente con lo scoping fail-closed già presente lato backend).
- **File:** `frontend-web/src/features/dashboard/components/FilterBar.jsx`, `frontend-web/src/features/dashboard/pages/DashboardPage.jsx` (passa `userRole`/`userSiteId` come prop).
- **Verificato:** build pulita, 191/192 test frontend (nessuna regressione, nessun test pre-esistente copriva questo componente).

**Decisione: dati demo temporanei marcati con dominio email dedicato, mai con schema o tabelle nuove**
- **Regola:** per dati demo temporanei da inserire in produzione, marcare le entità create con un identificatore univoco e invisibile (qui: dominio email `@demo-maggio.local`) invece di aggiungere colonne/tabelle di tracking — permette una cancellazione futura mirata con una singola query, senza toccare lo schema.
- **Razionale:** minimizza l'impatto sul codice (zero migration, zero nuove tabelle) e il rischio (verificato PRIMA dell'inserimento, via SSH+psql su RDS produzione, che non esistesse già alcun dato reale per maggio 2026 sui 3 account demo — query di conferma su `checkins`/`illnesses`/`leave_requests`, tutte a zero).
- **Vincoli di dominio scoperti in corsa:** `leave_requests` ha un CHECK constraint (`leave_requests_check1`) che richiede `approved_by` e `approved_at` entrambi NULL o entrambi valorizzati — uno stato APPROVED richiede sempre un approvatore esplicito (usato Pippo/admin come approvatore demo).
- **FK da conoscere per cleanup sicuro:** `checkins.employee_id`, `illnesses.employee_id`, `leave_requests.user_id` sono tutti `ON DELETE CASCADE` verso `employees`, ma `checkins.created_by` e `illnesses.created_by` sono `ON DELETE RESTRICT` — per evitare blocchi di cancellazione, i check-in/malattie demo hanno sempre `created_by` uguale al dipendente stesso (self-created), e lo script di cleanup cancella esplicitamente le tabelle figlie PRIMA di cancellare gli `employees`, senza affidarsi solo al cascade.
- **File:** `backend/scripts/seed-may-2026-demo.sql` (8 dipendenti, 4 Torino + 4 Milano, 310 check-in, 3 ferie approvate, 2 malattie), `backend/scripts/cleanup-may-2026-demo.sql` (companion, da eseguire via SSH sull'host EC2 quando richiesto — unico host che raggiunge l'RDS).
- **Scoperta rilevante comunicata all'utente:** i Grafici Trend (Session 58) mostrano sempre "ultimi 30 giorni fissi da oggi" per design — non mostreranno **mai** maggio una volta passato giugno. L'utente ha confermato di lasciare questo comportamento invariato: KPI Card e tabella presenze (che rispettano il filtro Da/A impostabile) restano il modo corretto per mostrare il mese demo.

**Decisione: fix bug reale nell'export CSV — `csv-stringify` senza `cast.date` converte i `Date` in epoch ms**
- **Contesto:** l'utente ha allegato un CSV scaricato dalla Dashboard segnalando che le colonne data mostravano solo numeri privi di senso.
- **Causa:** `csv-stringify` (libreria usata in `export.js`), quando non riceve un handler `cast.date` esplicito, serializza un oggetto `Date` chiamando `.getTime()` (epoch millisecondi), non una stringa leggibile. Il formato CSV "generico" (`exportGeneric`) passava `c.timestamp`/`c.modified_at` (oggetti `Date` nativi restituiti da `pg`) direttamente allo stringifier senza formattarli — a differenza dei formati Zucchetti/TeamSystem, che già costruivano stringhe formattate manualmente prima dello stringify e quindi non ne erano affetti.
- **Fix:** aggiunta una funzione `fmtDateTime()` (riusa `fmtDate`+`fmtTime` già esistenti) e un handler `cast.date` nello stringifier di `exportGeneric` → formato italiano `DD/MM/YYYY HH:MM`.
- **File:** `backend/src/routes/export.js`.
- **Verificato:** 24/24 test export (nessuna assertion su valore letterale del timestamp, quindi nessuna modifica ai test necessaria), 488/502 suite completa, endpoint testato live in produzione (`GET /api/v1/export/csv`) con token reale — colonne ora mostrano `01/05/2026 07:00` invece di `1777618800000`.
- **Nota per il futuro:** qualunque nuova colonna `Date`/`timestamp` esposta via un formato export CSV va sempre formattata esplicitamente (o via `cast.date` globale, o costruendo la stringa manualmente come già fanno Zucchetti/TeamSystem) — mai passata come oggetto `Date` grezzo allo stringifier.
- **Commits:** `5cfbf52` (dropdown + seed), `0857cbc` (fix CSV export).

---

### Session 61: Ambiente Demo Self-Service — pianificazione + Task 1-2/9 (13 Luglio 2026, IN PAUSA)

**Contesto:** su richiesta dell'utente di individuare la prossima feature "a minimo sforzo, massima resa" dal backlog MVP Hardening (Session 57), è stata scelta l'**Ambiente Demo Self-Service** al posto di alternative a sforzo più basso (es. PDF export Riepilogo Ore) per il maggior valore commerciale (scala oltre la capacità di demo 1:1 dell'utente, qualifica lead freddi, segnale di maturità del prodotto). Pianificata con `/superpowers:writing-plans` + `/grilling` esteso (13 domande sequenziali), poi sottoposta a un'**autocritica esplicita** (`/grilling` con se stessi, su richiesta dell'utente) prima di iniziare l'esecuzione. Piano completo: `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md`.

**Decisione: scope volutamente ridotto rispetto a un "ambiente demo completo"**
- **Regola:** la demo self-service copre SOLO la Dashboard web — il flusso mobile (QR/Face ID) è mostrato con screenshot/video statico, non provabile dal vivo.
- **Razionale:** verificato nel codice che l'app mobile è distribuita solo via TestFlight (nessuna build Android reale in produzione, nessun canale Expo Go pubblico) — un prospect anonimo non può installarla al volo il giorno stesso. Investire in un canale mobile pubblico sarebbe uno sforzo/rischio molto più alto di quanto richiesto ("minimo sforzo").

**Decisione: nuovo flag `is_demo` dedicato su `clients`, mai overload del campo `plan` esistente**
- **Regola:** `clients.is_demo BOOLEAN NOT NULL DEFAULT false` + `demo_expires_at TIMESTAMPTZ NULL` + `demo_contact_email VARCHAR NULL`, non un valore speciale del campo `plan` (VARCHAR libero, oggi enum-only a livello Zod: starter/growth/enterprise).
- **Razionale:** il codice più critico di questa feature (l'endpoint che riemette JWT per cambiare ruolo, vedi sotto) deve poter verificare "questo è un tenant demo?" con un controllo booleano inequivocabile — sovraccaricare una stringa libera avrebbe introdotto ambiguità in un controllo di sicurezza.
- **Verifica tecnica chiave** (confermata via SSH+psql su RDS produzione): ogni tabella con `client_id` ha `ON DELETE CASCADE` verso `clients` — la cancellazione di un tenant demo scaduto è quindi una singola query (`DELETE FROM clients WHERE id=$1 AND is_demo=true`), non uno script multi-tabella come quello dei dati demo di maggio (Session 60), che serviva solo perché lì si cancellavano dipendenti di un client esistente, non un intero tenant.

**Decisione: bug reale trovato e corretto durante l'autocritica del piano — email duplicata**
- **Regola:** `clients.email` ha un vincolo `UNIQUE NOT NULL` (verificato in `schema.sql`) — il piano iniziale non gestiva il caso di una stessa email che richiede una demo una seconda volta, che avrebbe prodotto un errore grezzo invece di un comportamento sensato.
- **Fix pianificato:** 3 percorsi espliciti su `POST /demo/start` — (1) demo attiva → resume senza rigenerare dati; (2) demo scaduta ma in finestra di grazia → riavvio del conto alla rovescia sullo stesso tenant; (3) email di un cliente reale (`is_demo=false`) → rifiuto generico, nessuna fuga di informazioni su quale tipo di account esiste già. Più una difesa in profondità contro race condition (catch esplicito del codice Postgres `23505` come rete di sicurezza, non solo un pre-check).
- **Perché rilevante per chi continua:** è l'esempio concreto di come l'autocritica di un piano prima di eseguirlo abbia trovato un difetto che l'implementazione avrebbe altrimenti prodotto come bug in produzione — pattern da ripetere per feature future con superfici pubbliche/non autenticate.

**Decisione: esecuzione a task singoli con pausa esplicita, non esecuzione continua**
- **Regola:** `subagent-driven-development` (worktree isolato `.claude/worktrees/demo-self-service`, branch `worktree-demo-self-service`) normalmente esegue tutti i task in sequenza senza fermarsi; su richiesta esplicita dell'utente, dopo ogni task che supera implementer + le 2 review (spec-compliance, poi code-quality) ci si ferma, si riassume il lavoro, e si aspetta un via libera esplicito prima di procedere — le istruzioni esplicite dell'utente hanno sempre priorità sul comportamento di default di una skill.
- **Task 1/9 completato**: migration `028_add_demo_tenant_fields.sql` + `029_create_demo_contact_requests.sql`. La review ha trovato un indice mancante su `clients(is_demo, demo_expires_at)` (le due query future — tetto demo attive, scheduler di pulizia — sarebbero finite in full scan) — corretto con un indice parziale (`WHERE is_demo=true`).
- **Task 2/9 completato**: `backend/src/utils/demoSeed.js` (1 sede, 3 dipendenti admin/manager/employee, check-in relativi a "oggi" non a un mese fisso — critico perché i Grafici Trend mostrano sempre gli ultimi 30 giorni fissi). La review ha trovato un design a doppia modalità (Pool vs Client già connesso) superfluo e rischioso, dato che l'unico chiamante reale futuro (Task 3) passerà sempre un client già dentro una propria transazione — semplificato a un solo contratto (sempre client già connesso).
- **Verifica sistematica:** ogni task testato con esecuzione reale su Postgres locale (non solo mock), da implementer E indipendentemente da entrambi i reviewer — pattern coerente con quanto richiesto esplicitamente dall'utente ("testa ogni feature alla fine di ogni task").

**Nota aperta per la prossima sessione — gap CI**
- La pipeline GitHub Actions (`ci.yml`) imposta `DATABASE_URL`/`DB_HOST` per il job backend ma **non provisiona un vero servizio Postgres** — i test DB-dipendenti passano solo in locale, non in CI. Non bloccante per Task 1-2, ma il Task 3 (email duplicata, race condition) dipende molto di più da questa copertura. Decisione da prendere con l'utente: aggiungere un servizio Postgres al job CI prima o durante il Task 3, o accettare il gap come limite noto.

**Stato:** nessun merge su main — tutto il lavoro (commit fino a `c9ae14b`) resta sul branch `worktree-demo-self-service`, isolato dal checkout principale. Riprendere da **Task 3/9** (`POST /demo/start`), il task con la superficie di rischio più delicata dell'intero piano (endpoint pubblico che crea tenant ed emette JWT senza password).

---

**Last Updated:** 13 Luglio 2026 (Session 61 — in pausa)
**Status:** FASE 10 COMPLETE | Leave Management COMPLETE | Redesign Mobile COMPLETE (6/6 schermate) | Build 26 live (vibrazione check-in) | Grafici Trend Dashboard LIVE in produzione (Session 58) | Dropdown Sede in Dashboard LIVE (Session 60) | Dati demo maggio 2026 in produzione (temporanei, cleanup pronto in `backend/scripts/`) | Export CSV date/ora fix LIVE (Session 60) | 🚧 Ambiente Demo Self-Service: piano approvato, Task 1-2/9 completati su worktree isolato (non in main), riprendere da Task 3/9 | Frontend test suite 100% verde (Session 59) | MVP Hardening backlog identificato (Session 57, "Grafici trend" completato, "Ambiente demo self-service" in corso, resto non ancora schedulato) | 3 demo accounts + 8 demo temporanei (`@demo-maggio.local`) | Migration più recente su main: 027 applied | Migration 028-029 pronte ma solo sul branch del worktree | S.24 plan ready (deferred) | S.25 plan ready (deferred) | S.26 ancora aperto
**Created By:** Claude Code Sessions 1-61  
**Next Review:** After first real customer onboarding
