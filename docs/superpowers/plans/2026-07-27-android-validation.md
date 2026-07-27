# Validazione Android — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** validare l'app mobile BadgeSystem su Android — ambiente locale, build EAS, e mitigazione/test dei 7 rischi Android-specifici identificati in `docs/superpowers/specs/2026-07-27-android-validation-design.md`, prima del primo cliente pilota con dipendenti Android.

**Architecture:** managed Expo workflow invariato (nessuna directory `android/` nativa aggiunta a mano); nuovo profilo di build EAS `development-android` analogo a `development-simulator` già usato per iOS; fix di codice mirati con TDD (component test RNTL, platform-agnostici) per i rischi che sono puro comportamento JS; verifica su due AVD (Android Virtual Device) — uno di fascia alta, uno a specifica bassa (RAM ridotta, API minima supportata — non un'immagine "Go edition" autentica: verificato che Google non la distribuisce tramite il canale SDK Manager standard di Android Studio) — per i rischi che richiedono un runtime Android reale; Maestro Android per gli scenari E2E, riusando l'infrastruttura già scritta per iOS nella Sessione 82.

**Tech Stack:** Android Studio + SDK + AVD Manager, EAS Build (`eas build --local`), Maestro CLI (già installato), `jest-expo` + `@testing-library/react-native` (già configurati), `adb`.

---

# FASE 1 — Ambiente e build (Rischio 7: build/profilo EAS mai testato)

### Task 1: Installazione Android Studio + due AVD

**Files:** nessuno (solo setup di sistema, nessun file di repo modificato)

- [ ] **Step 1: installare Android Studio**

```bash
brew install --cask android-studio
```

- [ ] **Step 2: al primo avvio di Android Studio, completare il wizard "Setup Wizard"** (installa Android SDK, SDK Platform-Tools inclusi `adb`/`emulator`, un system image di default). Al termine, verificare che `adb` sia sul `PATH`:

```bash
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools:$HOME/Library/Android/sdk/emulator"
adb --version
```
Expected: stampa una versione (es. `Android Debug Bridge version 1.0.41`), non "command not found". Se serve, aggiungere le due righe `export PATH=...` a `~/.zshrc` per renderle permanenti.

- [ ] **Step 3: creare l'AVD di fascia alta** — Android Studio → More Actions → Virtual Device Manager → Create Device → **Pixel 6** → system image **API 34 (Android 14, "UpsideDownCake")**, immagine **senza Google Play** (basta Google APIs) va bene. Nome AVD: `Pixel_6_API_34`. **Importante:** durante la creazione, **non configurare alcuna impronta digitale virtuale** — l'AVD deve partire senza enrollment biometrico, per riprodurre lo scenario "nessuna biometria configurata" necessario più avanti (Rischio 1).

- [ ] **Step 4: creare l'AVD di fascia bassa** — stesso wizard. **Verificato (2026-07-27): le immagini "Go edition" non sono distribuite tramite l'SDK Manager standard di Android Studio** (richiesta a Google dal 2019, mai spedita nel canale di download normale) — non cercarle, non sono lì. Percorso corretto: device definition **Pixel 4a** (schermo 1080×2340, realistico per un budget/fascia-media phone del 2026 — un device vintage come Nexus S introdurrebbe rumore da risoluzione obsoleta, scartato per questo motivo). Questa definizione dichiara un floor minimo di API 30: scegliere il system image più basso disponibile tra quelli proposti per questo device (verosimilmente API 30-31) — **questo AVD non verifica il vero `minSdkVersion` della build** (quello resta un controllo separato al Task 2, Step 3), il suo obiettivo è la RAM ridotta, non l'API minima assoluta. Nella schermata "Verify Configuration", cliccare **"Show Advanced Settings"** e impostare **RAM a 3072 MB** in "Memory and Storage" (valore corretto dopo verifica pratica — 1536MB veniva comunque forzato dall'emulatore a un minimo più alto, e 3GB è più rappresentativo di un Android economico *attuale*, non di uno di 5+ anni fa) e il campo **Graphics a "Software - GLES 2.0"** esplicito, non "Automatic" (su questo Mac l'automatico tenta la negoziazione Vulkan, fallisce, e cade in un fallback instabile che ha causato schermo nero/errori "Failed to find ColorBuffer" durante la verifica). Nome AVD: `Android_Go_LowSpec` (il nome resta invariato per coerenza col resto del piano, anche se non è un'immagine Go autentica).

**Nota da verifica pratica:** avviare un solo AVD alla volta — eseguirne due contemporaneamente su questo Mac ha causato pressione di memoria sull'host e reso instabile il rendering software di `Android_Go_LowSpec`.

- [ ] **Step 5: verificare che entrambi gli AVD si avviino**

```bash
emulator -list-avds
```
Expected: elenca `Pixel_6_API_34` e `Android_Go_LowSpec`.

```bash
emulator -avd Pixel_6_API_34 &
```
Expected: la finestra dell'emulatore si apre e mostra la home screen Android entro 1-2 minuti. Ripetere per `Android_Go_LowSpec`, poi spegnere entrambi (`adb -s <serial> emu kill` o chiudere la finestra).

Nessun commit in questo task (nessun file di repo modificato).

---

### Task 2: Nuovo profilo EAS `development-android` + prima build

**Files:**
- Modify: `frontend-mobile/eas.json`

- [ ] **Step 1: aggiungere il profilo** — in `frontend-mobile/eas.json`, dentro l'oggetto `"build"`, accanto a `"development-simulator"`:

```json
"development-android": {
  "extends": "development",
  "android": {}
}
```

Il file completo della sezione `"build"` diventa:
```json
"build": {
  "development": {
    "developmentClient": true,
    "distribution": "internal",
    "channel": "development"
  },
  "development-simulator": {
    "extends": "development",
    "ios": {
      "simulator": true
    }
  },
  "development-android": {
    "extends": "development",
    "android": {}
  },
  "preview": {
    "distribution": "internal",
    "ios": {
      "simulator": false
    },
    "channel": "preview"
  },
  "production": {
    "ios": {
      "autoIncrement": true
    },
    "android": {
      "autoIncrement": true,
      "buildType": "app-bundle"
    },
    "channel": "production"
  }
}
```

- [ ] **Step 2: build locale** (non consuma minuti EAS cloud)

```bash
cd frontend-mobile
eas build --profile development-android --platform android --local
```
Expected: al termine, stampa il percorso di un file `.apk` generato (es. `build-XXXX.apk` nella directory corrente).

- [ ] **Step 3: verificare il `minSdkVersion` reale generato** (serve per scegliere correttamente l'API level dell'AVD `Android_Go_LowSpec` nel Task 1 se non già scelto, e per la Task 13/FASE 4)

```bash
unzip -p build-*.apk AndroidManifest.xml | strings | grep -i "minSdkVersion" || \
  aapt dump badging build-*.apk | grep -i "sdkVersion"
```
Se nessuno dei due comandi produce output leggibile (il manifest binario di un APK non è testo semplice), usare in alternativa l'output stampato da `eas build --local` stesso, che riporta il `minSdkVersion` effettivo usato nella fase di build Gradle — annotarlo per riferimento futuro.

- [ ] **Step 4: avviare l'AVD di fascia alta e installare l'APK**

```bash
emulator -avd Pixel_6_API_34 &
# attendere che l'emulatore sia pronto (adb devices lo mostra "device", non "offline")
adb wait-for-device
adb install build-*.apk
```
Expected: `Success` stampato da `adb install`.

- [ ] **Step 5: verificare l'avvio dell'app** — dalla home screen dell'emulatore, aprire l'app "Badge System" (icona adattiva con sfondo `#1E3A5F`, come da `app.json`). Verificare:
  - l'app si avvia senza crash
  - il nome pacchetto è corretto: `adb shell pm list packages | grep it.dataxiom.badge` deve stampare `package:it.dataxiom.badge`
  - l'icona adattiva è visibile correttamente (non un placeholder grigio)

- [ ] **Step 6: commit**

```bash
git add frontend-mobile/eas.json
git commit -m "build(mobile): nuovo profilo EAS development-android per test locali su emulatore"
```

---

# FASE 2 — Fix di codice con TDD (Rischi 1, 2, 4, 6)

### Task 3: Rischio 4 — rimuovere permesso location e dipendenza inutilizzati

**Files:**
- Modify: `frontend-mobile/app.json`
- Modify: `frontend-mobile/package.json`

- [ ] **Step 1: rimuovere `ACCESS_FINE_LOCATION` da `app.json`** — nella sezione `expo.android.permissions`, il file passa da:
```json
"permissions": [
  "CAMERA",
  "android.permission.USE_BIOMETRIC",
  "android.permission.USE_FINGERPRINT",
  "ACCESS_FINE_LOCATION"
]
```
a:
```json
"permissions": [
  "CAMERA",
  "android.permission.USE_BIOMETRIC",
  "android.permission.USE_FINGERPRINT"
]
```

- [ ] **Step 2: rimuovere `expo-location` da `package.json`** — eliminare la riga `"expo-location": "~18.1.5",` dalle `dependencies`.

- [ ] **Step 3: reinstallare per rigenerare il lockfile**

```bash
cd frontend-mobile
npm install
```
Expected: `package-lock.json` aggiornato senza errori, nessun'altra dipendenza cambiata.

- [ ] **Step 4: verificare che nessun file la usi ancora** (rete di sicurezza, non dovrebbe trovare nulla)

```bash
grep -rn "expo-location" src/ || echo "OK: nessun uso residuo"
```
Expected: `OK: nessun uso residuo`.

- [ ] **Step 5: verificare che la suite test esistente resti verde** (isola il rischio di questa rimozione da quello dei fix successivi)

```bash
npm test
```
Expected: tutti i test esistenti passano, nessuna regressione.

- [ ] **Step 6: commit**

```bash
git add app.json package.json package-lock.json
git commit -m "fix(mobile): rimuove permesso ACCESS_FINE_LOCATION e dipendenza expo-location inutilizzati"
```

---

### Task 4: Rischio 2 — `isInternetReachable` nullo su Android

**Files:**
- Modify: `frontend-mobile/src/navigation/RootNavigator.jsx:181`
- Modify: `frontend-mobile/src/__tests__/RootNavigator.test.jsx`

- [ ] **Step 1: scrivere il test che fallisce** — in `RootNavigator.test.jsx`, sostituire il test esistente `'NetInfo listener calls flushQueue only when isConnected AND isInternetReachable are both true'` con questa versione estesa (stesso corpo, più un nuovo scenario e un titolo aggiornato che riflette il comportamento corretto):

```jsx
  test('NetInfo listener calls flushQueue when isConnected is true and isInternetReachable is true or null, but not when isConnected is false or isInternetReachable is explicitly false', async () => {
    await renderNavigator();

    await waitFor(() => expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1));
    const onNetInfoChange = NetInfo.addEventListener.mock.calls[0][0];

    // Clear the best-effort flushQueue() call fired unconditionally at startup.
    flushQueue.mockClear();

    await act(async () => onNetInfoChange({ isConnected: true, isInternetReachable: false }));
    expect(flushQueue).not.toHaveBeenCalled();

    await act(async () => onNetInfoChange({ isConnected: false, isInternetReachable: true }));
    expect(flushQueue).not.toHaveBeenCalled();

    await act(async () => onNetInfoChange({ isConnected: false, isInternetReachable: false }));
    expect(flushQueue).not.toHaveBeenCalled();

    await act(async () => onNetInfoChange({ isConnected: true, isInternetReachable: true }));
    expect(flushQueue).toHaveBeenCalledTimes(1);

    // Android-specific regression guard: isInternetReachable can legitimately stay
    // `null` (not yet determined) rather than `true`/`false` more often than on iOS.
    // A strict `&&` check would silently never flush in that case even though the
    // device is connected — treat null as "try anyway", not as "not reachable".
    flushQueue.mockClear();
    await act(async () => onNetInfoChange({ isConnected: true, isInternetReachable: null }));
    expect(flushQueue).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: eseguire il test e verificare che fallisca sull'ultimo scenario**

```bash
cd frontend-mobile
npm test -- RootNavigator
```
Expected: FAIL sull'assertion `expect(flushQueue).toHaveBeenCalledTimes(1)` dopo `isInternetReachable: null` (oggi `flushQueue` non viene chiamato in quel caso).

- [ ] **Step 3: implementare il fix minimo** — in `RootNavigator.jsx`, riga 181, cambiare:
```jsx
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        flushQueue();
      }
    });
```
in:
```jsx
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      // isInternetReachable can be `null` (undetermined) on Android more often than
      // on iOS — treat null as "try anyway": if actually offline, the request fails
      // and the item stays queued (offlineQueue already handles that), so this
      // doesn't introduce a new failure mode when truly offline.
      if (state.isConnected && state.isInternetReachable !== false) {
        flushQueue();
      }
    });
```

- [ ] **Step 4: eseguire di nuovo il test e verificare che passi**

```bash
npm test -- RootNavigator
```
Expected: PASS, tutti gli scenari verdi.

- [ ] **Step 5: eseguire l'intera suite mobile** (nessuna regressione altrove)

```bash
npm test
```
Expected: tutti i test verdi.

- [ ] **Step 6: commit**

```bash
git add src/navigation/RootNavigator.jsx src/__tests__/RootNavigator.test.jsx
git commit -m "fix(mobile): tratta isInternetReachable null come raggiungibile per il flush della coda offline (Android)"
```

---

### Task 5: Rischio 6 — bottone "Apri Impostazioni" quando il permesso fotocamera è negato permanentemente

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`
- Modify: `frontend-mobile/src/__tests__/QRScannerScreen.test.jsx`

- [ ] **Step 1: scrivere il test che fallisce** — in `QRScannerScreen.test.jsx`, aggiungere un nuovo `test(...)` all'interno del blocco `describe('QRScannerScreen', ...)`, dopo il test esistente `'happy path online...'`:

```jsx
  test('permission permanently denied (canAskAgain: false) shows an "Apri Impostazioni" button that calls Linking.openSettings', async () => {
    useCameraPermissions.mockReturnValue([{ granted: false, canAskAgain: false }, jest.fn()]);
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockImplementation(() => {});

    const { getByText } = renderScreen();

    const settingsButton = getByText('Apri Impostazioni');
    fireEvent.press(settingsButton);

    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
  });
```

Questo richiede due aggiunte in cima al file di test:
1. Importare `Linking` e `fireEvent` da `react-native`/`@testing-library/react-native` — la riga esistente:
```jsx
import { render, act, waitFor } from '@testing-library/react-native';
```
diventa:
```jsx
import { render, act, waitFor, fireEvent } from '@testing-library/react-native';
```
2. Importare `Linking` da `react-native` — la riga esistente:
```jsx
import { Alert } from 'react-native';
```
diventa:
```jsx
import { Alert, Linking } from 'react-native';
```

- [ ] **Step 2: eseguire il test e verificare che fallisca**

```bash
cd frontend-mobile
npm test -- QRScannerScreen
```
Expected: FAIL — `getByText('Apri Impostazioni')` non trova nessun elemento (il bottone non esiste ancora).

- [ ] **Step 3: implementare il fix minimo** — in `QRScannerScreen.jsx`:

Aggiungere `Linking` all'import esistente (riga 2):
```jsx
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Animated, Easing, Vibration, Linking } from 'react-native';
```

Nel blocco `if (!permission.granted) { ... }` (righe 196-214), aggiungere il nuovo bottone subito dopo il bottone condizionale "Concedi permesso" esistente:
```jsx
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Permesso fotocamera negato</Text>
        <Text style={styles.text}>
          {permission.canAskAgain
            ? 'È necessario il permesso per scansionare il QR code.'
            : 'Vai in Impostazioni → Badge System → Fotocamera per abilitarla.'}
        </Text>
        {permission.canAskAgain && (
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Concedi permesso</Text>
          </TouchableOpacity>
        )}
        {!permission.canAskAgain && (
          <TouchableOpacity style={styles.button} onPress={() => Linking.openSettings()}>
            <Text style={styles.buttonText}>Apri Impostazioni</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.button, { marginTop: 12, backgroundColor: COLORS.stone }]} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Torna indietro</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }
```

- [ ] **Step 4: eseguire di nuovo il test e verificare che passi**

```bash
npm test -- QRScannerScreen
```
Expected: PASS.

- [ ] **Step 5: eseguire l'intera suite mobile**

```bash
npm test
```
Expected: tutti i test verdi (nessuna regressione sugli altri scenari di `QRScannerScreen.test.jsx`, in particolare quelli con `canAskAgain: true` o assente).

- [ ] **Step 6: commit**

```bash
git add src/screens/checkin/QRScannerScreen.jsx src/__tests__/QRScannerScreen.test.jsx
git commit -m "fix(mobile): aggiunge bottone Apri Impostazioni quando il permesso fotocamera è negato permanentemente"
```

---

### Task 6: Rischio 1 — Face ID senza fallback su device senza blocco schermo

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/FaceIDScreen.jsx`
- Create: `frontend-mobile/src/__tests__/FaceIDScreen.test.jsx`

- [ ] **Step 1: scrivere il file di test (nuovo) con il primo scenario che fallisce**

```jsx
import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC: 2 },
}));

jest.mock('../../services/authService', () => ({
  getUser: jest.fn(),
}));

const LocalAuthentication = require('expo-local-authentication');
const authService = require('../../services/authService').default || require('../../services/authService');

const FaceIDScreen = require('../screens/checkin/FaceIDScreen').default;

function renderScreen(navigationOverrides = {}) {
  const navigation = { replace: jest.fn(), reset: jest.fn(), ...navigationOverrides };
  const utils = render(<FaceIDScreen navigation={navigation} />);
  return { ...utils, navigation };
}

describe('FaceIDScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService.getUser.mockResolvedValue({ name: 'Maria Rossi', role: 'employee' });
    LocalAuthentication.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC);
    LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });
  });

  test('regression guard: device with SecurityLevel.NONE (no biometric, no PIN/pattern/password) shows a distinct blocked message, not the generic retry loop', async () => {
    LocalAuthentication.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);

    const { findByText, queryByText } = renderScreen();

    await findByText('Il tuo dispositivo non ha nessun blocco schermo configurato. Contatta il tuo responsabile.');
    expect(queryByText('Riprova')).toBeNull();
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });

  test('device with SecurityLevel.SECRET (PIN/pattern/password, no biometric) still calls authenticateAsync as today', async () => {
    LocalAuthentication.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);

    const { navigation } = renderScreen();

    await waitFor(() => expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('QRScanner'));
  });

  test('device with SecurityLevel.BIOMETRIC still calls authenticateAsync as today', async () => {
    const { navigation } = renderScreen();

    await waitFor(() => expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('QRScanner'));
  });
});
```

- [ ] **Step 2: eseguire il test e verificare che fallisca**

```bash
cd frontend-mobile
npm test -- FaceIDScreen
```
Expected: FAIL sul primo test — `getEnrolledLevelAsync` non viene mai chiamato dal codice attuale, quindi il messaggio distinto non appare mai e `authenticateAsync` viene comunque chiamato.

- [ ] **Step 3: implementare il fix minimo** — in `FaceIDScreen.jsx`:

Aggiungere lo stato `'blocked'` e la chiamata a `getEnrolledLevelAsync` prima di `authenticateAsync`. La funzione `runAuthentication` esistente:
```jsx
  const runAuthentication = useCallback(async () => {
    setStatus('authenticating');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Autenticati per il check-in',
      cancelLabel: 'Annulla',
      fallbackLabel: 'Usa passcode',
    });
    if (result.success) {
      navigation.replace('QRScanner');
    } else {
      setStatus('failed');
    }
  }, [navigation]);
```
diventa:
```jsx
  const runAuthentication = useCallback(async () => {
    setStatus('authenticating');

    const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
    if (enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
      // No biometric AND no device PIN/pattern/password configured — authenticateAsync
      // would fail every time with no possible fallback. Don't show a "Riprova" that
      // can never succeed; tell the user what's actually wrong instead.
      setStatus('blocked');
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Autenticati per il check-in',
      cancelLabel: 'Annulla',
      fallbackLabel: 'Usa passcode',
    });
    if (result.success) {
      navigation.replace('QRScanner');
    } else {
      setStatus('failed');
    }
  }, [navigation]);
```

Aggiornare lo stato iniziale del tipo (solo commento, riga 20):
```jsx
  const [status, setStatus] = useState('authenticating'); // 'authenticating' | 'failed' | 'blocked'
```

Aggiungere il messaggio distinto e nascondere il bottone "Riprova" quando bloccato. Il blocco JSX esistente:
```jsx
        {status === 'failed' && (
          <Text style={styles.errorText}>Autenticazione non riuscita. Riprova.</Text>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.authButton}
          onPress={runAuthentication}
          disabled={status === 'authenticating'}
        >
          <Text style={styles.authButtonText}>
            {status === 'authenticating' ? 'Autenticazione in corso…' : 'Riprova'}
          </Text>
        </TouchableOpacity>
      </View>
```
diventa:
```jsx
        {status === 'failed' && (
          <Text style={styles.errorText}>Autenticazione non riuscita. Riprova.</Text>
        )}
        {status === 'blocked' && (
          <Text style={styles.errorText}>
            Il tuo dispositivo non ha nessun blocco schermo configurato. Contatta il tuo responsabile.
          </Text>
        )}
      </View>

      <View style={styles.footer}>
        {status !== 'blocked' && (
          <TouchableOpacity
            style={styles.authButton}
            onPress={runAuthentication}
            disabled={status === 'authenticating'}
          >
            <Text style={styles.authButtonText}>
              {status === 'authenticating' ? 'Autenticazione in corso…' : 'Riprova'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
```

- [ ] **Step 4: eseguire di nuovo il test e verificare che passi**

```bash
npm test -- FaceIDScreen
```
Expected: PASS, tutti e 3 gli scenari verdi.

- [ ] **Step 5: eseguire l'intera suite mobile**

```bash
npm test
```
Expected: tutti i test verdi, 61 + 4 nuovi (3 `FaceIDScreen` + le modifiche a `RootNavigator`/`QRScannerScreen` già contate nei Task 4-5).

- [ ] **Step 6: commit**

```bash
git add src/screens/checkin/FaceIDScreen.jsx src/__tests__/FaceIDScreen.test.jsx
git commit -m "fix(mobile): Face ID mostra un messaggio distinto invece del loop Riprova quando il device non ha alcun blocco schermo"
```

### Gate di fine Fase 2

- [ ] **G1:** `cd frontend-mobile && npm test -- --coverage` → tutti i test verdi, nessun hang
- [ ] **G2:** `/code-review` sul diff dei Task 3-6 (focus: la logica di fallback Face ID è corretta, il fix NetInfo non introduce un caso in cui si tenta la sync anche palesemente offline in modo dannoso)

---

# FASE 3 — Maestro Android E2E (Rischi 1, 3, 5, 6 lato Maestro)

### Task 7: Setup Maestro per Android

**Files:**
- Create: `frontend-mobile/scripts/run-maestro-android.sh`

- [ ] **Step 1: verificare che Maestro riconosca l'AVD** (Maestro è già installato dalla Sessione 82)

```bash
export PATH="$PATH:$HOME/.maestro/bin:$HOME/Library/Android/sdk/platform-tools:$HOME/Library/Android/sdk/emulator"
emulator -avd Pixel_6_API_34 &
adb wait-for-device
maestro test --help
```
Expected: Maestro elenca l'help senza errori di connessione al device (il flag `--help` non richiede un device attivo, ma verifica che il CLI sia raggiungibile nel `PATH`).

- [ ] **Step 2: creare lo script di lancio**, analogo a `scripts/run-maestro.sh` (iOS) ma per Android:

```bash
#!/bin/bash
set -e

AVD_NAME="${1:-Pixel_6_API_34}"

cleanup() {
  kill $METRO_PID 2>/dev/null || true
}
trap cleanup EXIT

if ! adb devices | grep -q "device$"; then
  echo "Avvio emulatore $AVD_NAME..."
  emulator -avd "$AVD_NAME" &
  adb wait-for-device
  # Attende che il boot sia completo, non solo che adb risponda
  until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do
    sleep 2
  done
fi

npx expo start --dev-client &
METRO_PID=$!
sleep 5

maestro test maestro/
```

- [ ] **Step 3: rendere eseguibile e testare con i flow ereditati da iOS** (vedi Task 8 per gli adattamenti)

```bash
chmod +x scripts/run-maestro-android.sh
```

- [ ] **Step 4: commit**

```bash
git add scripts/run-maestro-android.sh
git commit -m "test(mobile): script di lancio Maestro per emulatore Android"
```

---

### Task 8: Adattare i 2 flow Maestro esistenti (ereditati da iOS)

**Files:**
- Verify (nessuna modifica attesa): `frontend-mobile/maestro/relaunch-requires-login.yaml`
- Verify (nessuna modifica attesa): `frontend-mobile/maestro/navigation-smoke.yaml`

- [ ] **Step 1: installare l'APK Task 2 sull'AVD `Pixel_6_API_34`** (se non già installato)

```bash
adb install frontend-mobile/build-*.apk
```

- [ ] **Step 2: eseguire `relaunch-requires-login.yaml` così com'è** (il YAML è già platform-agnostico — nessun riferimento a `bundleId` iOS-specifico, usa selettori testuali)

```bash
cd frontend-mobile
./scripts/run-maestro-android.sh Pixel_6_API_34
```
Expected: il flow `relaunch-requires-login` passa senza modifiche al file YAML. Se fallisce su un selettore specifico (es. testo che iOS unisce ma Android no, o viceversa), annotare la differenza e correggere il selettore in quel momento — non prevedibile a priori senza eseguirlo.

- [ ] **Step 3: eseguire `navigation-smoke.yaml`** allo stesso modo, verificare che tutti e 6 i tab siano raggiungibili senza crash.

- [ ] **Step 4: se sono state necessarie modifiche ai file YAML, commit**

```bash
git add maestro/relaunch-requires-login.yaml maestro/navigation-smoke.yaml
git commit -m "test(mobile): adatta i flow Maestro esistenti per l'esecuzione su emulatore Android"
```
Se nessuna modifica è stata necessaria, non fare commit vuoto — annotarlo nel report finale (Task 18).

---

### Task 9: Nuovo flow Maestro — tasto indietro hardware (Rischio 5)

**Files:**
- Create: `frontend-mobile/maestro/android-back-button.yaml`

- [ ] **Step 1: scrivere il flow**

```yaml
appId: it.dataxiom.badge
---
- launchApp:
    clearState: true
- tapOn: "Email"
- inputText: "maria@badge.local"
- tapOn: "Password"
- inputText: "maria01"
- tapOn: "Accedi"
- extendedWaitUntil:
    visible: "Badge.*"
    timeout: 15000

# Variante (a): back alla radice di Main deve uscire dall'app, non tornare a Login
- back
- assertNotVisible: "Accedi"

# Rilancio pulito per la variante (b)
- launchApp:
    clearState: false
- extendedWaitUntil:
    visible: "Badge.*"
    timeout: 15000

# Variante (b): back durante QRScanner con fotocamera attiva non deve crashare
- tapOn: "Badge.*"
- tapOn: "Scannerizza QR Code.*"
- extendedWaitUntil:
    visible: "camera-view"
    timeout: 10000
- back
- assertVisible: "Badge.*"
```

- [ ] **Step 2: eseguire e verificare**

```bash
./scripts/run-maestro-android.sh Pixel_6_API_34
```
Expected: entrambe le varianti passano. Se la variante (a) fallisce (l'app torna a `Login` invece di uscire, o viceversa il comportamento è diverso da quanto atteso), annotarlo — è esattamente il tipo di comportamento che questo task esiste per scoprire, non un errore di scrittura del flow.

- [ ] **Step 3: commit**

```bash
git add maestro/android-back-button.yaml
git commit -m "test(mobile): flow Maestro Android per il tasto indietro hardware (root Main, QRScanner attivo)"
```

---

### Task 10: Nuovo flow Maestro — permesso fotocamera negato la prima volta (Rischio 6, parte Maestro)

**Files:**
- Create: `frontend-mobile/maestro/android-camera-permission-denial.yaml`

- [ ] **Step 1: scrivere il flow**

```yaml
appId: it.dataxiom.badge
---
- launchApp:
    clearState: true
- tapOn: "Email"
- inputText: "maria@badge.local"
- tapOn: "Password"
- inputText: "maria01"
- tapOn: "Accedi"
- extendedWaitUntil:
    visible: "Badge.*"
    timeout: 15000
- tapOn: "Badge.*"
- tapOn: "Scannerizza QR Code.*"

# Il dialog di sistema Android per il permesso fotocamera appare qui.
- tapOn:
    text: "Nega|Deny|Non consentire"
    optional: true
- assertVisible: "Permesso fotocamera negato"
- assertVisible: "Concedi permesso"
```

- [ ] **Step 2: eseguire e verificare**

```bash
./scripts/run-maestro-android.sh Pixel_6_API_34
```
Expected: PASS. Il caso "negato permanentemente" (bottone "Apri Impostazioni" del Task 5) **non è testato qui** — Maestro non può forzare in modo affidabile il flag "Non chiedere più" di Android in automazione (coerente con quanto già dichiarato nel design doc); quel caso resta verificato solo dal component test del Task 5.

- [ ] **Step 3: commit**

```bash
git add maestro/android-camera-permission-denial.yaml
git commit -m "test(mobile): flow Maestro Android per il primo diniego del permesso fotocamera"
```

---

### Task 11: Nuovo flow Maestro — Face ID senza biometria enrollata (Rischio 1, parte Maestro)

**Files:**
- Create: `frontend-mobile/maestro/android-faceid-no-biometric.yaml`

- [ ] **Step 1: verificare che l'AVD non abbia un'impronta virtuale enrollata** (dovrebbe già essere così dal Task 1, Step 3 — nessuna configurazione fatta). Verificare anche che l'AVD abbia **un PIN/pattern configurato** (necessario per il primo scenario: fallback a PIN funzionante). Se non configurato, impostarlo dalle Impostazioni dell'emulatore prima di procedere: Impostazioni → Sicurezza → Blocco schermo → PIN.

- [ ] **Step 2: scrivere il flow — scenario con PIN configurato (fallback funzionante)**

```yaml
appId: it.dataxiom.badge
---
- launchApp:
    clearState: true
- tapOn: "Email"
- inputText: "maria@badge.local"
- tapOn: "Password"
- inputText: "maria01"
- tapOn: "Accedi"
- extendedWaitUntil:
    visible: "Verifica identità"
    timeout: 15000
# Il prompt di sistema Android per il PIN appare qui (nessuna impronta enrollata,
# ma un PIN è configurato — expo-local-authentication esegue automaticamente il
# fallback a device credential quando disableDeviceFallback è false, il default).
- inputText: "0000"
- pressKey: Enter
- extendedWaitUntil:
    visible: "Scannerizza QR Code.*"
    timeout: 10000
```
(Sostituire `"0000"` con il PIN reale configurato nel Task 11 Step 1.)

- [ ] **Step 3: eseguire e verificare**

```bash
./scripts/run-maestro-android.sh Pixel_6_API_34
```
Expected: PASS — conferma end-to-end che il fallback PIN implementato nel Task 6 funziona davvero sul runtime Android, non solo nel component test mockato.

- [ ] **Step 4: rimuovere temporaneamente il PIN dall'AVD e ripetere il test manualmente** (scenario `SecurityLevel.NONE`, non automatizzabile in modo pulito con Maestro perché richiede riconfigurare le impostazioni di sistema tra un run e l'altro) — Impostazioni → Sicurezza → Blocco schermo → Nessuno, poi ripetere manualmente il login + tap su "Badge" fino a `FaceIDScreen`, verificare a occhio che appaia "Il tuo dispositivo non ha nessun blocco schermo configurato. Contatta il tuo responsabile." e che non compaia alcun bottone "Riprova". Ripristinare il PIN al termine.

- [ ] **Step 5: commit**

```bash
git add maestro/android-faceid-no-biometric.yaml
git commit -m "test(mobile): flow Maestro Android per Face ID con fallback PIN (nessuna biometria enrollata)"
```

---

### Task 12: Nuovo flow Maestro — date picker (Rischio 3)

**Files:**
- Create: `frontend-mobile/maestro/android-date-picker.yaml`

- [ ] **Step 1: scrivere il flow**

```yaml
appId: it.dataxiom.badge
---
- launchApp:
    clearState: true
- tapOn: "Email"
- inputText: "maria@badge.local"
- tapOn: "Password"
- inputText: "maria01"
- tapOn: "Accedi"
- extendedWaitUntil:
    visible: "Badge.*"
    timeout: 15000
- tapOn: "Ferie.*"
- tapOn:
    id: ".*Data inizio.*"
- assertVisible: "Fine"
- tapOn: "Fine"
- assertNotVisible:
    id: ".*picker.*"
```

- [ ] **Step 2: eseguire e verificare visivamente** (oltre alle assertion automatiche, osservare a occhio l'esecuzione: lo spinner è leggibile, il locale `it-IT` è corretto, le dimensioni non sono tagliate)

```bash
./scripts/run-maestro-android.sh Pixel_6_API_34
```
Expected: PASS + nessun problema visivo osservato. Se emerge un problema reale (spinner illeggibile, layout rotto), annotarlo e valutare se serve un fix di stile prima di chiudere il piano (non presunto a priori, come da design doc).

- [ ] **Step 3: ripetere lo stesso flow per `IllnessReportScreen`** (stesso pattern, tab "Malattia" invece di "Ferie").

- [ ] **Step 4: commit**

```bash
git add maestro/android-date-picker.yaml
git commit -m "test(mobile): flow Maestro Android per il date picker in Ferie/Malattia"
```

### Gate di fine Fase 3

- [ ] **G3:** tutti i flow Maestro (2 ereditati + 4 nuovi) verdi su `Pixel_6_API_34`, eseguiti almeno 2 volte consecutive per escludere flakiness (stessa disciplina della Sessione 82)

---

# FASE 4 — Test aggiuntivi anti-gap "nessun device fisico" (A-E)

### Task 13: Ripetere la suite Maestro sull'AVD di fascia bassa (Test A)

**Files:** nessuno (solo esecuzione, nessun file di repo modificato salvo eventuali fix emersi)

- [ ] **Step 1: installare l'APK sull'AVD `Android_Go_LowSpec`**

```bash
emulator -avd Android_Go_LowSpec &
adb wait-for-device
adb install frontend-mobile/build-*.apk
```

- [ ] **Step 2: eseguire l'intera suite Maestro su questo AVD**

```bash
cd frontend-mobile
./scripts/run-maestro-android.sh Android_Go_LowSpec
```
Expected: stessi risultati dell'AVD di fascia alta. Annotare qualunque differenza (lentezza percepita, layout diverso, crash) — è esattamente ciò che questo test esiste per scoprire.

- [ ] **Step 3: se emergono problemi reali, aprire un fix mirato** (non presunto a priori — dipende da cosa emerge). Se nessun problema emerge, nessun commit necessario oltre all'annotazione nel report finale (Task 18).

---

### Task 14: Fotocamera reale via Virtual Scene (Test B)

**Files:** nessuno (solo verifica manuale)

- [ ] **Step 1: generare un'immagine PNG con un QR code valido** — usare qualunque generatore QR con il contenuto `badge://checkin?site_id=<uuid-sito-reale>&client_id=<uuid-client-reale>` (usare un sito/cliente demo esistente in ambiente di sviluppo, non un valore inventato — verificare con `SELECT id FROM sites LIMIT 1;` sul database locale se serve un UUID reale).

- [ ] **Step 2: configurare la Virtual Scene camera dell'emulatore** — nell'emulatore Android Studio, Extended Controls (icona "..." nella barra laterale) → Camera → selezionare "VirtualScene" come backend della fotocamera posteriore, poi caricare l'immagine PNG generata come "custom image" nella scena virtuale.

- [ ] **Step 3: eseguire il flusso di check-in reale** (non Maestro — questo test richiede l'interazione manuale con Extended Controls, non ripetibile in automazione) — avviare l'app sull'AVD, login, tab "Badge", "Scannerizza QR Code", inquadrare l'immagine caricata nella scena virtuale.

Expected: `expo-camera` rileva il QR code e triggera `onBarcodeScanned` — l'app procede al check-in reale (non un evento simulato via test, ma la vera pipeline di scansione nativa Android). Verificare che il check-in vada a buon fine (schermata di successo).

- [ ] **Step 4: annotare l'esito nel report finale** (Task 18) — non è un test automatizzato, quindi non produce un commit, ma è una prova concreta che la libreria di scansione funziona sul motore camera Android nativo.

---

### Task 15: Profiling prestazionale delle schermate animate (Test C)

**Files:** nessuno (solo verifica manuale con tooling)

- [ ] **Step 1: avviare il profiling** — Android Studio → View → Tool Windows → Profiler → selezionare il processo `it.dataxiom.badge` in esecuzione sull'AVD `Android_Go_LowSpec` (fascia bassa, dove il jank è più probabile) → avviare una sessione CPU + Memory.

- [ ] **Step 2: navigare a `QRScannerScreen`** (scan-line loop `Animated`) e lasciarla attiva per almeno 30 secondi mentre il profiler registra.

- [ ] **Step 3: navigare a `FaceIDScreen`** (pulse ring + arc rotation) e ripetere.

- [ ] **Step 4: esaminare i grafici** — cercare: CPU costantemente alta senza motivo (>50% sostenuto durante un'animazione idle), crescita di memoria non recuperata dopo essere usciti dalla schermata (indicativo di leak, es. un `Animated.loop` non fermato — verificare che i `return () => loop.stop()` esistenti in entrambi i file funzionino davvero, non solo che siano scritti).

- [ ] **Step 5: annotare l'esito nel report finale** (Task 18) — se emerge un problema reale (jank visibile, leak di memoria confermato), aprire un fix mirato prima di chiudere il piano.

---

### Task 16: Simulazione backgrounding + Doze mode per la coda offline (Test D)

**Files:** nessuno (solo verifica manuale)

- [ ] **Step 1: mettere in coda un check-in offline** — sull'AVD, disattivare la rete (Extended Controls → Cellular → Data status: Denied, oppure `adb shell svc wifi disable && adb shell svc data disable`), effettuare un check-in dall'app (finisce in coda, non inviato).

- [ ] **Step 2: mandare l'app in background**

```bash
adb shell input keyevent KEYCODE_HOME
```

- [ ] **Step 3: forzare Doze mode**

```bash
adb shell dumpsys deviceidle force-idle
```
Expected: nessun errore di comando.

- [ ] **Step 4: riattivare la rete e uscire da Doze mode**

```bash
adb shell svc wifi enable
adb shell svc data enable
adb shell dumpsys deviceidle unforce
```

- [ ] **Step 5: riportare l'app in foreground**

```bash
adb shell am start -n it.dataxiom.badge/.MainActivity
```

- [ ] **Step 6: verificare che il check-in in coda venga sincronizzato** — controllare nella schermata "Presenze" che il check-in precedentemente in coda risulti ora inviato (non più marcato come "in attesa"/pending).

Expected: la sincronizzazione avviene, confermando che il listener `AppState.addEventListener('change', ...)` in `RootNavigator.jsx` scatta anche dopo un ciclo di Doze mode simulato, non solo un semplice background/foreground pulito.

- [ ] **Step 7: annotare l'esito nel report finale** (Task 18) — se la sincronizzazione non avviene, questo è un problema reale da investigare (non presunto a priori quale sia la causa).

---

### Task 17: Benchmark cold-start e dimensione APK (Test E)

**Files:** nessuno (solo misurazione)

- [ ] **Step 1: forzare la chiusura dell'app** (per garantire un cold start reale, non un resume da processo già in memoria)

```bash
adb shell am force-stop it.dataxiom.badge
```

- [ ] **Step 2: misurare il tempo di avvio a freddo**

```bash
adb shell am start -W it.dataxiom.badge/.MainActivity
```
Expected: l'output include righe `TotalTime:` e `WaitTime:` in millisecondi — annotare il valore.

- [ ] **Step 3: misurare la dimensione dell'APK**

```bash
ls -lh frontend-mobile/build-*.apk
```

- [ ] **Step 4: annotare entrambi i numeri nel report finale** (Task 18) come baseline oggettiva — non un pass/fail, ma un riferimento numerico per confrontare build future e per stimare (in assenza di un device fisico da cronometrare) l'esperienza su hardware economico reale.

### Gate di fine Fase 4

- [ ] **G4:** tutti i 5 test aggiuntivi (A-E) eseguiti almeno una volta, con esito annotato (positivo o negativo) — nessuno lasciato "da fare dopo"

---

# FASE 5 — Wrap-up documentazione

### Task 18: Aggiornare `TASKS.md`, `PROJECT_DECISIONS.md`, `HANDOFF.md`

**Files:**
- Modify: `TASKS.md`
- Modify: `PROJECT_DECISIONS.md`
- Modify: `HANDOFF.md`

- [ ] **Step 1: `TASKS.md`** — aggiornare la riga esistente sul backlog MVP Hardening che riguarda Android (se presente) o aggiungerne una nuova, riportando: profilo `development-android` funzionante, i 4 fix di codice (Rischi 1/2/4/6) con i loro commit, l'esito di ciascuno dei 5 test aggiuntivi A-E (Task 13-17), e i rischi residui dichiarati nel design doc (skin OEM, sensori biometrici reali, nessun device fisico) come non risolti da questo piano.

- [ ] **Step 2: `PROJECT_DECISIONS.md`** — nuova sezione con la cronologia completa: la decisione di prodotto sul fallback PIN per Face ID (collegata al posizionamento commerciale), i 7 rischi e come sono stati mitigati, eventuali problemi reali emersi durante l'esecuzione (Task 8 adattamenti Maestro, eventuali fix da Task 13/15/16 se emersi).

- [ ] **Step 3: `HANDOFF.md`** — riscrivere per riflettere lo stato Android: comandi per rilanciare Maestro Android (`./scripts/run-maestro-android.sh <nome-avd>`), nomi dei due AVD creati, nota esplicita che Play Store/Internal Testing restano fuori perimetro finché non c'è un cliente Android reale.

- [ ] **Step 4: commit**

```bash
git add TASKS.md PROJECT_DECISIONS.md HANDOFF.md
git commit -m "docs: chiude il piano di validazione Android — esito dei 7 rischi + 5 test aggiuntivi"
```

---

## Verification (end-to-end)

- `cd frontend-mobile && npm test -- --coverage` → tutti i test verdi (esistenti + i nuovi delle Task 4-6), nessuna regressione
- `eas build --profile development-android --platform android --local` → build riuscita, APK installabile su entrambi gli AVD
- Maestro: `./scripts/run-maestro-android.sh Pixel_6_API_34` e `./scripts/run-maestro-android.sh Android_Go_LowSpec` → tutti e 6 i flow verdi su entrambi gli AVD, eseguiti almeno 2 volte consecutive
- Tutti e 5 i test aggiuntivi (A-E) eseguiti con esito annotato
- `TASKS.md`/`PROJECT_DECISIONS.md`/`HANDOFF.md` aggiornati e committati

## Fuori perimetro (esplicito, ereditato dal design doc)

- Google Play Store / Internal Testing — nessun account Developer, rimandato al primo cliente reale con dipendenti Android
- CI Android — solo locale per ora, per coerenza con la decisione già presa su iOS
- Test su device fisico Android — nessuno disponibile; i 5 test aggiuntivi (Fase 4) riducono ma non eliminano questo gap, come dichiarato esplicitamente nel design doc
- Riattivazione della geofence GPS (`expo-location`) — rimossa come dipendenza inutilizzata (Task 3), non nel perimetro di questo piano reintrodurla
