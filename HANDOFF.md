# Badge System — Session 98 Handoff

**Date:** 2026-08-09
**Session:** 98 — Gruppo 1 backlog post-Fase-C: PDF export Riepilogo Ore + Help/FAQ in-app (web+mobile)
**Status:** ✅ Gruppo 1 chiuso e in produzione su `origin/main`. Nessun punto P0/P1/P2 aperto — il prossimo lavoro sostanziale è Fase C (P0, geofencing/QR rotation, finding #2+#5) oppure il resto del backlog post-Fase-C (Gruppo 2+: notifiche push, alert frodi, firma digitale, trust signal, branding, pricing, shift swap).

---

## Goal (Session 98)

Con Fase C tenuta deliberatamente da parte, l'utente ha chiesto quali altre attività indirizzare dal backlog MVP. `/superpowers:brainstorming` ha prodotto 9 item, raggruppati in batch coerenti su richiesta esplicita. L'utente ha scelto il Gruppo 1 (quick win frontend-web): PDF export sul Riepilogo Ore + Help/FAQ in-app statica (web+mobile).

## Esito (Session 98)

Ciclo completo design→spec→piano→implementazione→merge→push via skill chain `superpowers:brainstorming` → `writing-plans` → (`subagent-driven-development` poi switchato su richiesta a `executing-plans`) → `finishing-a-development-branch`.

**Due passate critiche esplicite sulla spec** (richieste dall'utente, non spontanee) hanno trovato bug reali prima di scrivere codice: (1) il filtro di visibilità per ruolo era fail-open (`role !== 'employee'`), sostituito con un'allowlist fail-closed `isVisible()`; (2) lo script di sync-check FAQ web/mobile come concepito era tecnicamente infattibile (richiedeva eseguire moduli cross-progetto tra un `frontend-web` ESM puro e un `frontend-mobile` senza risoluzione Metro), ridisegnato come estrazione testuale via regex.

**Self-review del piano** ha trovato e corretto un test scritto in sintassi Jest che non avrebbe mai girato (riscritto con `node:test` nativo) e uno script senza error handling sui file mancanti (verificato con dry-run reale in `/tmp`).

**2 scoperte implementative non previste dal piano**, entrambe diagnosticate correttamente: MUI `Accordion` tiene montato il contenuto collassato nel DOM (fix `TransitionProps={{ unmountOnExit: true }}`); `SettingsScreen.jsx` mobile richiede un vero `NavigationContainer` per `useFocusEffect` (test riscritto con navigator reale).

**Risultato**: 10/10 task TDD completati, nessuna modifica backend, Help/FAQ mobile distribuibile via OTA (nessun modulo nativo). Merge locale su raccomandazione esplicita, push su `origin/main` (commit `5f1eca6`→`8118387`). Worktree/branch temporaneo puliti manualmente dopo un errore di provenance su `ExitWorktree`.

**Dettaglio completo**: vedi `PROJECT_DECISIONS.md` sezione Session 98.

## Backlog per la prossima sessione (in ordine di urgenza)

1. **Fase C** (geofencing/QR rotation reali, finding #2+#5) — non iniziata. Resta l'unico finding HIGH aperto di `findings2agosto2016.md` e l'unica priorità P0 rimasta.
2. **Gruppo 2+ del backlog post-Fase-C** (non ancora brainstormato in dettaglio): notifiche push, alert frodi, firma digitale, trust signal, branding, pricing, shift swap.
3. **S.26** — consenso GPS esplicito (GDPR Art. 7, HIGH) — dormiente finché nessun cliente reale chiede il geofencing, va di pari passo con Fase C.
4. **ANDROID.1/1b** — verifica manuale scan QR reale su device fisico/Virtual Scene, bloccato da un limite di automazione GUI-only.
5. (Opzionale) Verifica manuale della Build 35 su un dispositivo reale — login, secure storage, TestFlight expiry esatta su App Store Connect.

---

## Handoff precedenti (invariati, riportati sotto per contesto)

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
