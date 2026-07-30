# Badge System — Session 89 Handoff

**Date:** 2026-07-30
**Session:** 89 — SES fuori sandbox (Task 7 chiuso) + Gate finale onboarding self-service completato end-to-end in produzione + 2 bug di produzione reali scoperti e fixati
**Status:** ✅ **Piano onboarding self-service chiuso su ogni asse** (8/8 task + gate finale reale). SES fuori sandbox, quota 50.000/giorno. Backlog: STAGING, S.26, ANDROID.1/1b, e un nuovo bug UX (redirect post-login) scoperto oggi.

---

## Goal (Session 89)

AWS ha approvato il sandbox-exit SES (dopo `DENIED` fermo da Session 84). L'utente ha scelto di eseguire in sequenza: Task 7 del piano SES (config produzione), poi il Gate finale del piano onboarding self-service — l'unica verifica rimasta di quel piano, bloccata dal sandbox SES fino a oggi.

## Esito (Session 89)

**Task 7 SES**: `MAX_ACTIVE_DEMOS=20` impostato in SSM produzione (mai fatto prima), container riavviato, test E2E email reale riuscito (verso indirizzo mai verificato — prova diretta dell'uscita dal sandbox) più un secondo test tramite il flusso pubblico `/demo/start`→`/demo/contact`. Tenant demo di test ripulito dal DB.

**Gate finale onboarding — due bug di produzione reali scoperti durante il tentativo**, non solo verificato il flusso:
1. **55 commit mai pushati** (Session 83-88) — nessun deploy attivo su produzione da giorni. Scoperto investigando perché `invite_tokens` non esisteva ancora in produzione. Fix: `git push origin main` (su conferma esplicita dell'utente).
2. **`exceljs` in `devDependencies` invece che `dependencies`** — causava un crash-loop del container appena il codice onboarding (che lo richiede a runtime via `parseWorkbook.js`) veniva eseguito in produzione, dato che l'immagine Docker installa solo dipendenze non-dev. Mai catturato localmente. Fix: spostato in `dependencies`, `package-lock.json` rigenerato, verificato.

Un pushato il fix, anche 4 errori ESLint pre-esistenti (mai catturati perché `npm test` non esegue `lint`) hanno bloccato la CI — fixati con `eslint --fix`, ripushato.

**Gate finale eseguito passo-passo dall'utente stesso** (non in automazione, per verifica diretta e reale): creazione client "Test Gate Finale Onboarding" → email di invito ricevuta → accept-invito (`Diego_Test`/`Diego1975`) → login (bloccato temporaneamente dal rate-limiter `/auth/login`, 5 tentativi/60s per i tentativi ripetuti — non un bug) → `/admin/onboarding` → upload Excel di test (3 sedi, 18 dipendenti, 54 saldi, anteprima corretta senza errori) → conferma import → welcome email dipendente ricevuta.

**Bug UX scoperto** (documentato, non fixato in questa sessione): un admin con onboarding incompleto che si logga finisce su una dashboard/planning vuoti senza modo di tornare al wizard — `LoginPage.jsx:44` naviga sempre a `/dashboard` incondizionatamente. Aggiunto a `TASKS.md` come backlog item.

**Cleanup finale**: client di test (`3a6d875f-...`) eliminato dal DB di produzione su conferma esplicita dell'utente — cascade ha rimosso 19 employees, 3 sites, invite_tokens, leave_saldi. Verificato con query prima/dopo (0 righe residue).

## Backlog per la prossima sessione (in ordine di urgenza)

1. **Bug UX: redirect post-login onboarding incompleto** (nuovo, Session 89) — vedi `TASKS.md`, riga dedicata. Fix a basso rischio, non ancora implementato.
2. **STAGING** (`STG.1`-`STG.6`) — dichiarato obbligatorio pre-cliente-reale da Session 45, mai avviato.
3. **S.26** — consenso GPS esplicito (GDPR Art. 7, HIGH) — il geofencing è già attivabile in produzione senza questo meccanismo.
4. **ANDROID.1/1b** (scan QR reale + Doze via Virtual Scene, bloccato da un limite di automazione GUI-only) — non bloccante per demo interna.

## Note operative (Session 89)

- **`npm test` non esegue `lint`** in questo repo — un push può passare i test locali e comunque fallire in CI (`lint-and-test` job di `ecr-push.yml`). Controllare `npm run lint` prima di push importanti.
- **Qualunque modulo richiesto a runtime da codice sotto `backend/src/`** (anche se storicamente era solo uno script CLI) deve stare in `dependencies`, mai in `devDependencies` — l'immagine Docker di produzione installa solo le prime.
- **Prima di ogni sessione che tocca deploy**: verificare `git log origin/main..HEAD --oneline | wc -l` — se >0, niente di quello che si fa localmente sta arrivando in produzione.
- Script diagnostici ad-hoc su produzione: sempre `require('/app/src/config-loader.js')` prima di `pg`/`db/pool.js` (altrimenti `ECONNREFUSED`, le env DB vivono solo in `/etc/badge/.env`). Scrivere il file, `scp` su EC2, `docker cp` nel container, eseguire con `docker exec -w /app <container> node <script>.js`, poi ripulire da container+host+locale.

---

## Handoff precedenti (invariati, riportati sotto per contesto)

### Session 87-88 — ANDROID.2

**Goal:** Affrontare `ANDROID.2` (jank animazioni Android low-end, rinviato da Session 83) — scelto dall'utente come prossimo item del backlog affrontabile senza spesa né attesa esterna.

Affrontare `ANDROID.2` (jank animazioni Android low-end, rinviato da Session 83) — scelto dall'utente come prossimo item del backlog affrontabile senza spesa né attesa esterna (a differenza di SES/staging).

## Esito

**Session 87**: piano scritto (`/superpowers:brainstorming`+`/grilling`+`/superpowers:writing-plans`) ed eseguito task-per-task. Scoperta chiave: le animazioni usavano già `useNativeDriver: true` ovunque — il jank derivava dal costo di compositing GPU complessivo (specialmente `CameraView` live in `QRScannerScreen`), non dalla complessità delle animazioni. Implementato `deviceTier.js` (`isLowEndDevice()`, soglia RAM ≤3GB) per disattivare solo le animazioni decorative su device low-end. La verifica numerica su device si è però bloccata: `am start` falliva con "Activity class does not exist" su entrambi gli AVD, apparentemente un problema di toolchain `adb`/emulator.

**Session 88**: su richiesta esplicita dell'utente di indagare il blocco invece di accantonarlo, trovata la causa reale — **entrambi gli AVD avevano un PIN di blocco schermo residuo dalla Session 83** (serviva a testare lo scenario "PIN senza biometria" del Rischio 1). Dopo un boot fresco il device restava cifrato (BFU) finché non sbloccato, e Android rifiuta di avviare app di terze parti in quello stato con un errore che non menziona il vero problema. Diagnosticato per esclusione: schermo nero anche su un'app di sistema → `dumpsys power` → `mWakefulness=Asleep` → svegliato → screenshot ha rivelato la lock screen col PIN. Fix: wipe-data solo su `Android_Go_LowSpec` (non su `Pixel_6_API_34`, il cui PIN è intenzionale e serve a flow Maestro documentati).

Ricostruita la build, navigato realmente nell'app con Maestro (più affidabile dei tap "ciechi" via coordinate, che una volta hanno fatto finire un login per errore sulla home screen Android). Risultati `dumpsys gfxinfo`:
- `FaceIDScreen`: 99,77%→99,33% jank, **mediana dimezzata 61ms→32ms** (miglioramento reale)
- `QRScannerScreen`: 100%→97,50% jank, mediana invariata 200ms (marginale — `CameraView` resta il collo di bottiglia)

`/test-all` + `/code-review:code-review` (3 agenti paralleli) finali: tutto verde, nessun problema trovato. Dettaglio completo in `PROJECT_DECISIONS.md`, voce "Session 87-88".

## Backlog invariato per la prossima sessione (in ordine di urgenza)

1. **SES sandbox-exit** — ancora `DENIED`, nessuna risposta AWS. Canali alternativi discussi (nuovo caso, upgrade Business Support, AWS re:Post, AWS Activate) ma nessuno ancora tentato.
2. **Gate finale piano onboarding** — verifica E2E con SES reale, bloccato dal punto 1.
3. **STAGING** (`STG.1`-`STG.6`) — dichiarato obbligatorio pre-cliente-reale da Session 45, mai avviato.
4. **S.26** — consenso GPS esplicito (GDPR Art. 7, HIGH) — il geofencing è già attivabile in produzione senza questo meccanismo.
5. **ANDROID.1/1b** (scan QR reale + Doze via Virtual Scene, bloccato da un limite di automazione GUI-only) — non bloccante per demo interna, da chiudere prima di clienti con dipendenti Android.

## Note operative (Session 87-88)

- **AVD locali**: `Android_Go_LowSpec` ora senza PIN (wipe-data eseguito) — pronto per riuso immediato. `Pixel_6_API_34` ha ancora il suo PIN (`1234` impostato via `adb shell locksettings set-pin`, poi rimosso da `Android_Go_LowSpec` con `locksettings clear`) — **non wippare** senza prima verificare se i flow Maestro `android-faceid-no-biometric.yaml`/`android-camera-permission-denial.yaml` sono ancora rilevanti.
- **Se un AVD torna a dare "Activity class does not exist" dopo un riavvio**: prima ipotesi da verificare è il lock screen (BFU), non la toolchain — `adb shell input keyevent KEYCODE_WAKEUP` + screenshot per controllare.
- Maestro è in `~/.maestro/bin` (va aggiunto al PATH esplicitamente in ogni comando Bash, non risulta sourced di default in questa shell).
- Commit Session 87-88: `cb9fb93` (spec), `24c225c` (piano), `79495d7`/`7357fc6`/`eb55c70` (Task 1-3), `68a98d2` (Task 4/chiusura codice).

---

## Handoff precedenti (invariati, riportati sotto per contesto)

### Session 86

**Goal:** su richiesta esplicita dell'utente, rileggere in dettaglio TASKS.md/PROJECT_DECISIONS.md/HANDOFF.md e riportare prossimi step + cosa è stato lasciato indietro, considerando lo stato attuale dell'MVP.

**Esito:** identificati come bloccanti reali: SES sandbox-exit (`DENIED`), Task B6 (Offline Mode — fermo da 4 sessioni, l'unico item non dichiarato esplicitamente come rinviato), ambiente di staging (mai avviato), S.26 (consenso GPS GDPR, HIGH), ANDROID.1/1b/2. L'utente ha ripreso in mano il retest B6 e confermato: **funziona**. Checklist `docs/offline-mode-test-checklist.md` (Sezioni 1-8) dichiarata chiusa — Offline Mode ora interamente completa (Fase A backend + Fase B mobile + Task B6 verifica reale). Nessuna modifica di codice in quella sessione, solo aggiornamento documentazione.

---

### Session 85

**Goal:** Eseguire il piano di implementazione onboarding scritto in Session 84 (`docs/superpowers/plans/2026-07-28-onboarding-self-service.md`), mentre si attende la risposta AWS sul sandbox-exit — l'utente ha confermato che i test mockano SES quindi tutto il piano è implementabile ed eseguibile end-to-end senza email reali, tranne la verifica finale.

---

## Current Progress

**Tutti gli 8 task del piano eseguiti**, uno alla volta con conferma esplicita dell'utente dopo ciascuno (protocollo stabilito in Session 84, mantenuto):

- **Task 1** (`252c6d3`) — migration `034_create_invite_tokens.sql`.
- **Task 2** (`60e85bd`) — `backend/scripts/onboarding/*.js` spostato in `backend/src/services/onboarding/` (`git mv`, riusato da CLI e HTTP), `parseWorkbook.js` esteso ad accettare Buffer oltre a path file. Eseguito con vincolo esplicito di reversibilità richiesto dall'utente (commit isolato, verifica comportamentale prima/dopo).
- **Task 3** (`4f2ac98` + fix `6b89702`) — `inviteTokens.js`: token one-time. Code review + `/test-all` su richiesta esplicita hanno trovato un problema reale: bcrypt (pensato per segreti umani deboli) usato su un token già a 256 bit di entropia — CPU-blocking sync hashing, lookup O(n) invece di O(1), timing side-channel. Sostituito con SHA-256 + lookup diretto indicizzato.
- **Task 4** (`04f0ad1`) — invito admin automatico alla creazione client (`admin/clients.js`), email fire-and-forget dopo il commit.
- **Task 5** (`f2f1f05`) — endpoint pubblico `POST /onboarding/invite/:token/accept`: consumo atomico del token (`UPDATE...RETURNING`, chiude una race TOCTOU esplicitamente identificata in review), emette JWT come un login normale.
- **Task 6** (`57c4b7f`) — `AcceptInvitePage.jsx` (pagina pubblica, nessun `ProtectedRoute`).
- **Task 7** (`9b0948b`) — `POST /admin/onboarding/{preview,apply}`: `preview` riusa la stessa sequenza del CLI (`--dry-run` ⇔ `commit:false`), `apply` invia welcome-email ai soli dipendenti nuovi dopo il commit, mai bloccando/rollbackando per un problema SES.
- **Task 8** (`36edec0`) — `OnboardingWizardPage.jsx`: MUI Stepper 3 step (upload → anteprima/diff → riepilogo), `useOnboarding` hook. Estesa `failedEmails` con l'`id` dipendente (non solo l'email) per abilitare un'azione "Rigenera credenziali" nel riepilogo, riusando l'endpoint già esistente `POST /admin/employees/:id/reset-password` — nessuna nuova infrastruttura email.

**Code review finale + `/test-all` + `/api-test` da senior QA** (su richiesta esplicita, commit `2d6d9a7`): 3 agenti paralleli (bug-scan+CLAUDE.md, security, consistenza storica) + verifica manuale end-to-end contro il backend locale (login reale, upload `.xlsx` reale via curl, ispezione diretta del DB). **5 problemi reali trovati e risolti:**

1. Il JWT/user emesso su accept-invito non conteneva `employee_id` (a differenza di `POST /auth/login`) — un nuovo admin restava senza profilo dipendente per endpoint come `smartWorking`/`checkins`/`illnesses` fino al primo refresh (~15 min). Verificato red→green con revert temporaneo del fix.
2. Mancava il guard fail-fast su `JWT_PRIVATE_KEY` mancante (presente in `auth.js`).
3. Nessun audit log per la creazione del primo admin di un tenant — aggiunto.
4. `generateInviteToken()` chiamato fuori dal blocco try pensato per rendere l'invito best-effort in `admin/clients.js` — un suo errore avrebbe propagato `next(err)` su una response già inviata.
5. `/onboarding/invite` riusava la stessa istanza di rate-limiter di `/demo/start` (entrambi IP-keyed) — esaurire la quota su un endpoint consumava anche quella dell'altro. Creato `onboardingInviteLimiter` separato, riprodotto il bug deliberatamente prima del fix per provarlo.

**Trovato in QA manuale, non dal code review**: `POST /admin/onboarding/preview` restituiva le password temporanee **in chiaro** anche se l'operazione fa sempre `ROLLBACK` — rimosso dal payload di preview (`apply` lo mantiene, dove serve davvero).

22 file di test che mockano `rateLimiter` sono stati aggiornati con la nuova esportazione (altrimenti l'intera app crashava in test con `Router.use() requires a middleware function but got undefined`).

**Suite finale**: backend 630/644 (14 skip pre-esistenti, 0 fallimenti — niente flakiness in quest'ultimo run, a differenza delle run precedenti), frontend-web 248/249 (1 skip pre-esistente).

**SES**: ancora `DENIED`, nessuna risposta AWS. L'utente ha chiesto canali alternativi al ticket attuale — riepilogati: upgrade temporaneo a Business Support (~$29/mese, sblocca chat/telefono), aprire un secondo caso con giustificazione più dettagliata, AWS re:Post, candidatura AWS Activate (se applicabile). Nessuna azione ancora intrapresa su questo fronte, solo consulenza.

---

## What Worked

- **Delegare il code review a 3 agenti paralleli con scope mirato per ciascuno** (bug/CLAUDE.md, security, consistenza storica) invece di un unico pass generico — ha trovato 5 problemi concreti e diversi tra loro, ognuno verificabile in isolamento.
- **QA manuale live oltre ai test automatici**: il leak di `credentials` in `preview` non era coperto da nessun test esistente (i test controllavano solo `errors`/`summary`, non l'assenza di campi extra) — solo l'ispezione diretta della risposta HTTP l'ha rivelato.
- **Riprodurre deliberatamente il bug prima del fix** (rate-limiter condiviso, `employee_id` mancante) per provare che il test scritto sia davvero un regression guard, non solo una asserzione che passa per caso.
- **Riusare l'endpoint `reset-password` già esistente invece di costruire un nuovo canale email per "Rigenera credenziali"** — ha evitato di introdurre nuova infrastruttura SES proprio nel percorso di fallback per quando SES non funziona.

## What Didn't Work / Lezioni

- **Aggiungere un nuovo export a un modulo mockato ovunque (`rateLimiter.js`) rompe silenziosamente ogni test file che lo mocka con un oggetto letterale incompleto** — 22 file da aggiornare in blocco. Da tenere presente per qualunque futura modifica a un modulo centrale ampiamente mockato: cercare tutti i `jest.mock(...)` di quel modulo PRIMA di aggiungere un export, non dopo che la suite fallisce.
- **SES sandbox-exit resta bloccato senza spiegazione visibile** — nessun avanzamento rispetto a Session 84, l'utente deve ancora controllare manualmente il Support Center o scegliere un canale alternativo (vedi sopra).

---

## Next Steps

1. **Gate finale del piano onboarding** (non ancora eseguito, per esplicita scelta): verifica manuale E2E con SES reale (creazione client → email invito arriva davvero → accept → wizard → upload Excel reale → welcome email dipendenti arrivano davvero) — bloccata finché il sandbox-exit non è approvato.
2. **SES**: l'utente valuta se tentare un canale alternativo (nuovo caso, upgrade Business Support, AWS Activate) — nessuna azione ancora presa in questa sessione.
3. Backlog invariato da Session 83/84: `ANDROID.1`/`ANDROID.1b`, `ANDROID.2`, ambiente di staging (mai avviato, dichiarato obbligatorio pre-cliente-reale).

---

## Dove sono le cose

- **Piano onboarding (8/8 task completati)**: `docs/superpowers/plans/2026-07-28-onboarding-self-service.md`
- **Spec onboarding**: `docs/superpowers/specs/2026-07-28-onboarding-self-service-design.md`
- **Nuovi file backend**: `backend/src/routes/onboardingInvite.js`, `backend/src/routes/admin/onboarding.js`, `backend/src/utils/inviteTokens.js`, `backend/src/services/onboarding/*.js` (spostati da `backend/scripts/onboarding/`), `backend/migrations/034_create_invite_tokens.sql`
- **Nuovi file frontend**: `frontend-web/src/pages/AcceptInvitePage.jsx`, `frontend-web/src/features/admin/pages/OnboardingWizardPage.jsx`, `frontend-web/src/features/admin/hooks/useOnboarding.js` — route `/accetta-invito` (pubblica) e `/admin/onboarding` (admin-only) in `App.jsx`
- **Piano SES** (Parte B, Task 6-7 ancora bloccati): `docs/superpowers/plans/2026-07-19-demo-funnel-screenshots-ses.md`
- **Case AWS Support**: displayId `178527134900387`
- **Commit Session 85**: `252c6d3`, `60e85bd`, `4f2ac98`, `6b89702`, `04f0ad1`, `f2f1f05`, `57c4b7f`, `9b0948b`, `36edec0`, `2d6d9a7` (fix code review)

## Note operative

- **Ricontrollare stato SES**: `aws sesv2 get-account --region eu-west-1 --query '{ProductionAccessEnabled: ProductionAccessEnabled, ReviewStatus: Details.ReviewDetails.Status}'`
- **DKIM già verificato** — non serve rifare Task 4/5 del piano SES, solo Task 6 (sandbox-exit) resta aperto.
- Deploy landing: SEMPRE `--site a31a2216-fb06-47e0-b632-a1193a88039a` · Deploy badge frontend: `--site 29a79b49-...` · Backend: automatico su push `main` (`backend/**`) · Mobile iOS: build via Codemagic (workflow `badge-ios-testflight`) · Mobile Android: solo build locale EAS
- **Credenziali test mobile**: `maria@badge.local` / `maria01` (employee, Torino) · `pino@badge.local` (manager, Torino, password nota all'utente)
- **Credenziali test onboarding locale**: `pippo@badge.local` / `pippo01` (admin, client "Dataxiom MVP") — usato per la QA manuale di questa sessione, nessun dato residuo lasciato nel DB locale (righe di test create e ripulite).
