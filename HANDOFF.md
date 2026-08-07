# Badge System — Session 94 Handoff

**Date:** 2026-08-07
**Session:** 94 — Fase B findings 2 Agosto (finding #1, secure storage mobile) implementata e mergeata in `main`
**Status:** ✅ Mergeato e pushato su `origin/main`. ⚠️ Non ancora in mano a nessun utente reale — richiede una nuova build nativa (bump `buildNumber` + Codemagic + submit), non distribuibile via OTA.

---

## Goal (Session 94)

Continuazione diretta di Session 93 nella stessa giornata: indirizzare il Finding #1 (Fase B) di `findings2agosto2016.md` — token mobile (access token, refresh token, oggetto utente) salvati in chiaro via `AsyncStorage` invece che in `expo-secure-store` cifrato.

## Esito (Session 94)

### Design — `/superpowers:brainstorming`

Analizzati i 4 consumer diretti delle 3 chiavi sensibili (`authService.js`, `apiClient.js`, `RootNavigator.jsx`, `ChangePasswordScreen.jsx`). Decisioni esplicite via `AskUserQuestion`: nuovo modulo `secureAuthStorage.js` come unico punto di accesso; **nessuna migrazione dati** (forza re-login una tantum — motivato dal fatto che la base utenti reale oggi è solo test interno, e il cold-start esistente in `RootNavigator` già ripulisce automaticamente i residui in chiaro della vecchia build).

Su domanda diretta dell'utente ("è corretto dal punto di vista di sicurezza/GDPR?"), confermato: `expo-secure-store` chiude realmente il vettore "estrazione da backup" del finding (Keychain non incluso nei backup non cifrati), Art. 32 GDPR nomina la cifratura come misura appropriata. Da un'analisi esplicitamente richiesta ("che cosa altro potresti aggiungere allo scope?") sono emerse 2 aggiunte concrete, verificate nel codice e approvate una per una: **scrubbing Sentry mobile** (mai esistito prima, a parità col backend, finding storico S.25) e **gestione esplicita errori SecureStore** (nuova classe di fallimento assente con `AsyncStorage`).

Spec: `docs/superpowers/specs/2026-08-07-mobile-secure-token-storage-design.md`.

### Piano ed esecuzione — `/superpowers:writing-plans` + `/superpowers:subagent-driven-development`

Piano 9 task TDD (`docs/superpowers/plans/2026-08-07-mobile-secure-token-storage-plan.md`), eseguito in worktree isolato (`.claude/worktrees/mobile-secure-token-storage`, tool nativo `EnterWorktree`).

**Problema scoperto subito dopo la creazione del worktree**: branchato da un punto precedente ai commit di spec+piano appena scritti su `main` locale (mai pushati) — il file del piano non esisteva nel worktree. Risolto con `git rebase --onto` per innestare i commit mancanti sotto ai primi due task già fatti, branch riallineato con `git branch -f` dopo che il rebase l'aveva lasciato in detached HEAD.

**9 task, ognuno con implementer + spec-reviewer + code-quality-reviewer indipendenti:**
- Dipendenza `expo-secure-store` (auto-registra il config plugin in `app.json`, verificato legittimo).
- Modulo `secureAuthStorage.js` (9 test TDD).
- `authService.js` — nessun test esisteva prima, colmato (6 test nuovi).
- `apiClient.js` — **bug ambientale reale scoperto dal test stesso**: `await import('./authService')` (codice preesistente, mai testato prima) non funziona sotto la config Jest del progetto (`babel-preset-expo` senza `--experimental-vm-modules`). Fix in commit separato: `require()` lazy equivalente, verificato semanticamente identico anche in produzione (Metro compila comunque a CommonJS).
- `RootNavigator.jsx` — **code review ha trovato un problema reale**: `Promise.all` del cold-start senza `.catch` (prima `AsyncStorage.multiRemove` non falliva quasi mai, ora `secureAuthStorage.clearSession()` può lanciare per davvero). Fix con `.catch`+`console.warn`, sia lì sia sulla lettura ruolo in `MainTabs`.
- `ChangePasswordScreen.jsx` / `LoginScreen.jsx` — messaggio dedicato quando il salvataggio sicuro fallisce DOPO che l'operazione è già riuscita lato server.
- Scrubbing Sentry (`sentryScrub.js`).
- Gate finale — 108 test (107 pass, 1 flake pre-esistente non correlato in `MyScheduleScreen.test.jsx`, verificato con **diff vuoto** contro il commit base), grep zero residui `AsyncStorage` sulle chiavi sensibili.

**Review finale olistica** sull'intero diff (20 file): approvata, un solo problema minore (commento obsoleto in `endpoints.js`) corretto direttamente. Punto verificato esplicitamente: un fallimento di `secureAuthStorage.getToken()` nell'interceptor di richiesta di `apiClient.js` (gira ad OGNI chiamata API) non causa mai un crash non gestito — rientra nella catena axios, ogni chiamante ha già un catch generico per errori di rete.

### Merge e push

Fast-forward pulito su `main` (nessun conflitto). 107/108 verdi post-merge (richiesto `npm install` sulla checkout principale, `node_modules` separato dal worktree). Worktree e branch temporaneo puliti via `finishing-a-development-branch`. **Push su `origin/main` su richiesta esplicita** — 13 commit portati remoti (incluso backlog di commit locali mai pushati da Session 93).

## Cosa NON è stato fatto

Nessuna build nativa lanciata. `expo-secure-store` è un modulo nativo, non distribuibile via OTA (`expo-updates`) — il fix è mergeato ma non raggiunge alcun utente reale finché non si fa un bump `buildNumber` + Codemagic + submit TestFlight/Play Store, stesso processo della Build 34 (Session 93).

## Backlog per la prossima sessione (in ordine di urgenza)

1. **Fase C** (geofencing/QR rotation reali, finding #2+#5 — il geofencing esiste nel codice ma il mobile non invia mai le coordinate GPS) — non iniziata. Resta l'unico finding HIGH ancora aperto di `findings2agosto2016.md`.
2. **Nuova build nativa** per distribuire il fix Fase B (bump `buildNumber`, Codemagic, submit) — quando si decide di rilasciarlo.
3. **S.26** — consenso GPS esplicito (GDPR Art. 7, HIGH) — dormiente finché nessun cliente reale chiede il geofencing, va di pari passo con Fase C.
4. **ANDROID.1/1b** — verifica manuale scan QR reale su device fisico/Virtual Scene, bloccato da un limite di automazione GUI-only.
5. Backlog invariato da Session 89: bug UX redirect post-login (`LoginPage.jsx:44`, basso rischio).
6. **2 sotto-punti checklist wizard non verificabili** (Sezioni 6.4/6.5, da Session 92) — richiedono una build mobile puntata su staging, mai costruita.
7. **Fallimenti CI pre-esistenti, non bloccanti**: `Mobile - Test` (flakiness nota `MyScheduleScreen.test.jsx`), `Security Check`/`npm audit` (vulnerabilità documentate da Session 79).

## Note operative (Session 94)

- **`EnterWorktree`/native worktree tool + commit locali non pushati**: se si scrivono commit su `main` locale (es. spec+piano) e SUBITO DOPO si crea un worktree per eseguirli, verificare che il worktree sia stato branchato da un punto che include quei commit — il tool può branchare da `origin/<default>` per default (`fresh`), che non li vede se non sono mai stati pushati. Sintomo: file attesi mancanti nel worktree. Fix: `git rebase --onto <commit-con-i-file> <vecchio-base> HEAD`.
- **Codice "preesistente" copiato in un piano non è automaticamente testato**: il piano riportava `await import(...)` perché era già nel file — nessuno aveva mai verificato che funzionasse sotto Jest finché un nuovo test non l'ha esercitato per la prima volta. Non assumere che codice esistente sia jest-compatibile solo perché non ha mai fallito (poteva semplicemente non essere mai stato testato).
- **`Promise.all` che prima non falliva mai può iniziare a fallire dopo una migrazione di storage**: `AsyncStorage` quasi non lancia mai; API più severe come `SecureStore` sì. Ogni `Promise.all`/`.finally()` esistente che le include va rivisto per un `.catch` esplicito.
- **Worktree e main checkout hanno `node_modules` separati**: dopo un merge locale, va rieseguito `npm install` sulla checkout principale se il branch mergeato aggiungeva una dipendenza — altrimenti i test relativi falliscono per moduli mancanti, non per un vero problema di codice.
- Branch di questa sessione (`worktree-mobile-secure-token-storage`) già mergeato ed eliminato.

---

## Handoff precedenti (invariati, riportati sotto per contesto)

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
