# Ottimizzazione jank animazioni Android low-end — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ridurre il jank misurato (Sessione 83, `dumpsys gfxinfo` su `Android_Go_LowSpec`: 100% `QRScannerScreen`, 99,77% `FaceIDScreen`) disattivando le sole animazioni decorative (arco rotante, pallino di stato) su device Android rilevati come low-end via soglia di RAM, lasciando invariate le animazioni funzionali (scan-line, ring-pulse) e l'esperienza su device di fascia alta.

**Architecture:** un nuovo modulo puro `frontend-mobile/src/utils/deviceTier.js` (`isLowEndDevice()`, basato su `expo-device`) consumato localmente da `FaceIDScreen.jsx` e `QRScannerScreen.jsx` per decidere, a mount, se avviare i due `Animated.loop` decorativi. Nessuno stato globale, nessuna nuova dipendenza oltre `expo-device`.

**Tech Stack:** `expo-device` (nuova dipendenza), `jest-expo` + `@testing-library/react-native` (già configurati), AVD `Android_Go_LowSpec`/`Pixel_6_API_34` (già esistenti da Sessione 83), `adb shell dumpsys gfxinfo`.

**Spec di riferimento:** `docs/superpowers/specs/2026-07-29-android-jank-lowend-design.md`

---

## Task 1: `expo-device` + modulo `deviceTier.js` (TDD)

**Files:**
- Modify: `frontend-mobile/package.json` (nuova dipendenza)
- Create: `frontend-mobile/src/utils/deviceTier.js`
- Create: `frontend-mobile/src/__tests__/deviceTier.test.js`

- [ ] **Step 1: installare la dipendenza**

```bash
cd frontend-mobile
npx expo install expo-device
```

Expected: `package.json` aggiornato con `expo-device` a una versione compatibile con Expo SDK 54 (verificato: nessun conflitto di peer dependency, SDK già in uso in tutto il progetto).

- [ ] **Step 2: scrivere il test (fallirà — il modulo non esiste ancora)**

Crea `frontend-mobile/src/__tests__/deviceTier.test.js`:

```js
jest.mock('expo-device', () => ({ totalMemory: null }));

describe('isLowEndDevice', () => {
  afterEach(() => {
    jest.resetModules();
  });

  function mockTotalMemory(value) {
    jest.doMock('expo-device', () => ({ totalMemory: value }));
  }

  it('returns true when totalMemory is at or below the 3GB threshold', () => {
    mockTotalMemory(2 * 1024 ** 3); // 2GB
    const { isLowEndDevice } = require('../utils/deviceTier');
    expect(isLowEndDevice()).toBe(true);
  });

  it('returns true when totalMemory equals exactly the threshold', () => {
    mockTotalMemory(3 * 1024 ** 3); // esattamente 3GB
    const { isLowEndDevice } = require('../utils/deviceTier');
    expect(isLowEndDevice()).toBe(true);
  });

  it('returns false when totalMemory is above the threshold', () => {
    mockTotalMemory(6 * 1024 ** 3); // 6GB, device di fascia alta
    const { isLowEndDevice } = require('../utils/deviceTier');
    expect(isLowEndDevice()).toBe(false);
  });

  it('returns false when totalMemory is null (iOS always reports null)', () => {
    mockTotalMemory(null);
    const { isLowEndDevice } = require('../utils/deviceTier');
    expect(isLowEndDevice()).toBe(false);
  });

  it('returns false and does not throw when reading Device.totalMemory throws', () => {
    jest.doMock('expo-device', () => ({
      get totalMemory() {
        throw new Error('native module unavailable');
      },
    }));
    const { isLowEndDevice } = require('../utils/deviceTier');
    expect(() => isLowEndDevice()).not.toThrow();
    expect(isLowEndDevice()).toBe(false);
  });
});
```

- [ ] **Step 2b: eseguire il test, verificare che fallisca**

```bash
cd frontend-mobile
npx jest deviceTier.test.js
```
Expected: FAIL — `Cannot find module '../utils/deviceTier'`.

- [ ] **Step 3: implementare `deviceTier.js`**

Crea `frontend-mobile/src/utils/deviceTier.js`:

```js
import * as Device from 'expo-device';

// Soglia "Android Go"/fascia bassa: stesso segnale usato dall'industria per il
// targeting di device economici. Su iOS Device.totalMemory è sempre null —
// fail-open verso `false` (comportamento identico a oggi), mai un falso
// positivo che peggiori l'esperienza su un device che non lo merita.
export const LOW_END_RAM_THRESHOLD_BYTES = 3 * 1024 ** 3; // 3GB

export function isLowEndDevice() {
  try {
    const totalMemory = Device.totalMemory;
    if (typeof totalMemory !== 'number' || totalMemory <= 0) return false;
    return totalMemory <= LOW_END_RAM_THRESHOLD_BYTES;
  } catch (err) {
    console.warn('[deviceTier] isLowEndDevice() failed, defaulting to false:', err.message);
    return false;
  }
}
```

- [ ] **Step 4: eseguire il test, verificare che passi**

```bash
cd frontend-mobile
npx jest deviceTier.test.js
```
Expected: PASS — 5/5 test verdi.

- [ ] **Step 5: commit**

```bash
git add frontend-mobile/package.json frontend-mobile/package-lock.json frontend-mobile/src/utils/deviceTier.js frontend-mobile/src/__tests__/deviceTier.test.js
git commit -m "feat(mobile): rilevamento device low-end via soglia RAM (ANDROID.2 Task 1)"
```

---

## Task 2: `FaceIDScreen` — arco rotante condizionale (TDD)

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/FaceIDScreen.jsx`
- Modify: `frontend-mobile/src/__tests__/FaceIDScreen.test.jsx`

Codice attuale rilevante (`FaceIDScreen.jsx`, righe 21-22, 41-47, 104, 120):
```js
const arcRotation = useRef(new Animated.Value(0)).current;
...
useEffect(() => {
  const loop = Animated.loop(
    Animated.timing(arcRotation, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true }),
  );
  loop.start();
  return () => loop.stop();
}, [arcRotation]);
...
const arcSpin = arcRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
...
<Animated.View style={[styles.scanArc, { transform: [{ rotate: arcSpin }] }]} />
```

- [ ] **Step 1: scrivere il test (fallirà — il componente non consulta ancora `deviceTier`)**

In `frontend-mobile/src/__tests__/FaceIDScreen.test.jsx`, aggiungi in cima (accanto agli altri `jest.mock`, prima dei `require`):

```js
jest.mock('../utils/deviceTier', () => ({
  isLowEndDevice: jest.fn(() => false),
}));
```

e dopo gli altri `require` in cima al file:

```js
const { Animated } = require('react-native');
const { isLowEndDevice } = require('../utils/deviceTier');
```

Aggiungi un nuovo blocco `describe` (in fondo al file):

```js
describe('FaceIDScreen — low-end device animations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService.getUser.mockResolvedValue({ name: 'Maria Rossi', role: 'employee' });
    LocalAuthentication.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC);
  });

  it('starts only the ring-pulse loop on a low-end device, skipping the decorative arc rotation', async () => {
    isLowEndDevice.mockReturnValue(true);
    const loopSpy = jest.spyOn(Animated, 'loop');
    await renderScreen();

    // Oggi il componente avvia sempre 2 loop (ring-pulse + arco). Su low-end
    // deve avviarne solo 1 (il ring-pulse, funzionale) — l'arco decorativo
    // non deve mai chiamare Animated.loop.
    expect(loopSpy).toHaveBeenCalledTimes(1);
    loopSpy.mockRestore();
  });

  it('starts both loops (ring-pulse + decorative arc) on a normal device', async () => {
    isLowEndDevice.mockReturnValue(false);
    const loopSpy = jest.spyOn(Animated, 'loop');
    await renderScreen();

    // Comportamento invariato rispetto a prima di questo piano.
    expect(loopSpy).toHaveBeenCalledTimes(2);
    loopSpy.mockRestore();
  });
});
```

Questa asserzione (conteggio delle chiamate a `Animated.loop`) è deliberatamente scelta al posto di ispezionare lo style renderizzato dell'arco: non richiede aggiungere nuovi `testID`, non dipende dai dettagli interni di come `Animated` serializza un valore interpolato vs uno statico, ed è la tecnica standard per verificare "questo loop non è mai partito" in RNTL.

- [ ] **Step 2: eseguire il test, verificare che il primo fallisca** (il componente avvia sempre il loop oggi, incondizionatamente)

```bash
cd frontend-mobile
npx jest FaceIDScreen.test.jsx
```
Expected: FAIL sul test "does not start... on a low-end device".

- [ ] **Step 3: modificare `FaceIDScreen.jsx`**

```js
import { isLowEndDevice } from '../../utils/deviceTier';
```

Sostituisci l'effetto dell'arco rotante (righe 41-47) con:

```js
// Scan arc rotation loop — puramente decorativo, disattivato sui device
// low-end (soglia RAM, deviceTier.js) per ridurre il costo di compositing
// GPU misurato in Sessione 83 (99,77% frame jank su Android_Go_LowSpec).
// Il ring-pulse (sopra) resta sempre attivo: ha valore funzionale.
useEffect(() => {
  if (isLowEndDevice()) return undefined;
  const loop = Animated.loop(
    Animated.timing(arcRotation, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true }),
  );
  loop.start();
  return () => loop.stop();
}, [arcRotation]);
```

Rendi condizionale anche l'interpolazione/style (riga 104 e 120), così che su low-end l'arco sia visivamente fermo invece di restare "agganciato" a un `Animated.Value` che non si muove mai (equivalente visivo, ma più esplicito):

```js
const arcSpin = isLowEndDevice()
  ? '0deg'
  : arcRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
```

(Il JSX che usa `arcSpin` in `transform: [{ rotate: arcSpin }]` non cambia — `rotate` accetta sia un valore stringa fisso sia un `Animated.Value` interpolato.)

- [ ] **Step 4: eseguire il test, verificare che passi**

```bash
cd frontend-mobile
npx jest FaceIDScreen.test.jsx
```
Expected: PASS — tutti i test del file verdi, inclusi i 2 nuovi.

- [ ] **Step 5: commit**

```bash
git add frontend-mobile/src/screens/checkin/FaceIDScreen.jsx frontend-mobile/src/__tests__/FaceIDScreen.test.jsx
git commit -m "perf(mobile): disattiva l'arco rotante decorativo su device Android low-end (ANDROID.2 Task 2)"
```

---

## Task 3: `QRScannerScreen` — pallino di stato condizionale (TDD)

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`
- Modify: `frontend-mobile/src/__tests__/QRScannerScreen.test.jsx`

Codice attuale rilevante (`QRScannerScreen.jsx`, righe 27, 39-48):
```js
const pulseDotAnim = useRef(new Animated.Value(0)).current;
...
useEffect(() => {
  const loop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulseDotAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(pulseDotAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
    ]),
  );
  loop.start();
  return () => loop.stop();
}, [pulseDotAnim]);
```
e l'interpolazione `dotOpacity` (riga 185) applicata a `statusDot` (riga 236).

- [ ] **Step 1: scrivere il test (fallirà)**

In `frontend-mobile/src/__tests__/QRScannerScreen.test.jsx`, aggiungi in cima (accanto agli altri `jest.mock`):

```js
jest.mock('../utils/deviceTier', () => ({
  isLowEndDevice: jest.fn(() => false),
}));
```

e dopo gli altri `require` in cima al file:

```js
const { Animated } = require('react-native');
const { isLowEndDevice } = require('../utils/deviceTier');
```

Stesso pattern del Task 2 — un nuovo `describe`:

```js
describe('QRScannerScreen — low-end device animations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetLatestCameraProps();
    useCameraPermissions.mockReturnValue([{ granted: true, canAskAgain: true }, jest.fn()]);
    authService.getUser.mockResolvedValue({ employee_id: 'emp-1' });
  });

  it('starts only the scan-line loop on a low-end device, skipping the decorative status dot', async () => {
    isLowEndDevice.mockReturnValue(true);
    const loopSpy = jest.spyOn(Animated, 'loop');
    await renderScreen(); // usa l'helper di rendering già esistente nel file

    // Oggi il componente avvia sempre 2 loop (scan-line + pallino). Su
    // low-end deve avviarne solo 1 (lo scan-line, funzionale).
    expect(loopSpy).toHaveBeenCalledTimes(1);
    loopSpy.mockRestore();
  });

  it('starts both loops (scan-line + decorative status dot) on a normal device', async () => {
    isLowEndDevice.mockReturnValue(false);
    const loopSpy = jest.spyOn(Animated, 'loop');
    await renderScreen();

    expect(loopSpy).toHaveBeenCalledTimes(2);
    loopSpy.mockRestore();
  });
});
```

**Nota per l'implementatore**: usa l'helper di rendering (`renderScreen` o equivalente) e il setup dei permessi camera già presenti nel file esistente per gli altri test — non reinventarli. Stesso principio di verifica del Task 2 (conteggio `Animated.loop`, non ispezione dello style renderizzato).

- [ ] **Step 2: eseguire il test, verificare che fallisca**

```bash
cd frontend-mobile
npx jest QRScannerScreen.test.jsx
```
Expected: FAIL sul nuovo test "low-end".

- [ ] **Step 3: modificare `QRScannerScreen.jsx`**

```js
import { isLowEndDevice } from '../../utils/deviceTier';
```

Sostituisci l'effetto del pallino pulsante (righe 39-48) con:

```js
// Header status-dot pulse — puramente decorativo, disattivato sui device
// low-end (soglia RAM, deviceTier.js) per ridurre il costo di compositing
// GPU misurato in Sessione 83 (100% frame jank su Android_Go_LowSpec).
// Lo scan-line (sopra) resta sempre attivo: ha valore funzionale.
useEffect(() => {
  if (isLowEndDevice()) return undefined;
  const loop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulseDotAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(pulseDotAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
    ]),
  );
  loop.start();
  return () => loop.stop();
}, [pulseDotAnim]);
```

E l'interpolazione `dotOpacity` (riga 185 attuale) condizionale:

```js
const dotOpacity = isLowEndDevice()
  ? 1
  : pulseDotAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] });
```

- [ ] **Step 4: eseguire il test, verificare che passi**

```bash
cd frontend-mobile
npx jest QRScannerScreen.test.jsx
```
Expected: PASS — tutti i test del file verdi.

- [ ] **Step 5: commit**

```bash
git add frontend-mobile/src/screens/checkin/QRScannerScreen.jsx frontend-mobile/src/__tests__/QRScannerScreen.test.jsx
git commit -m "perf(mobile): disattiva il pallino di stato pulsante su device Android low-end (ANDROID.2 Task 3)"
```

---

## Task 4: `/test-all` + verifica su AVD + aggiornamento `TASKS.md`

**Files:**
- Modify: `TASKS.md` (chiusura item `ANDROID.2`)

- [ ] **Step 1: suite completa mobile**

```bash
cd frontend-mobile
npx jest
```
Expected: tutti i test verdi (nessuna regressione sui test esistenti — confermato in fase di design che nessuna asserzione preesistente dipende dai valori/timing di queste animazioni).

- [ ] **Step 2: build EAS locale sul profilo `development-android`** (già esistente da Sessione 83)

```bash
cd frontend-mobile
eas build --local --platform android --profile development-android
```
Expected: build completata, `.apk` generato.

- [ ] **Step 3: installare e avviare sull'AVD low-end**

```bash
emulator -avd Android_Go_LowSpec &
# attendere il boot, poi:
adb install -r <path-apk-generato>.apk
adb shell am start -n it.dataxiom.badge/.MainActivity
```

- [ ] **Step 4: ri-profilare esattamente come Sessione 83**

```bash
adb shell dumpsys gfxinfo it.dataxiom.badge reset
```
Navigare manualmente su `FaceIDScreen` e poi `QRScannerScreen`, restando su ciascuna schermata per ~30 secondi (stessa metodologia della Sessione 83), poi:

```bash
adb shell dumpsys gfxinfo it.dataxiom.badge
```
Confrontare `Janky frames` (%) e frame time mediano contro la baseline documentata:
- `QRScannerScreen`: baseline 100% jank / mediana 200ms (~5fps) — atteso un miglioramento misurabile, ma probabilmente non un azzeramento (la `CameraView` resta il collo di bottiglia dominante, fuori scope di questo piano).
- `FaceIDScreen`: baseline 99,77% jank / mediana 61ms (~16fps) — atteso un miglioramento più marcato, essendo l'unico overlay pesante (SVG dentro il parent animato) rimosso dal loop continuo.

- [ ] **Step 5: verificare nessuna regressione su `Pixel_6_API_34` (fascia alta)**

```bash
emulator -avd Pixel_6_API_34 &
adb install -r <path-apk-generato>.apk
```
Navigare su entrambe le schermate — verificare visivamente che arco rotante e pallino pulsante siano ancora animati come prima di questo piano (questo AVD ha RAM sopra soglia, `isLowEndDevice()` deve ritornare `false`).

- [ ] **Step 6: aggiornare `TASKS.md`**

Sostituire la voce `ANDROID.2` (sezione "PRE-LANCIO PRIMO CLIENTE REALE") con lo stato chiuso, i numeri di jank pre/post fix a confronto, e la conferma della verifica su `Pixel_6_API_34`.

- [ ] **Step 7: commit finale**

```bash
git add TASKS.md
git commit -m "docs: chiude ANDROID.2 — jank ridotto su Android low-end, verificato su AVD (Task 4/4)"
```

---

## Gate finale

- [ ] Tutti i test nuovi verdi + suite mobile esistente invariata (nessuna regressione)
- [ ] Jank misurato su `Android_Go_LowSpec` post-fix sensibilmente ridotto rispetto alla baseline (100%/99,77%) — obiettivo direzionale, non una soglia numerica rigida
- [ ] Comportamento su `Pixel_6_API_34` (fascia alta) verificato invariato rispetto a prima del fix

## Verification (end-to-end)

1. `npx jest` in `frontend-mobile/` → verde
2. Build + installazione su entrambi gli AVD (Task 4, Step 2-3-5)
3. `dumpsys gfxinfo` prima/dopo su `Android_Go_LowSpec` (Task 4, Step 4) — confronto numerico con la baseline Sessione 83
4. Verifica visiva su `Pixel_6_API_34` — nessuna regressione percepibile

## Fuori perimetro (esplicito)

- Nessuna modifica alla `CameraView`/`expo-camera` (risoluzione, frame rate) — resta probabilmente il collo di bottiglia dominante su `QRScannerScreen`.
- Nessuna disattivazione di scan-line/ring-pulse — restano sempre attivi, hanno valore funzionale.
- Nessun test su device fisico Android reale — verifica solo su AVD, come per l'intera validazione Android (Sessione 83).
- `ANDROID.1`/`ANDROID.1b` — item distinto nel backlog, non toccato da questo piano.
