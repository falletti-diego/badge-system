# Badge System — Session 96 Handoff

**Date:** 2026-08-07
**Session:** 96 — P2 backlog: fix root cause flakiness `MyScheduleScreen.test.jsx` + `npm audit fix` non-breaking su backend/web/mobile
**Status:** ✅ 4 commit pushati su `origin/main`. Punto P2.6 del backlog (flakiness + audit) chiuso. Punto P2.5 (checklist wizard 6.4/6.5) discusso, approccio proposto, **non ancora eseguito**.

---

## Goal (Session 96)

Continuazione diretta di Session 95. Chiudere i 2 punti P2 del backlog: la flakiness nota di `MyScheduleScreen.test.jsx` e le vulnerabilità `npm audit` già documentate (Session 79). Richiesto esplicitamente dall'utente di spiegare l'approccio prima di agire ("senza compromettere nulla e ridurre il rischio di bug al minimo possibile") — spiegazione data, confermata, poi eseguita.

## Esito (Session 96)

### Fix flakiness — non era mai vera flakiness
5 run consecutivi in isolamento hanno fallito deterministicamente 5/5, non in modo intermittente. Causa reale: il test hardcodava date `2026-07-01`/`02` (Luglio) mentre il componente (`MyScheduleScreen.jsx:24-26`) renderizza sempre la griglia giorni dall'orologio di sistema reale — funzionava per coincidenza mentre l'orologio era in Luglio, rotto deterministicamente da quando è passato ad Agosto. Fix: date derivate da `now.getMonth()`/`now.getFullYear()`, stesso pattern già usato dal test sibling nello stesso file. Verificato rosso→verde, poi 16/16 suite e 108/108 test mobile per non-regressione. Commit `21fdacd`.

### `npm audit fix` non-breaking, uno per progetto con verifica suite dopo ciascuno
- **backend** (`3d28206`): `brace-expansion` (high) risolto. `uuid`/`exceljs` (moderate) lasciati — richiederebbero `--force`, major bump breaking. 2 fallimenti in `auth-refresh-concurrent-stress.test.js` durante la suite completa, verificati 3/3 verdi in isolamento — stessa flakiness da contesa connessioni/pool DB già documentata Session 92, non causata da questo fix.
- **frontend-web** (`9f61b74`): `axios`+`form-data` risolti. `react-router` lasciato — vulnerabile anche alla major 6 più recente installata (`6.30.4`), il fix reale richiede la major 7 (breaking).
- **frontend-mobile** (`982a0bf`): patch bump `expo` 54.0.35→54.0.36 (dentro `~54.0.0` già dichiarato, non minor/major), 22→15 vulnerabilità production-relevant (`npm audit --omit=dev`). Residuo Expo CLI/config-plugins (build-time, non runtime) lasciato deliberatamente — non introdurre instabilità nel toolchain subito dopo aver spedito la Build TestFlight 35 in Session 95.

Tutti e 3 verificati con suite di test completa verde prima del commit. Push su `origin/main` su richiesta esplicita.

## Cosa NON è stato fatto (Session 96)

**Punto P2.5 del backlog (checklist wizard onboarding, Sezioni 6.4/6.5 — verifica trasferimento sede via check-in reale) non eseguito.** Approccio proposto e condiviso con l'utente: `EXPO_PUBLIC_API_URL=https://staging-api.dataxiom.it npx expo start --tunnel` + app **Expo Go** su un device fisico (nessuna build nativa necessaria — `expo-secure-store` e tutti gli altri moduli usati sono standard Expo SDK, supportati nativamente da Expo Go, non richiedono un dev-client custom). In attesa di conferma dell'utente per procedere.

Nessuna vulnerabilità `--force`/breaking risolta in nessuno dei 3 progetti (deliberato, per non introdurre rischio non richiesto).

## Backlog per la prossima sessione (in ordine di urgenza)

1. **Fase C** (geofencing/QR rotation reali, finding #2+#5) — non iniziata. Resta l'unico finding HIGH ancora aperto di `findings2agosto2016.md`.
2. **S.26** — consenso GPS esplicito (GDPR Art. 7, HIGH) — dormiente finché nessun cliente reale chiede il geofencing, va di pari passo con Fase C.
3. **ANDROID.1/1b** — verifica manuale scan QR reale su device fisico/Virtual Scene, bloccato da un limite di automazione GUI-only.
4. **Checklist wizard 6.4/6.5** (Session 96, approccio già deciso — vedi sopra) — sessione Expo Go + staging, nessuna build richiesta.
5. (Opzionale) Verifica manuale della Build 35 su un dispositivo reale — login, secure storage, TestFlight expiry esatta su App Store Connect (portato avanti da Session 95, mai eseguito).

## Note operative (Session 96)

- **Non fidarsi delle label ereditate ("flaky")**: un test etichettato flaky da sessioni precedenti si è rivelato deterministico al 100% appena rieseguito in isolamento più volte. "Flaky" era una diagnosi sbagliata mai verificata a fondo — un bug dipendente dal tempo di sistema, non una race condition.
- **`npm audit fix` senza `--force` è genuinamente a rischio quasi zero**: rispetta sempre i range semver già dichiarati in `package.json` (verificato per `expo`: bump di sola patch dentro `~54.0.0`). Il rischio vero è solo committare senza far girare la suite di test dopo — fatto sistematicamente in questa sessione, un progetto alla volta.
- **Fallimenti durante `npm test` su suite grandi non sono automaticamente regressioni**: prima di attribuire un fallimento al proprio cambiamento, rieseguire il singolo file in isolamento — se passa ripetutamente da solo, è quasi sempre contesa di risorse condivise (pool DB, connessioni) tra suite parallele, non causato dal fix appena applicato.
- **Distinguere dipendenze runtime da dipendenze build-time/tooling quando si valuta il rischio di un audit fix**: la maggior parte delle vulnerabilità mobile residue sono in `@expo/config-plugins`/Expo CLI (usati solo per generare il progetto nativo in fase di build), non nel bundle JS che gira sul device — un fatto verificabile leggendo l'albero delle dipendenze dell'audit, non da assumere.

---

## Handoff precedenti (invariati, riportati sotto per contesto)

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
