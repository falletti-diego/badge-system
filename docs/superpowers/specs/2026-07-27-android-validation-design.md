# Validazione Android — Design

**Data:** 27 Luglio 2026
**Status:** Approvato
**Collegato a:** `docs/superpowers/plans/2026-07-25-mobile-test-infrastructure.md` (infrastruttura test iOS, Sessione 82), `docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md` (Face ID come argomento anti-frode)

---

## Contesto

BadgeSystem è stato sviluppato e validato **solo su iOS** (TestFlight-only, nessuna build Android mai prodotta). Questa scelta aveva senso finché non esisteva nessun cliente reale. Ma il value prop core del prodotto è "zero hardware, i dipendenti usano lo smartphone personale" (`CLAUDE.md`) — e tra il personale retail/commesse a ore, il target dichiarato, Android ha una quota di mercato nettamente maggioritaria in Italia. Presentarsi a un cliente pilota reale senza aver mai verificato che l'app funzioni su Android è un rischio commerciale concreto, non solo tecnico.

Una revisione del codice mobile (non solo un elenco di rischi generici da letteratura) ha identificato **7 rischi specifici**, alcuni già noti, altri emersi solo analizzando il codice reale e l'interazione con backend/OS. Ogni rischio ha una mitigazione e un test associato — l'obiettivo è ridurli al minimo prima del primo cliente pilota con dipendenti Android, non eliminare ogni incertezza teoricamente possibile.

**Vincolo di realtà:** nessun account Google Play Developer, nessun device Android fisico disponibile, nessun Android SDK/emulatore installato su questa macchina ad oggi.

---

## Perimetro

**Dentro:** ambiente di sviluppo Android locale (Android Studio + AVD), un profilo EAS Android per build di test interne, mitigazione e verifica dei 7 rischi identificati, flow Maestro Android (solo locale, come iOS).

**Fuori (esplicito):**
- Google Play Store / Internal Testing track — richiederebbe un account Developer ($25 una tantum) e `google-play-service-account.json`, oggi assenti. Rimandato a quando ci sarà un cliente reale con dipendenti Android da onboardare.
- CI Android — per coerenza con la decisione presa su iOS ("non sovra-investire in automazione CI su un tool appena introdotto"), anche se tecnicamente più semplice su Android (emulatore disponibile su runner Linux GitHub Actions).
- Test su device fisico Android — nessuno disponibile; tutta la verifica avviene su AVD (Android Virtual Device).
- Geofencing GPS — `expo-location` risulta una dipendenza inutilizzata nel codice mobile attuale (nessun import in `src/`); non è nel perimetro di questo piano riattivarla.

---

## Ambiente locale

Installazione Android Studio (include SDK, `adb`, `emulator`) + creazione di un AVD Pixel 6, API level compatibile con Expo SDK 54 (API 34) — stesso ruolo che Xcode/simulatore hanno avuto per iOS nella Sessione 82. L'AVD viene creato **senza enrollment di un'impronta digitale virtuale** di default: questo è intenzionale, perché riproduce esattamente lo scenario "nessuna biometria configurata" necessario per testare il Rischio #4 sotto, senza bisogno di un device fisico spoglio.

## Build — nuovo profilo EAS `development-android`

Analogo a `development-simulator` (introdotto per iOS nella Sessione 82):
```json
"development-android": {
  "extends": "development",
  "android": {}
}
```
Build locale (`eas build --profile development-android --platform android --local`), installazione sull'AVD via `adb install <path-.apk>`. Nessuna modifica al profilo `production` esistente (che già contiene una config Android mai testata — questo piano la valida per la prima volta).

---

## I 7 rischi, mitigazione e test

### Rischio 1 — Face ID: vicolo cieco su hardware/enrollment assente (Alto)
**Problema:** `FaceIDScreen.jsx:49-61` chiama `LocalAuthentication.authenticateAsync()` senza verificare prima lo stato del device. Se non esiste **nessun** blocco schermo configurato (né biometria né PIN/pattern/password), l'autenticazione fallisce sempre e il bottone "Riprova" richiama la stessa funzione — loop infinito, dipendente bloccato dal check-in.

**Decisione di prodotto (confermata dall'utente):** quando la biometria non è disponibile, il fallback corretto è il **PIN/passcode del device** (non un bypass totale, che indebolirebbe l'argomento anti-frode del posizionamento commerciale). `authenticateAsync` con `disableDeviceFallback: false` (già il default nel codice attuale) tenta **automaticamente** questo fallback quando esiste un blocco schermo di qualunque tipo — quindi il caso "PIN configurato ma niente biometria" funziona già oggi senza modifiche, ma non è mai stato verificato empiricamente su Android.

**Mitigazione (fix di codice):** in `FaceIDScreen.jsx`, prima di chiamare `authenticateAsync`, chiamare `LocalAuthentication.getEnrolledLevelAsync()`. Se risulta `SecurityLevel.NONE` (nessun blocco schermo di alcun tipo, il solo caso realmente senza uscita), mostrare un messaggio distinto ("Il tuo dispositivo non ha nessun blocco schermo configurato. Contatta il tuo responsabile.") invece del generico "Autenticazione non riuscita. Riprova." — evita di promettere un "Riprova" che non potrà mai avere successo.

**Test:**
- Component test (RNTL, platform-agnostico): `getEnrolledLevelAsync` mockato a `NONE` → verifica che appaia il messaggio distinto, non il loop "Riprova"; mockato a `SECRET` o `BIOMETRIC` → comportamento invariato (chiama `authenticateAsync` come oggi).
- Maestro Android: sull'AVD senza impronta enrollata ma **con** PIN emulatore configurato (default AVD) → il flow di check-in deve arrivare al prompt PIN di sistema e completarsi.

### Rischio 2 — `isInternetReachable` può restare `null` su Android (Medio-Alto)
**Problema:** `RootNavigator.jsx:181` — `if (state.isConnected && state.isInternetReachable)`. Su Android, `isInternetReachable` può restare `null` (non `true`/`false`) più spesso che su iOS in certe condizioni di rete. Con un `&&` stretto, `null` è falsy: la sync della coda offline potrebbe non scattare mai anche a device online.

**Mitigazione (fix di codice):** cambiare la condizione a `state.isConnected && state.isInternetReachable !== false` — tratta `null` come "prova comunque"; se il device è realmente offline, la richiesta fallirà e l'elemento resta in coda (comportamento già gestito da `offlineQueue`), quindi il fix non introduce un rischio nuovo nel caso realmente offline.

**Test:** component test (RNTL) su `RootNavigator.test.jsx` — nuovo scenario: `NetInfo` emette `{ isConnected: true, isInternetReachable: null }` → `flushQueue()` deve essere chiamato (oggi non lo sarebbe). Nessun test Maestro necessario: è un comportamento di puro JS, già coperto a livello di component test.

### Rischio 3 — `DateTimePicker` con `display="spinner"` mai visto su Android (Medio)
**Problema:** usato in `LeaveRequestScreen.jsx` e `IllnessReportScreen.jsx`. La libreria (v8.4.4) supporta lo spinner inline anche su Android, ma dimensioni, locale `it-IT`, e interazione con il bottone "Fine" custom non sono mai stati verificati su un widget Android reale.

**Mitigazione:** nessun fix di codice presunto a priori — si verifica empiricamente prima di decidere se serve un adattamento (es. stile del contenitore, o passare a `display="default"` su Android se lo spinner risultasse inutilizzabile).

**Test:** Maestro Android — flow che apre il date picker in `LeaveRequestScreen` e `IllnessReportScreen`, assert di visibilità del picker e del bottone "Fine", selezione di una data e verifica che il valore visualizzato cambi coerentemente. Se il flow rivela un problema reale, si aggiorna questo documento con il fix necessario prima di chiudere il piano.

### Rischio 4 — Permesso `ACCESS_FINE_LOCATION` dichiarato ma inutilizzato (Basso)
**Problema:** `expo-location` è in `package.json` ma nessun file in `src/` la importa. Il permesso è comunque dichiarato in `app.json`, quindi Android lo richiede all'utente per una funzione inesistente nel codice mobile attuale.

**Mitigazione (fix di codice):** rimuovere `ACCESS_FINE_LOCATION` dall'array `permissions` in `app.json` e la dipendenza `expo-location` da `package.json`, poiché non usata. Se la geofence GPS tornerà nel mobile in futuro, si riaggiungeranno entrambe in quel momento.

**Test:** verifica statica — dopo il fix, build Android e ispezione del manifest generato (`android/app/src/main/AndroidManifest.xml` prodotto da `expo prebuild` o direttamente nell'output EAS) per confermare l'assenza del permesso; nessun test funzionale necessario (rimozione di codice morto).

### Rischio 5 — Tasto hardware "indietro" (Medio, rischio originario)
**Problema:** `@react-navigation/native-stack` v7 gestisce di default il tasto indietro (pop dello stack), ma il comportamento nei punti critici non è mai stato verificato: root di `Main` (deve uscire dall'app, non tornare a `Login`), durante `QRScanner` con fotocamera attiva, durante il prompt biometrico di `FaceIDScreen`.

**Mitigazione:** nessun fix presunto a priori — se l'audit rivela un comportamento sbagliato (es. `QRScanner` non rilascia la fotocamera, o back a root di `Main` non esce dall'app), fix mirato con un singolo listener `BackHandler` nel punto specifico individuato, non una soluzione globale preventiva.

**Test:** Maestro Android — 3 flow dedicati: (a) back a `Login` (nessun crash, comportamento OS di default accettabile), (b) back a root di `Main` (verifica uscita dall'app), (c) back durante `QRScanner` con fotocamera attiva (verifica assenza di crash e navigazione corretta).

### Rischio 6 — Flusso permessi fotocamera (Medio, rischio originario, con fix confermato)
**Problema:** `QRScannerScreen.jsx:196-214` distingue già "permesso negabile di nuovo" (`canAskAgain: true`) da "permesso negato permanentemente" (`canAskAgain: false`), ma nel secondo caso mostra solo testo istruttivo ("Vai in Impostazioni → Badge System → Fotocamera") **senza un bottone che apra realmente le Impostazioni**. Su Android questo stato si raggiunge più facilmente che su iOS (flag "Non chiedere più" compare prima).

**Mitigazione (fix di codice, confermato dall'utente):** aggiungere un bottone "Apri Impostazioni" che chiama `Linking.openSettings()` quando `permission.canAskAgain === false`.

**Test:**
- Component test (RNTL): mock di `useCameraPermissions` con `{ granted: false, canAskAgain: false }` → verifica che il bottone "Apri Impostazioni" sia presente e che al tap chiami `Linking.openSettings()`.
- Maestro Android — flow che nega il permesso fotocamera al primo prompt e verifica lo stato "richiedibile di nuovo"; il secondo stato (negato permanentemente) è verificato solo a livello di component test, perché Maestro non può forzare in modo affidabile il flag "Non chiedere più" di Android in automazione.

### Rischio 7 — Build/profilo EAS Android mai testato (Medio, rischio originario)
**Problema:** `app.json` ha una sezione Android completa (`package`, `versionCode`, `permissions`) mai buildata; `eas.json` ha un profilo `production` con config Android mai verificata.

**Mitigazione:** nessun fix di codice presunto — la mitigazione è la build stessa (profilo `development-android`, vedi sopra).

**Test:** verifica manuale — l'APK si installa sull'AVD via `adb install`, l'app si avvia, l'icona adattiva e il nome pacchetto (`it.dataxiom.badge`) sono corretti, nessun crash all'avvio.

---

## Maestro Android — flow

Riuso dei 2 flow esistenti (già scritti in YAML platform-agnostico per iOS, Sessione 82): `relaunch-requires-login.yaml`, `navigation-smoke.yaml` — dovrebbero girare su Android con adattamenti minimi (percorso dell'AVD invece del simulatore iOS).

Nuovi flow mirati ai rischi testabili via Maestro: back-button (Rischio 5, 3 varianti), permesso fotocamera primo-diniego (Rischio 6), Face ID senza biometria enrollata (Rischio 1), date picker (Rischio 3). I Rischi 2 e 4 sono verificati rispettivamente a livello di component test e di ispezione statica — non richiedono automazione Maestro.

---

## Test aggiuntivi — ridurre al minimo il gap "nessun device fisico"

Un solo AVD con configurazione unica approssima l'hardware reale meno di quanto sembri: un emulatore su Mac gira su un profilo hardware "pulito" (stock Android, nessuna skin OEM, nessun risparmio energetico aggressivo), diverso dal telefono economico che un commesso probabilmente usa davvero. Le 5 verifiche seguenti non eliminano questo gap (vedi "Rischi residui" per cosa resta genuinamente irriducibile), ma lo riducono in modo concreto e verificabile, non solo "più test per stare tranquilli":

**A. Secondo AVD a specifica bassa, non solo Pixel 6 gamma alta**
Il Pixel 6 è un profilo di fascia medio-alta — non rappresentativo del device economico tipico del personale retail a ore. Creare un secondo AVD con RAM ridotta (1-2GB) e l'API level minimo effettivamente supportato dalla build (verificare il `minSdkVersion` reale generato da EAS/Expo SDK 54 nell'output della build — non assumerlo a priori). Eseguire l'intera suite Maestro Android anche su questo secondo profilo, non solo su quello di fascia alta: differenze di layout, lentezza percepita, o crash legati a RAM limitata emergono solo qui.

**B. Verifica della fotocamera reale via "Virtual Scene", non solo eventi simulati**
Tutti i test QR attuali (component test e Maestro) iniettano l'evento `onBarcodeScanned` direttamente — **non passano mai per la vera pipeline nativa di scansione della fotocamera Android**. L'emulatore Android supporto una fotocamera virtuale "Virtual Scene" configurabile con un'immagine personalizzata: caricare un QR code reale generato da BadgeSystem come immagine di scena e verificare che `expo-camera` lo rilevi e triggeri `onBarcodeScanned` per davvero, end-to-end. Questo è l'unico modo per validare che la libreria di scansione funzioni sul motore camera Android nativo, non solo che la logica a valle dello scan sia corretta.

**C. Profiling prestazionale delle schermate animate (Android Studio Profiler)**
`QRScannerScreen` (scan-line loop) e `FaceIDScreen` (pulse ring + arc rotation) usano `Animated` con `useNativeDriver: true` — compatibile in teoria su entrambe le piattaforme, ma il motore di rendering Android può comportarsi diversamente sotto carico. Eseguire un profiling CPU/memoria/frame-rate (Android Studio Profiler) durante l'uso reale di queste due schermate sul secondo AVD (punto A, specifica bassa) per individuare jank o leak di memoria che un test funzionale non rileverebbe.

**D. Simulazione backgrounding + Doze mode per la coda offline**
I test Maestro attuali su `AppState`/`NetInfo` (ereditati da iOS) assumono un ciclo foreground/background pulito. I device Android reali, specialmente con battery manager OEM aggressivi (Samsung, Xiaomi — non riproducibili in AVD, vedi residui), possono sospendere il processo in modo più brusco. Simulare con `adb shell input keyevent KEYCODE_HOME` (backgrounding) seguito da `adb shell dumpsys deviceidle force-idle` (forza Doze mode) e poi la riattivazione, verificando che `flushQueue()` scatti comunque al ritorno in foreground — uno stress test più realistico del semplice "vai in background e torna" già coperto.

**E. Benchmark cold-start e dimensione APK**
Misurare il tempo di avvio a freddo (`adb shell am start -W it.dataxiom.badge/.MainActivity`) e la dimensione dell'APK generato sul secondo AVD (specifica bassa). Non è un test pass/fail in senso stretto, ma stabilisce una baseline numerica oggettiva — un proxy misurabile dell'esperienza su device economico reale, in assenza di uno fisico da cronometrare.

---

## Rischi residui (non eliminabili in questo piano)

Anche con le verifiche aggiuntive sopra, alcuni aspetti restano genuinamente non testabili senza un device fisico — è onesto dirlo esplicitamente piuttosto che implicare una copertura totale:

- **Skin OEM e battery manager reali** (One UI Samsung, MIUI Xiaomi, ecc.) — l'AVD gira su Android "stock", nessuna skin del produttore replica realmente il comportamento aggressivo di risparmio energetico di questi produttori, molto diffusi in Italia nella fascia di prezzo del personale retail. Il punto D sopra approssima ma non riproduce un vero battery manager OEM.
- **Sensori biometrici reali** — l'impronta virtuale dell'AVD (`adb -e emu finger touch`) prova il fallback PIN e il percorso "nessun enrollment", ma non il comportamento di un vero sensore di impronta o Face Unlock Android, che ha margini di errore e UX diversi da quello virtuale.
- Il posizionamento "Face ID anti-frode" resta un'ipotesi commerciale non validata (già segnalato nel documento di pricing) — questo piano rende il fallback PIN funzionante e verificato, ma non misura quanti dipendenti Android reali si troveranno effettivamente senza alcun blocco schermo configurato.
- Nessuna verifica su versioni Android più vecchie del secondo AVD a specifica bassa (punto A) — se un cliente reale ha dipendenti con device ancora più datati, potrebbero emergere comportamenti diversi non coperti qui.
- **Il primo cliente pilota Android reale resta la prova definitiva** — questo piano riduce il rischio al minimo ragionevolmente ottenibile senza hardware, non lo azzera.
