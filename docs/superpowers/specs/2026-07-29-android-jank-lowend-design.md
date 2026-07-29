# Ottimizzazione jank animazioni Android low-end — Design

**Data:** 29 Luglio 2026
**Status:** Approvato
**Collegato a:** `docs/superpowers/plans/2026-07-27-android-validation.md` (Test C, Sessione 83 — origine del profiling e del backlog `ANDROID.2`)

---

## Contesto

Durante la validazione Android (Sessione 83), il profiling via `adb shell dumpsys gfxinfo` sull'AVD `Android_Go_LowSpec` (Pixel 4a-class, RAM forzata a 3072MB, rendering **Software GLES2 esplicito**) ha misurato jank severo su due schermate con animazioni continue:

- `QRScannerScreen` (scan-line + fotocamera live): **100% frame jank, mediana 200ms (~5 fps)**
- `FaceIDScreen` (pulse ring + arco rotante): **99,77% jank, mediana 61ms (~16 fps)**
- Baseline di controllo (schermata statica): 0% jank su entrambi gli AVD — il jank è reale, non un artefatto generico dell'emulatore.

L'item era stato rinviato come non bloccante per la demo interna, da affrontare prima della commercializzazione su un segmento con probabile hardware Android datato.

**Scoperta chiave** (esplorazione del codice fatta prima di questo design): le animazioni **già seguono le best practice** — `useNativeDriver: true` su tutte le proprietà animate in loop (transform/opacity), nessuna SVG animata, nessun gradiente/ombra/blur. L'ipotesi originaria nel backlog ("verificare se `useNativeDriver: true` è sufficiente") è quindi già verificata: lo è. Il jank non deriva dalla complessità delle singole animazioni, ma dal costo di **compositing GPU complessivo** su un device forzato a rendering software — in particolare in `QRScannerScreen`, dove le animazioni girano sopra una `CameraView` live (`expo-camera`), essa stessa pesante su hardware low-end indipendentemente da qualunque animazione.

Inventario esatto del codice esistente:
- **`frontend-mobile/src/screens/checkin/FaceIDScreen.jsx`**: 2 loop continui — `pulseAnim` (scale 1→1.06, 1500ms, native driver) sul `ringOuter`, e `arcRotation` (rotate 0→360deg, 2000ms lineare, native driver) sul `scanArc`. Dentro l'`Animated.View` che ruota/pulsa c'è anche un'icona volto statica in `react-native-svg` (non animata essa stessa, ma ricompositata a ogni frame del parent).
- **`frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`**: 2 loop continui — `scanLineAnim` (translateY 20→240 + opacity, 2200ms, native driver) e `pulseDotAnim` (opacity 1↔0.4, 1000ms×2, native driver) sul pallino di stato nell'header, più 1 animazione one-shot `successAnim` (`useNativeDriver: false`, ma innesca solo al successo, fuori dalla finestra di steady-state jank misurata).

---

## Decisioni (via `/grilling`)

1. **Scope del fix: condizionale su low-end rilevato**, non un cambiamento universale. Su device di fascia alta l'esperienza visiva resta identica a oggi — nessun compromesso per la maggioranza dei dispositivi.
2. **Rilevamento low-end: soglia di RAM totale** via `expo-device` (`Device.totalMemory`), non una combinazione con l'API level né un flag manuale/remoto. Segnale oggettivo, stesso usato dall'industria per il targeting "Android Go" (tipicamente ≤3GB), nessuna calibrazione multi-variabile da giustificare.
3. **Cosa disattivare su low-end: solo le animazioni puramente decorative** — l'arco rotante (`FaceIDScreen`) e il pallino pulsante (`QRScannerScreen`). Restano invariati lo scan-line e il ring-pulse, che hanno un valore funzionale (indicano "sto scansionando"/"sto autenticando") e sono comunque animazioni a basso costo (singolo transform, nessun overlay aggiuntivo).
4. **Verifica: ri-profilare lo stesso AVD `Android_Go_LowSpec`** con la stessa identica procedura della Sessione 83, confrontando i numeri contro la baseline documentata — non solo test automatici.

---

## Architettura

Un nuovo modulo puro `frontend-mobile/src/utils/deviceTier.js`, zero stato/side-effect oltre alla lettura una tantum di `expo-device`, esporta `isLowEndDevice(): boolean`. Consumato da `FaceIDScreen.jsx` e `QRScannerScreen.jsx` per decidere, all'avvio del componente, se innescare i due loop decorativi (`arcRotation`, `pulseDotAnim`) oppure lasciare i rispettivi elementi in uno stato statico equivalente (arco fermo a un angolo fisso, pallino a opacità fissa 1).

Nessun nuovo stato globale/Context/Redux: la decisione è locale a ogni componente, letta una volta a mount — la RAM totale del device non cambia a runtime, quindi non serve reattività oltre il mount iniziale.

## Componenti

- **`frontend-mobile/src/utils/deviceTier.js`** (nuovo) — `isLowEndDevice()`, soglia `LOW_END_RAM_THRESHOLD_BYTES = 3 * 1024 ** 3` (3GB) come costante nominata, non un magic number. Su iOS (`Device.totalMemory` è sempre `null`) o in caso di valore non disponibile, ritorna `false` (fail-open verso l'esperienza attuale — mai peggiorare l'esperienza per un falso positivo).
- **`frontend-mobile/src/screens/checkin/FaceIDScreen.jsx`** (modifica) — `arcRotation` innescato solo se `!isLowEndDevice()`; se low-end, `scanArc` renderizzato con `rotate: '0deg'` fisso (l'`Animated.loop` non viene mai avviato, zero lavoro GPU aggiuntivo).
- **`frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`** (modifica) — stesso principio per `pulseDotAnim`: su low-end, `statusDot` renderizzato a opacità fissa (1, "sempre attivo") invece di pulsare.
- **`package.json`** — nuova dipendenza `expo-device` (non presente oggi nel progetto; Expo SDK 54 già in uso, compatibile), aggiunta via `npx expo install expo-device` (stesso pattern già seguito per `expo-crypto` in Sessione 79).

## Data flow

```
mount FaceIDScreen/QRScannerScreen
  → isLowEndDevice() [letto una volta, sync]
    → false (default, device fascia alta o rilevamento fallito): comportamento invariato, loop decorativo avviato come oggi
    → true (RAM totale ≤ 3GB): loop decorativo MAI avviato, elemento renderizzato nel suo stato visivo finale statico
```

## Gestione errori

`isLowEndDevice()` non deve mai lanciare — un `Device.totalMemory` assente/null/errore di lettura del native module viene trattato come "non low-end" (fail-open), con un `console.warn` solo se il valore è di un tipo inatteso (non per il caso normale iOS, dove `null` è il valore atteso e documentato dall'SDK). Coerente con CLAUDE.md Pattern 3 (mai un fallimento silenzioso che nasconda un problema reale) — ma qui il "fallimento" di rilevamento è per design innocuo (comportamento identico a oggi), quindi un warning informativo, non un errore.

## Testing

- **TDD su `deviceTier.js`**: mock di `expo-device` con vari valori di `totalMemory` — sotto soglia → `true`; sopra soglia → `false`; `null`/`undefined` (iOS) → `false`; `Device.totalMemory` che lancia → `false` (nessuna eccezione propagata).
- **Component test aggiornati** per `FaceIDScreen`/`QRScannerScreen`: mock di `deviceTier` per verificare che il loop decorativo NON parta quando `isLowEndDevice()` ritorna `true`, e che parta normalmente (comportamento invariato) quando ritorna `false`.
- **Verifica manuale su AVD**: ri-profilare `Android_Go_LowSpec` con la stessa procedura `dumpsys gfxinfo` della Sessione 83, confrontando contro la baseline; verificare anche su `Pixel_6_API_34` (fascia alta) che il comportamento visivo resti identico a prima.

---

## Fuori perimetro (esplicito)

- **Nessuna modifica alla `CameraView`/`expo-camera`** (risoluzione, frame rate) — resta probabilmente il collo di bottiglia dominante su `QRScannerScreen` anche dopo questo fix, ma non è in scope: questo design tocca solo le animazioni overlay.
- **Nessuna disattivazione di scan-line/ring-pulse** — hanno valore funzionale, esclusi dalla decisione presa via grilling.
- **Nessun test su device fisico Android reale** — rischio residuo già dichiarato dal design doc della validazione Android (Sessione 83): nessun device fisico disponibile in questa organizzazione, verifica solo su AVD.
- **`ANDROID.1`/`ANDROID.1b`** (scan QR reale via Virtual Scene, ciclo Doze) — item distinto nel backlog, non in scope qui.
