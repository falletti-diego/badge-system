# Badge System — Session 83 Handoff

**Date:** 2026-07-28
**Session:** 83 — Validazione Android completa (`docs/superpowers/plans/2026-07-27-android-validation.md`)
**Status:** ✅ **COMPLETATA.** 18/18 task eseguiti, Gate G4 chiuso con 2 eccezioni dichiarate (non omissioni silenziose). Il mobile ha ora una validazione Android reale (emulatore) equivalente a quella già esistente per iOS (TestFlight + Maestro simulatore, Session 82).

---

## Goal

Mitigare/testare i 7 rischi Android-specifici mai verificati (Face ID senza blocco schermo, `isInternetReachable` nullo, date picker mai visto su Android, permesso location inutilizzato, tasto indietro hardware, permesso fotocamera negato permanentemente, build/profilo EAS Android mai testato) prima di poter accettare un cliente pilota reale con dipendenti Android — richiesto esplicitamente dall'utente.

---

## Current Progress — tutto fatto

**Fase 1 — Ambiente e build**: Android Studio + 2 AVD (`Pixel_6_API_34` fascia alta, `Android_Go_LowSpec` fascia bassa — Pixel 4a, RAM 3072MB, grafica "Software - GLES 2.0" esplicita), nuovo profilo EAS `development-android`, prima build riuscita.

**Fase 2 — 4 fix di codice con TDD** (component test RNTL, platform-agnostici):
- Rischio 1: `FaceIDScreen.jsx` — messaggio distinto se nessun blocco schermo è configurato, invece del loop "Riprova" infinito. Commit `c9377d5`.
- Rischio 2: `RootNavigator.jsx` — `isInternetReachable` nullo ora trattato come raggiungibile per il flush della coda offline. Commit `962b9c4`.
- Rischio 4: rimossi permesso `ACCESS_FINE_LOCATION` e dipendenza `expo-location` inutilizzati. Commit `f952bea`+`bf63873`.
- Rischio 6: bottone "Apri Impostazioni" quando il permesso fotocamera è negato permanentemente. Commit `d8ea612`.

**Fase 3 — Maestro Android** (8 flow, riusando l'infrastruttura Maestro già scritta per iOS in Session 82): back-button (3 varianti), permesso fotocamera primo-diniego, Face ID con fallback PIN, date picker Ferie/Malattia. Bug locale reale trovato (date picker sempre in inglese nonostante `locale="it-IT"` — libreria ignora la prop su Android) e **accettato come rischio residuo noto** (Task 12ter). Gate G3/G3bis chiuso con 2 run consecutivi 6/6 verdi.

**Code review critica** (`/code-review:code-review`, adattata al range di commit locale — nessuna PR nel repo, commit diretti su `main`), eseguita 2 volte: 2 bug reali trovati e fixati, entrambi in `FaceIDScreen.jsx` — stato bloccato su rejection di `authenticateAsync` (commit `4baee46`), poi il catch che la risolveva mascherava silenziosamente qualunque errore senza logging (commit `d7c445b`).

**Fase 4 — 5 test aggiuntivi anti-gap "nessun device fisico" (Test A-E)**:
- **A** (suite Maestro su AVD fascia bassa): cold-start 14-20s misurato, mitigato con timeout più alti; causa più profonda (tap sul launcher che a volte non registra) accettata come limitazione nota dell'automazione su questo AVD, non un bug app.
- **B** (fotocamera reale via Virtual Scene): setup completo (QR reale con UUID DB, camera live confermata), bloccato sull'ultimo passo (orientamento manuale scena 3D, non scriptabile via CLI) — rinviato.
- **C** (profiling `dumpsys gfxinfo`/`meminfo`): jank severo reale confermato su hardware low-end (100%/99,77% frame jank sulle due schermate animate), nessun leak di memoria — rinviato come ottimizzazione.
- **D** (backgrounding/Doze mode): non eseguito, stesso blocco del Test B.
- **E** (cold-start/dimensione APK su build `preview`): chiuso, nessun problema (sub-500ms, 108-109MB).

Gate G4 chiuso con le eccezioni B/D dichiarate esplicitamente.

**Decisioni esplicite dell'utente**: fallback Face ID resta sempre il PIN del device (mai un bypass — indebolirebbe l'argomento anti-frode del posizionamento commerciale); Test B/D rinviati a `ANDROID.1`/`ANDROID.1b` (pre-commercializzazione); ottimizzazione jank (Test C) rinviata come `ANDROID.2`.

---

## What Worked

- **Verifica empirica prima di ogni fix presunto** (Rischi 3, 5, 7): niente fix "a sensazione" — solo dopo un test Maestro/build reale che confermasse o smentisse il sospetto. Ha evitato di introdurre complessità (es. un config plugin nativo per il locale del date picker) per un problema poi giudicato non bloccante.
- **Baseline di controllo prima di misurare il jank** (0 frame su schermata statica in 30s) — ha reso il dato di jank sulle schermate animate difendibile come reale, non un artefatto dell'emulatore.
- **Ogni blocco portato esplicitamente all'utente** (`AskUserQuestion`) invece di essere "risolto" con un workaround fragile o insabbiato — Task 13, 14, 15, 16 hanno tutti avuto una decisione esplicita dell'utente su come chiudere, non un'interpretazione autonoma.
- **Due code review complete sull'intero lavoro** (fine Fase 3 e fine Fase 4), non solo alla fine — hanno trovato 2 bug reali (entrambi in `FaceIDScreen.jsx`) che nessun test automatico copriva ancora.
- **Diagnosi corretta di una falsa flakiness**: `maestro test <cartella>` esegue i flow in parallelo sullo stesso device (conflitti di tap tra flow, non regressioni app) — risolto eseguendo ogni flow singolarmente in sequenza.

## What Didn't Work / Lezioni

- **Prima diagnosi del Task 13 incompleta**: il timeout più alto (25000ms) ha mitigato il cold-start lento ma non la causa più profonda (tap sul launcher che non registra) — scoperta solo verificando il fix con un run fresco, non assumendo che il fix funzionasse dopo averlo scritto. Lezione: verificare sempre un fix con un'esecuzione reale fresca, mai dare per buono un fix solo perché la diagnosi iniziale sembrava plausibile.
- **Virtual Scene camera dell'emulatore non è pilotabile da CLI per orientamento/pan/rotate** — solo il caricamento dell'immagine (`adb emu virtualscene-image`) è scriptabile, non il puntamento della vista 3D. Questo ha bloccato 2 test su 5 (B, D) alla stessa precondizione. Se questo limite ricorre in futuro, l'unica via è l'interazione manuale GUI (Extended Controls, mouse-drag+WASD) o una macro `automation record/play` pre-registrata (richiede una registrazione manuale preventiva, non usabile "a freddo").
- **Memoria/processi Gradle/Kotlin residui** hanno causato più volte pressione di memoria e flakiness spuria durante la sessione — `pkill -f GradleDaemon`/`pkill -f KotlinCompileDaemon` risolve, utile controllarlo (`top -l 1 -n 0 | grep PhysMem`) prima di attribuire un fallimento test a una causa "reale".

---

## Next Steps

1. **`ANDROID.1`/`ANDROID.1b`** (`TASKS.md`) — prima di un cliente pilota reale con dipendenti Android: orientare manualmente la Virtual Scene camera (Extended Controls, mouse-drag) per completare lo scan QR reale + verificare il ciclo backgrounding/Doze mode della coda offline. QR di test già pronto: `badge://checkin?site_id=550e8400-e29b-41d4-a716-446655440012&client_id=550e8400-e29b-41d4-a716-446655440001` (sito "Torino Store"). Nota: se il DB locale viene ricreato, riassegnare `assigned_sites` a `maria@badge.local`.
2. **`ANDROID.2`** (`TASKS.md`) — ottimizzare le animazioni `Animated.loop` in `FaceIDScreen.jsx`/`QRScannerScreen.jsx` per hardware Android di fascia bassa, prima del lancio commerciale su un segmento con probabile hardware datato. Non blocca la demo interna.
3. **Task 12ter** (date picker locale inglese su Android) — rischio residuo accettato, non bloccante; da rivalutare solo se un cliente reale lo segnala come problema.
4. Backlog invariato da Session 82: rendere "Mobile - Test" (CI) required su GitHub (azione manuale admin), riprendere Task B6 (Offline Mode retest finale, Build 33), SES fuori Sandbox, CI "Security Check" rosso pre-esistente.

---

## Dove sono le cose

- **Piano eseguito**: `docs/superpowers/plans/2026-07-27-android-validation.md` (18/18 task)
- **Design doc (7 rischi)**: `docs/superpowers/specs/2026-07-27-android-validation-design.md`
- **AVD creati**: `Pixel_6_API_34` (fascia alta), `Android_Go_LowSpec` (fascia bassa, Pixel 4a/3GB RAM/GLES2 software)
- **Profilo EAS**: `development-android` in `frontend-mobile/eas.json`
- **Maestro Android**: `frontend-mobile/maestro/android-*.yaml` (+ i 2 flow condivisi con iOS, ora adattati per Android), script `frontend-mobile/scripts/run-maestro-android.sh`
- **Fix di codice**: `frontend-mobile/src/screens/checkin/FaceIDScreen.jsx`, `frontend-mobile/src/navigation/RootNavigator.jsx`, `frontend-mobile/app.json`, `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`
- **Commit range Session 83**: `78970d5` → `d7c445b`, tutti pushati su `main`
- **Backlog residuo**: `TASKS.md` sezioni `ANDROID.1`/`ANDROID.1b` e `ANDROID.2`

## Note operative

- **Per rilanciare la suite Maestro su Android**: `cd frontend-mobile && emulator -avd <nome-avd> & adb wait-for-device && ./scripts/run-maestro-android.sh <nome-avd>` (nomi AVD: `Pixel_6_API_34` o `Android_Go_LowSpec`)
- **Avviare un solo AVD alla volta** — due AVD contemporanei su questo Mac causano pressione di memoria e rendering software instabile su `Android_Go_LowSpec`
- **Prima di un boot AVD fresco**, se serve tenere lo schermo acceso per test lunghi: `adb shell dumpsys battery set ac 1` PRIMA di `adb shell svc power stayon true` (altrimenti `stayon` non ha effetto)
- **Play Store / Google Play Console / Internal Testing restano fuori perimetro** finché non c'è un cliente reale con dipendenti Android — questa validazione è solo su emulatore locale, nessuna build Android è mai stata pubblicata o distribuita esternamente
- Deploy landing: SEMPRE `--site a31a2216-fb06-47e0-b632-a1193a88039a` · Deploy badge frontend: `--site 29a79b49-...` · Backend: automatico su push `main` (`backend/**`) · Mobile iOS: build via Codemagic (workflow `badge-ios-testflight`), trigger manuale dall'utente · Mobile Android: solo build locale EAS (`eas build --profile development-android --platform android --local`), nessuna pipeline CI/CD Android ancora esistente
- **Credenziali test mobile**: `maria@badge.local` / `maria01` (employee, Torino, `assigned_sites` include Torino Store) · `pino@badge.local` (manager, Torino, password nota all'utente)
- TestFlight Build (numerazione corrente, build 33) scade **2026-09-08** — reminder rinnovo **2026-08-25**.
