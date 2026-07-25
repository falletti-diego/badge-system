# React Native Test Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Su approvazione**: salvare questo piano in `docs/superpowers/plans/2026-07-25-mobile-test-infrastructure.md` e committare.

**Goal:** colmare il gap di test coverage sul mobile che ha lasciato passare 8 bug reali in due sessioni di test manuale su device (nessuno trovato da code review o dai 43 test Jest esistenti, tutti pure-logic e senza rendering RN). Aggiungere due livelli: (1) component test (`jest-expo` + `@testing-library/react-native`) sui 6 file dove sono stati trovati i bug, in CI bloccante; (2) 2 flow Maestro E2E locali sul simulatore iOS di questa macchina, come rete di sicurezza aggiuntiva per scenari che il livello component-test non può esercitare (kill+riapertura reale del processo app).

## Contesto

Nella Session 81 (25 luglio 2026), testando manualmente l'Offline Mode su un iPhone reale, sono stati trovati e fixati 5 bug + implementata 1 feature di sicurezza (login forzato dopo kill app); sommati ai 3 bug della Session 80, fanno **8 bug reali in due sessioni consecutive, zero intercettati da automazione**. Il progetto ha oggi 610+ test backend e 239+ test frontend-web, ma solo 43 test mobile — tutti su funzioni pure (`dateUtils`, `presenceUtils`, `offlineQueue`), **zero test che montano/renderizzano un componente React Native**. La config Jest attuale di `frontend-mobile` (`testEnvironment: "node"`, transform solo `@babel/preset-env`) non potrebbe nemmeno parsare JSX. Questo piano introduce l'infrastruttura mancante, scoperta e concordata con l'utente (grilling 25 luglio) via 5 decisioni: (1) component test prima di E2E; (2) perimetro iniziale = solo i 6 file coinvolti nei bug di oggi, non tutto il mobile; (3) Maestro pianificato come secondo livello sul simulatore iOS locale di questa macchina (verificato disponibile: Xcode + iPhone 17 Pro/Pro Max/17e via `xcrun simctl list devices`, mai sfruttato finora); (4) da implementare subito, in parallelo a Task B6; (5) i component test devono girare in CI (GitHub Actions) come job bloccante, mentre Maestro resta **solo locale** per ora (GitHub Actions ubuntu-latest non ha un simulatore iOS; integrarlo in Codemagic è deliberatamente fuori perimetro di questo piano — vedi "Fuori perimetro").

**Perché iOS-only, nessun emulatore Android** (domanda esplicita dell'utente): confermato per evidenza diretta nel repo (`PROJECT_DECISIONS.md:1902`, Session 61) che il mobile è distribuito **solo** via TestFlight — nessuna build Android è mai stata prodotta, nessuna sottomissione Play Store è mai avvenuta (il file `google-play-service-account.json` richiesto dal profilo `production` di `eas.json` non esiste nel repo), nessun impiegato reale usa Android. Investire in un emulatore Android oggi aggiungerebbe solo costo/complessità di setup senza copertura aggiuntiva reale: i component test `jest-expo`/RNTL sono comunque agnostici alla piattaforma (girano in Node, nessun rendering nativo reale), quindi validano già la stessa classe di bug (scoping, cache, hook di focus) indipendentemente da iOS/Android. Se in futuro un cliente reale richiedesse Android, la decisione andrebbe rivista — ma oggi sarebbe sforzo speso su una piattaforma a zero utilizzo reale, contro l'istruzione esplicita dell'utente di minimizzare il rischio con lo sforzo minimo sufficiente.

**Tech stack:** `jest-expo` (preset Jest ufficiale Expo SDK 54), `@testing-library/react-native` v14 (compatibile React 19 nativamente, nessun conflitto di peer-dep), `babel-preset-expo` (nuova dipendenza esplicita — oggi l'app si builda solo grazie a un fallback interno non documentato di Expo/jest-expo). Zero impatto su backend/frontend-web.

---

# FASE 1 — Component test infrastructure (`jest-expo` + RNTL)

### Task 1: Dipendenze e configurazione base

**Files:**
- Modify: `frontend-mobile/package.json`
- Create: `frontend-mobile/babel.config.js`
- Create: `frontend-mobile/jest.setup.js`

- [ ] **Step 1: aggiornare `package.json`**

Rimuovere da `devDependencies`: `@babel/preset-env`, `babel-jest` (arrivano transitivamente via `jest-expo`/`babel-preset-expo`, tenerli entrambi rischia un conflitto di major).

Aggiungere:
```json
"jest-expo": "~54.0.0",
"@testing-library/react-native": "^14.0.1",
"babel-preset-expo": "~54.0.11"
```
Non serve `--legacy-peer-deps`: `@testing-library/react-native@14` dichiara `react: >=19.0.0` come peer, già soddisfatto da `react@19.1.0` presente nel progetto. Non aggiungere `@testing-library/jest-native` — deprecato, i suoi matcher sono nativi in RNTL v12.4+.

Sostituire l'intero blocco `"jest"` con:
```json
"jest": {
  "preset": "jest-expo",
  "setupFilesAfterEnv": ["<rootDir>/jest.setup.js"],
  "testMatch": ["**/src/__tests__/**/*.test.{js,jsx}"]
}
```

- [ ] **Step 2: creare `frontend-mobile/babel.config.js`** (file nuovo — non esiste oggi, verificato)
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
```
Questo non è solo per i test: oggi Metro builda l'app solo grazie a un fallback interno di Expo non pensato per essere una API pubblica — aggiungere questo file rende esplicito e robusto anche il build reale, non solo i test.

- [ ] **Step 3: creare `frontend-mobile/jest.setup.js`**
```js
// react-native-safe-area-context ships il proprio mock ufficiale — usarlo
// invece di stub scritti a mano per SafeAreaView/useSafeAreaInsets.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock')
);

// @expo/vector-icons non è risolvibile dal resolver Node di Jest — esiste
// solo annidato in node_modules/expo/node_modules/@expo/vector-icons
// (Metro lo trova col proprio resolver, Jest no). virtual:true è necessario
// perché Jest non può risolvere un path reale da "shadoware". Nei 6 file
// sotto test viene usato solo Ionicons (in RootNavigator.jsx).
jest.mock(
  '@expo/vector-icons',
  () => {
    const { Text } = require('react-native');
    const IconStub = (props) => require('react').createElement(Text, props, props.name ?? '');
    return { Ionicons: IconStub, MaterialIcons: IconStub, Feather: IconStub };
  },
  { virtual: true }
);
```
Niente `@testing-library/jest-native/extend-expect`: RNTL v14 registra già i matcher e l'`afterEach(cleanup)` automaticamente al `require()`.

- [ ] **Step 4: installare e rigenerare il lockfile** — `cd frontend-mobile && npm install` (rigenera `package-lock.json`, necessario perché il job CI userà `npm ci`, che fallisce se il lockfile non è coerente con `package.json`)

- [ ] **Step 5: verificare che i 3 test esistenti restino verdi con la nuova config, PRIMA di aggiungere qualunque test nuovo** — `npm test` → 43/43 invariati. Se qualcosa rompe qui, non procedere oltre finché non è risolto (isola il rischio di migrazione config da quello dei test nuovi).

- [ ] **Step 6: commit** — `git commit -m "chore(mobile): jest-expo + RNTL infrastructure — babel.config.js, jest.setup.js"`

### Task 2: Component test — `QRScannerScreen.jsx` (TDD)

**Files:**
- Create: `frontend-mobile/src/__tests__/QRScannerScreen.test.jsx`

Mock per file: `expo-camera` (`CameraView` come componente stub che espone `onBarcodeScanned` invocabile dal test, `useCameraPermissions`), `expo-crypto`, `../../services/apiClient`, `../../services/authService`, `../../services/offlineQueue` (`enqueueCheckin`), `react-native`'s `Alert` (via `jest.spyOn(Alert, 'alert')`). `navigation` come prop mock (`{ replace: jest.fn(), goBack: jest.fn() }`).

Scenari da coprire (ognuno è la regression guard diretta di un bug reale trovato in Session 80):
- [ ] QR valido, `apiClient.post` fallisce con errore di rete (`isAxiosError: true`, nessun `.response`) → `enqueueCheckin` viene chiamato con un payload che contiene `site_id` **corretto** (non `undefined`) → `navigation.replace('Success', { pending: true, siteId })` con lo `siteId` giusto. **Questa è la regression guard diretta dei bug `payload`/`siteId` fuori scope** (Session 80, commit `3b00882`/`1f6c63e`): se qualcuno reintroducesse `const payload`/`const siteId` dentro il `try{}`, questo test fallirebbe con un `ReferenceError` catturato o un valore `undefined`, non silenziosamente.
- [ ] QR senza `site_id`/`client_id` nella query string → errore di validazione mostrato, `enqueueCheckin` **non** chiamato (non deve mai finire in coda un errore client-side)
- [ ] `authService.getUser()` risolve senza `employee_id` → stesso comportamento (validazione, non coda)
- [ ] Errore applicativo genuino (4xx con `.response`) → Alert con messaggio del server, `enqueueCheckin` **non** chiamato
- [ ] Happy path online → `apiClient.post` chiamato, naviga a `Success` senza `pending`

- [ ] **Run → tutti verdi**, poi commit.

### Task 3: Component test — `MyPresencesScreen.jsx` (TDD)

**Files:**
- Create: `frontend-mobile/src/__tests__/MyPresencesScreen.test.jsx`

Mock: `@react-native-async-storage/async-storage`, `../../services/apiClient` (`.get`). **Non mockare** `@react-navigation/native` — serve il vero `useFocusEffect` (stesso motivo di Task 4 sotto).

Scenari (regression guard del bug Date/JSON di Session 80, commit `eedf9e1`):
- [ ] Fetch riuscito → renderizza le entries, scrive su AsyncStorage
- [ ] Errore di rete (`!err.response`) con cache corrispondente (`filterIndex` uguale) → mostra il banner "Sei offline", **e soprattutto non crasha** renderizzando `firstIn`/`lastOut` — verificare che l'orario sia effettivamente visibile a schermo (prova diretta che il revive `new Date(...)` funziona, non solo che non lanci un'eccezione)
- [ ] Errore di rete senza cache corrispondente → schermata di errore classica con "Riprova"

- [ ] **Run → tutti verdi**, poi commit.

### Task 4: Component test — `MyScheduleScreen.jsx` (TDD)

**Files:**
- Create: `frontend-mobile/src/__tests__/MyScheduleScreen.test.jsx`

Questo è il file con lo scenario tecnicamente più delicato: provare che un **refocus** del tab (non solo il mount iniziale) rifà la fetch — è la regression guard diretta del bug `useEffect([month,year])` → `useFocusEffect` (Session 81, commit `39b7676`). Va montato dentro un vero `NavigationContainer` + `createNativeStackNavigator` a due schermate, pilotato con un `navigationRef` reale (stesso pattern già in uso in produzione, `src/utils/navigationRef.js`), per far scattare `useFocusEffect` per davvero — non è simulabile mockando `@react-navigation/native`.

Codice di riferimento completo (adattare header/mocks al pattern del progetto):
```jsx
import React from 'react';
import { View, Text } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock('../services/apiClient', () => ({ get: jest.fn() }));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const apiClient = require('../services/apiClient').default || require('../services/apiClient');
const { STORAGE_KEYS } = require('../config/endpoints');
const MyScheduleScreen = require('../screens/schedule/MyScheduleScreen').default;

function renderInNavigator() {
  const navRef = createNavigationContainerRef();
  const Stack = createNativeStackNavigator();
  render(
    <NavigationContainer ref={navRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="Schedule" component={MyScheduleScreen} />
        <Stack.Screen name="Other">{() => <View><Text>Other screen</Text></View>}</Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
  return navRef;
}

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.getItem.mockResolvedValue(null);
});

test('refocusing the tab (no month/year change) re-invokes the fetch', async () => {
  apiClient.get.mockResolvedValue({ data: { data: { shifts_data: {} } } });
  const navRef = renderInNavigator();
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

  await act(async () => { navRef.current.navigate('Other'); });
  await waitFor(() => expect(screen.getByText('Other screen')).toBeOnTheScreen());

  await act(async () => { navRef.current.navigate('Schedule'); });
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
});
```

Scenari completi da coprire:
- [ ] Fetch riuscito → renderizza i turni, scrive su AsyncStorage (`STORAGE_KEYS.CACHE_SHIFTS`)
- [ ] Errore di rete con cache dello stesso `month`/`year` → banner "Sei offline"
- [ ] **Refocus senza cambio mese/anno → seconda `apiClient.get` chiamata** (codice sopra — questo è il test che sarebbe fallito prima del fix di oggi)

- [ ] **Run → tutti verdi**, poi commit.

### Task 5: Component test — `LoginScreen.jsx` (TDD)

**Files:**
- Create: `frontend-mobile/src/__tests__/LoginScreen.test.jsx`

Mock: `../../services/authService` (`.login`), `../../services/offlineQueue` (`flushQueue`), `react-native`'s `Alert`. `navigation` prop mock.

Scenari (il terzo copre la regression guard del bug "sync non scattava dopo re-login", Session 81, commit `9397354`):
- [ ] Email o password vuoti → `Alert.alert`, `authService.login` **non** chiamato
- [ ] Login riuscito → `authService.login` chiamato con email trimmata, **`flushQueue()` chiamato**, poi `navigation.navigate('Main')`
- [ ] Login fallito → `Alert.alert('Accesso negato', ...)` col messaggio giusto, `loading` torna `false`

- [ ] **Run → tutti verdi**, poi commit.

### Task 6: Component test — `RootNavigator.jsx` (solo mount effect + listener)

**Files:**
- Create: `frontend-mobile/src/__tests__/RootNavigator.test.jsx`

`RootNavigator` importa transitivamente 11 schermate — per tenere il test mirato, mockare **tutte** le schermate importate a stub banali (`jest.mock('../screens/checkin/QRScannerScreen', () => () => null)` ecc.) così il test esercita solo la logica di `RootNavigator` stesso (effetto di mount, listener NetInfo/AppState), non ogni schermata a valle. Mock aggiuntivi: `@react-native-async-storage/async-storage` (`.multiRemove`, `.getItem`), `@react-native-community/netinfo` (`.addEventListener`), `react-native`'s `AppState` (`.addEventListener`), `../services/offlineQueue` (`flushQueue`).

Scenari (il primo è la regression guard diretta della feature "login sempre richiesto dopo kill", Session 81, commit `6c1c60c`):
- [ ] Al mount, `AsyncStorage.multiRemove` viene chiamato con **esattamente** `[AUTH_TOKEN, REFRESH_TOKEN, USER_DATA, CACHE_SHIFTS, CACHE_PRESENCES]` (e **non** `OFFLINE_QUEUE`) **anche quando `AsyncStorage.getItem(AUTH_TOKEN)` risolverebbe un token esistente** — prova diretta che non esiste più alcun percorso di ripristino sessione
- [ ] Il listener `NetInfo.addEventListener` chiama `flushQueue()` solo quando `state.isConnected && state.isInternetReachable` sono entrambi veri
- [ ] Il listener `AppState` chiama `flushQueue()` solo quando `nextState === 'active'`

- [ ] **Run → tutti verdi**, poi commit.

### Task 7: CI — job `mobile` bloccante

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1:** aggiungere un nuovo job (oggi non esiste alcun job frontend-web/mobile in questo file — solo `backend` e `security-check`), stesso stile del job `backend` esistente:
```yaml
  mobile:
    name: Mobile - Test
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'frontend-mobile/package-lock.json'

      - name: Install mobile dependencies
        working-directory: ./frontend-mobile
        run: npm ci

      - name: Run mobile tests
        working-directory: ./frontend-mobile
        run: npm test -- --coverage

      - name: Upload coverage reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: mobile-coverage
          path: frontend-mobile/coverage
```
`timeout-minutes: 15` per lo stesso motivo per cui il job `backend` ce l'ha (lezione hang Jest, Session 76c).

- [ ] **Step 2: push e verificare che il job compaia e passi** — `gh run list --workflow=ci.yml --limit 1`, poi `gh run view <id>` per il job `mobile`

- [ ] **Step 3: rendere il job bloccante** — Settings → Branches → protezione `main` → "Require status checks to pass" → selezionare "Mobile - Test" (azione manuale su GitHub, non esprimibile dentro `ci.yml`; segnalare esplicitamente all'utente se non ha accesso admin per farlo lui stesso)

- [ ] **Step 4: commit** — `git commit -m "ci(mobile): nuovo job Jest bloccante per i component test RN"`

### Gate di fine Fase 1

- [ ] **G1:** `cd frontend-mobile && npm test -- --coverage` → tutti i test verdi (43 esistenti + i nuovi delle Task 2-6), nessun hang
- [ ] **G2:** `/code-review` sul diff (focus: mock corretti vs comportamento reale, nessun falso positivo che nasconderebbe una regressione reale)
- [ ] **G3:** CI verde su un push reale (non solo locale)

---

# FASE 2 — Maestro E2E locale (simulatore iOS)

**Perimetro esplicito**: il simulatore iOS **non ha fotocamera reale** — non è possibile simulare uno scan QR con Maestro su questo simulatore senza aggiungere un bypass/deep-link di debug all'app (fuori perimetro di questo piano, va deciso a parte se serve). I flow Maestro coprono quindi solo scenari che non richiedono la fotocamera: navigazione tra tab e il comportamento di sessione dopo un kill reale del processo — cosa che nessun component test RNTL può verificare (RNTL gira in un unico processo JS, non simula mai un vero kill+cold-start con AsyncStorage persistito su disco reale del simulatore).

### Task 8: Setup Maestro + build dev client per simulatore

**Files:**
- Modify: `frontend-mobile/eas.json` (nuovo profilo build)
- Create: `frontend-mobile/maestro/` (directory)
- Create: `frontend-mobile/scripts/run-maestro.sh`

- [ ] **Step 1: installare Maestro CLI sulla macchina** — `curl -Ls "https://get.maestro.mobile.dev" | bash` (una tantum, non versionato nel repo)

- [ ] **Step 2: aggiungere un profilo build EAS per il simulatore** in `eas.json` (oggi il profilo `development` non specifica `ios.simulator`, e `preview` lo forza esplicitamente a `false` — nessun profilo esistente produce oggi un build installabile su simulatore):
```json
"development-simulator": {
  "extends": "development",
  "ios": { "simulator": true }
}
```

- [ ] **Step 3: build locale del dev client per simulatore** (una tantum, non consuma minuti EAS cloud) — `cd frontend-mobile && eas build --profile development-simulator --platform ios --local`, poi installarlo: `xcrun simctl install booted <path-.app-generato>`

- [ ] **Step 4: creare `frontend-mobile/scripts/run-maestro.sh`** — script che: boota il simulatore (`xcrun simctl boot "iPhone 17 Pro"` se non già avviato), avvia Metro in dev-client mode (`npx expo start --dev-client`) in background, attende che sia pronto, lancia `maestro test frontend-mobile/maestro/`, poi ripulisce il processo Metro in background.

- [ ] **Step 5: commit** (eas.json + script; NON committare il `.app` buildato)

### Task 9: Flow — login richiesto dopo kill dell'app

**Files:**
- Create: `frontend-mobile/maestro/relaunch-requires-login.yaml`

- [ ] Scrivere il flow: `launchApp` (clearState: true, prima esecuzione pulita) → login con `maria@badge.local`/`maria01` → assert che la schermata Home/CheckIn sia visibile → `stopApp` (kill reale del processo) → `launchApp` (clearState: **false**, così AsyncStorage resta sul disco del simulatore come farebbe un kill reale) → **assert che la schermata Login sia visibile, non la Home** — questa è la prova end-to-end (non solo a livello di componente isolato) della feature implementata in Session 81.
- [ ] **Eseguire e verificare** — `./frontend-mobile/scripts/run-maestro.sh` (o `maestro test` diretto se Metro è già in esecuzione) → flow verde

### Task 10: Flow — smoke test navigazione tab

**Files:**
- Create: `frontend-mobile/maestro/navigation-smoke.yaml`

- [ ] Scrivere il flow: login → per ciascuno dei 6 tab (Badge, Ferie/Approvazioni, Malattia, Turni, Presenze, Profilo) tap sul tab e assert che un elemento distintivo di quella schermata sia visibile (crash-free smoke test, non asserzioni approfondite sul contenuto — quello è compito dei component test)
- [ ] **Eseguire e verificare** → flow verde

### Gate di fine Fase 2

- [ ] **G4:** entrambi i flow Maestro verdi sul simulatore, eseguiti dall'utente o dal coordinatore con accesso alla macchina
- [ ] **G5:** aggiornare `TASKS.md`/`PROJECT_DECISIONS.md`/`HANDOFF.md` con l'esito, includendo l'istruzione per l'utente su come rilanciare i flow in futuro (`./frontend-mobile/scripts/run-maestro.sh`)

---

## Verification (end-to-end)

- `cd frontend-mobile && npm test -- --coverage` → 43 test esistenti + i nuovi delle Task 2-6, tutti verdi, nessuna regressione
- CI: push su un branch/PR → job "Mobile - Test" compare e passa in `gh run list`
- Maestro: `./frontend-mobile/scripts/run-maestro.sh` → entrambi i flow verdi, incluso il flow di Task 9 che prova end-to-end (non a livello di componente isolato) che il kill dell'app forza sempre un nuovo login
- Regola CLAUDE.md: dopo la Task 1 (migrazione config Jest), ri-verificare che i 43 test pre-esistenti passino PRIMA di aggiungere test nuovi — isola il rischio di migrazione da quello dei test nuovi

## Fuori perimetro (esplicito)

- **Emulatore Android**: deciso di non implementarlo — nessuna evidenza di utilizzo Android reale nel progetto (vedi Contesto sopra), i component test sono comunque platform-agnostic. Da rivalutare solo se un cliente reale richiede Android.
- **Maestro in CI** (Codemagic o GitHub Actions macOS runner): deliberatamente rimandato — l'utente ha scelto "solo locale per ora" per non sovra-investire in automazione CI su un tool appena introdotto. Può diventare un piano futuro separato se Maestro dimostra valore nell'uso locale.
- **Scan QR simulato via Maestro**: il simulatore iOS non ha fotocamera reale; servirebbe un bypass/deep-link di debug nell'app, deciso esplicitamente fuori perimetro qui.
- **Estensione dei component test ad altre schermate mobile** (oltre ai 6 file coinvolti nei bug di oggi): perimetro deliberatamente ristretto per ROI immediato — un'estensione futura è un piano separato.
- **Detox**: valutato in fase di ricerca, scartato per questo progetto — più frizione di setup con Expo managed workflow rispetto a Maestro, nessun vantaggio chiaro per il perimetro scelto (2 flow semplici, non flussi complessi che beneficerebbero della sincronizzazione gray-box di Detox).
