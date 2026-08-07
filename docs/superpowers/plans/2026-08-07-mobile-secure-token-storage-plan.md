# Mobile Secure Token Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere il Finding #1 (`findings2agosto2016.md`, HIGH, CONFIRMED) spostando access token, refresh token e oggetto utente da `AsyncStorage` (chiaro) a `expo-secure-store` (cifrato via Keychain/Keystore), più due migliorie di difesa in profondità concordate in brainstorming (scrubbing Sentry, gestione esplicita degli errori di storage).

**Architecture:** Nuovo modulo `secureAuthStorage.js`, unico punto di accesso ai 3 dati sensibili, usato dai 4 file che oggi toccano `AsyncStorage` per quei dati (`authService.js`, `apiClient.js`, `RootNavigator.jsx`, `ChangePasswordScreen.jsx`). Nessuna migrazione automatica dei dati esistenti — gli utenti già loggati rifanno login al primo avvio della nuova build (il cold-start wipe già esistente in `RootNavigator` ripulisce anche i residui in chiaro della vecchia versione). Cache/preferenze non sensibili restano in `AsyncStorage`.

**Tech Stack:** React Native / Expo SDK 54, `expo-secure-store` (nuova dipendenza nativa), Jest + `jest-expo` + React Native Testing Library.

**Spec di riferimento:** `docs/superpowers/specs/2026-08-07-mobile-secure-token-storage-design.md`

---

## File Structure (riepilogo)

**Nuovi:**
- `frontend-mobile/src/services/secureAuthStorage.js` — modulo storage cifrato (Task 2)
- `frontend-mobile/src/__tests__/secureAuthStorage.test.js` (Task 2)
- `frontend-mobile/src/__tests__/authService.test.js` — non esisteva prima, colma un gap di copertura (Task 3)
- `frontend-mobile/src/__tests__/apiClient.test.js` — non esisteva prima (Task 4)
- `frontend-mobile/src/__tests__/ChangePasswordScreen.test.jsx` — non esisteva prima (Task 6)
- `frontend-mobile/src/utils/sentryScrub.js` — scrubbing puro, testabile (Task 8)
- `frontend-mobile/src/__tests__/sentryScrub.test.js` (Task 8)

**Modificati:**
- `frontend-mobile/package.json` (Task 1)
- `frontend-mobile/src/services/authService.js` (Task 3)
- `frontend-mobile/src/services/apiClient.js` (Task 4)
- `frontend-mobile/src/navigation/RootNavigator.jsx` + `src/__tests__/RootNavigator.test.jsx` (Task 5)
- `frontend-mobile/src/screens/settings/ChangePasswordScreen.jsx` (Task 6)
- `frontend-mobile/src/screens/auth/LoginScreen.jsx` + `src/__tests__/LoginScreen.test.jsx` (Task 7)
- `frontend-mobile/App.jsx` (Task 8)

**Non toccati** (confermato in fase di design — usano `AsyncStorage` solo per chiavi fuori scope): `SettingsScreen.jsx`, `MyScheduleScreen.jsx`, `MyPresencesScreen.jsx`, `CheckInScreen.jsx`, `offlineQueue.js` (e il suo test, che già mocka `apiClient`/`authService` per intero — nessuna ripercussione).

**Nota per chi esegue il piano:** i numeri di riga citati riflettono lo stato del codice osservato durante il brainstorming (7 Agosto 2026). Rileggere sempre il file reale prima di applicare un diff.

---

## Task 1: Aggiungere la dipendenza `expo-secure-store`

**Files:**
- Modify: `frontend-mobile/package.json`

- [ ] **Step 1: Installare la dipendenza con il tool Expo (risolve automaticamente la versione compatibile con Expo SDK 54, stesso comando già usato per `expo-device` in una sessione precedente)**

Run: `cd frontend-mobile && npx expo install expo-secure-store`
Expected: nessun errore; il comando aggiunge una riga tipo `"expo-secure-store": "~X.Y.Z"` tra le `dependencies` di `package.json` e aggiorna `package-lock.json`.

- [ ] **Step 2: Verificare l'aggiunta**

Run: `cd frontend-mobile && grep -n "expo-secure-store" package.json`
Expected: mostra la riga appena aggiunta.

- [ ] **Step 3: Commit**

```bash
git add frontend-mobile/package.json frontend-mobile/package-lock.json
git commit -m "chore(mobile): add expo-secure-store dependency (finding #1, Fase B)"
```

---

## Task 2: Modulo `secureAuthStorage.js`

**Files:**
- Create: `frontend-mobile/src/services/secureAuthStorage.js`
- Test: Create `frontend-mobile/src/__tests__/secureAuthStorage.test.js`

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// frontend-mobile/src/__tests__/secureAuthStorage.test.js
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    setItemAsync: jest.fn((key, value) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((key) => Promise.resolve(store.has(key) ? store.get(key) : null)),
    deleteItemAsync: jest.fn((key) => {
      store.delete(key);
      return Promise.resolve();
    }),
    __clear: () => store.clear(),
  };
});

const { interopDefault } = require('./helpers/rntl');
const SecureStore = require('expo-secure-store');
const { STORAGE_KEYS } = require('../config/endpoints');
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));
const { SecureStorageError } = require('../services/secureAuthStorage');

describe('secureAuthStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SecureStore.__clear();
  });

  it('setSession scrive token, refresh token e user; getToken/getRefreshToken/getUser li rileggono correttamente', async () => {
    await secureAuthStorage.setSession({
      token: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'u1', email: 'a@b.com', role: 'employee' },
    });

    await expect(secureAuthStorage.getToken()).resolves.toBe('access-1');
    await expect(secureAuthStorage.getRefreshToken()).resolves.toBe('refresh-1');
    await expect(secureAuthStorage.getUser()).resolves.toEqual({ id: 'u1', email: 'a@b.com', role: 'employee' });
  });

  it('setSession senza refreshToken non scrive la chiave REFRESH_TOKEN', async () => {
    await secureAuthStorage.setSession({ token: 'access-1', user: { id: 'u1' } });

    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(STORAGE_KEYS.REFRESH_TOKEN, expect.anything());
    await expect(secureAuthStorage.getRefreshToken()).resolves.toBeNull();
  });

  it('setTokenPair aggiorna access e refresh token senza toccare user', async () => {
    await secureAuthStorage.setSession({ token: 'old-access', refreshToken: 'old-refresh', user: { id: 'u1' } });
    await secureAuthStorage.setTokenPair({ token: 'new-access', refreshToken: 'new-refresh' });

    await expect(secureAuthStorage.getToken()).resolves.toBe('new-access');
    await expect(secureAuthStorage.getRefreshToken()).resolves.toBe('new-refresh');
    await expect(secureAuthStorage.getUser()).resolves.toEqual({ id: 'u1' });
  });

  it('setTokenPair senza refreshToken aggiorna solo il token', async () => {
    await secureAuthStorage.setSession({ token: 'old-access', refreshToken: 'old-refresh', user: { id: 'u1' } });
    await secureAuthStorage.setTokenPair({ token: 'new-access' });

    await expect(secureAuthStorage.getToken()).resolves.toBe('new-access');
    await expect(secureAuthStorage.getRefreshToken()).resolves.toBe('old-refresh');
  });

  it('clearSession rimuove token, refresh token e user', async () => {
    await secureAuthStorage.setSession({ token: 'a', refreshToken: 'r', user: { id: 'u1' } });
    await secureAuthStorage.clearSession();

    await expect(secureAuthStorage.getToken()).resolves.toBeNull();
    await expect(secureAuthStorage.getRefreshToken()).resolves.toBeNull();
    await expect(secureAuthStorage.getUser()).resolves.toBeNull();
  });

  it('getUser ritorna null e ripulisce la chiave se il JSON salvato è corrotto', async () => {
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, '{not-json');

    await expect(secureAuthStorage.getUser()).resolves.toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.USER_DATA);
  });

  it('lancia SecureStorageError se SecureStore.setItemAsync fallisce', async () => {
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error('disk full'));

    await expect(secureAuthStorage.setSession({ token: 'a', user: { id: 'u1' } }))
      .rejects.toBeInstanceOf(SecureStorageError);
  });

  it('lancia SecureStorageError se SecureStore.getItemAsync fallisce', async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('keystore unavailable'));

    await expect(secureAuthStorage.getToken()).rejects.toBeInstanceOf(SecureStorageError);
  });

  it('lancia SecureStorageError se SecureStore.deleteItemAsync fallisce', async () => {
    SecureStore.deleteItemAsync.mockRejectedValueOnce(new Error('keystore locked'));

    await expect(secureAuthStorage.clearSession()).rejects.toBeInstanceOf(SecureStorageError);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- secureAuthStorage`
Expected: FAIL — `Cannot find module '../services/secureAuthStorage'` (il modulo non esiste ancora).

- [ ] **Step 3: Implementare il modulo**

```javascript
// frontend-mobile/src/services/secureAuthStorage.js
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../config/endpoints';

const { AUTH_TOKEN, REFRESH_TOKEN, USER_DATA } = STORAGE_KEYS;

export class SecureStorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SecureStorageError';
    this.cause = cause;
  }
}

async function setItem(key, value) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (err) {
    throw new SecureStorageError(`Impossibile salvare "${key}" in modo sicuro.`, err);
  }
}

async function getItem(key) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    throw new SecureStorageError(`Impossibile leggere "${key}" dallo storage sicuro.`, err);
  }
}

async function deleteItem(key) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (err) {
    throw new SecureStorageError(`Impossibile rimuovere "${key}" dallo storage sicuro.`, err);
  }
}

const secureAuthStorage = {
  async getToken() {
    return getItem(AUTH_TOKEN);
  },

  async getRefreshToken() {
    return getItem(REFRESH_TOKEN);
  },

  async getUser() {
    const raw = await getItem(USER_DATA);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Failed to parse user data from secure storage:', err);
      await deleteItem(USER_DATA);
      return null;
    }
  },

  async setSession({ token, refreshToken, user }) {
    const writes = [setItem(AUTH_TOKEN, token), setItem(USER_DATA, JSON.stringify(user))];
    if (refreshToken) writes.push(setItem(REFRESH_TOKEN, refreshToken));
    await Promise.all(writes);
  },

  async setTokenPair({ token, refreshToken }) {
    const writes = [setItem(AUTH_TOKEN, token)];
    if (refreshToken) writes.push(setItem(REFRESH_TOKEN, refreshToken));
    await Promise.all(writes);
  },

  async clearSession() {
    await Promise.all([deleteItem(AUTH_TOKEN), deleteItem(REFRESH_TOKEN), deleteItem(USER_DATA)]);
  },
};

export default secureAuthStorage;
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- secureAuthStorage`
Expected: PASS (10/10 test).

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/services/secureAuthStorage.js frontend-mobile/src/__tests__/secureAuthStorage.test.js
git commit -m "feat(mobile): add secureAuthStorage module backed by expo-secure-store (finding #1, Fase B)"
```

---

## Task 3: `authService.js` — usare `secureAuthStorage`

**Files:**
- Modify: `frontend-mobile/src/services/authService.js`
- Test: Create `frontend-mobile/src/__tests__/authService.test.js` (nessun test esisteva prima per questo file — gap colmato qui, come richiesto dallo spec)

- [ ] **Step 1: Scrivere il test rosso (comportamentale, non sull'implementazione attuale)**

```javascript
// frontend-mobile/src/__tests__/authService.test.js
jest.mock('../services/apiClient', () => ({ post: jest.fn() }));
jest.mock('../services/secureAuthStorage', () => ({
  getToken: jest.fn(),
  getRefreshToken: jest.fn(),
  getUser: jest.fn(),
  setSession: jest.fn(),
  setTokenPair: jest.fn(),
  clearSession: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ multiRemove: jest.fn() }));

const { interopDefault } = require('./helpers/rntl');
const apiClient = interopDefault(require('../services/apiClient'));
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { STORAGE_KEYS } = require('../config/endpoints');
const authService = interopDefault(require('../services/authService'));

describe('authService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('login persiste la sessione via secureAuthStorage.setSession e ritorna token+user', async () => {
    apiClient.post.mockResolvedValue({
      data: { data: { token: 'access-1', refresh_token: 'refresh-1', user: { id: 'u1', role: 'employee' } } },
    });

    const result = await authService.login('user@example.com', 'secret123');

    expect(secureAuthStorage.setSession).toHaveBeenCalledWith({
      token: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'u1', role: 'employee' },
    });
    expect(result).toEqual({ token: 'access-1', user: { id: 'u1', role: 'employee' } });
  });

  test('login include client_id nel body quando fornito', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { token: 't', user: {} } } });

    await authService.login('user@example.com', 'secret123', 'client-42');

    expect(apiClient.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ client_id: 'client-42' }));
  });

  test('logout ripulisce la sessione sicura e le cache UI, anche se la chiamata API di logout fallisce', async () => {
    apiClient.post.mockRejectedValue(new Error('network down'));
    secureAuthStorage.clearSession.mockResolvedValue(undefined);
    AsyncStorage.multiRemove.mockResolvedValue(undefined);

    await authService.logout();

    expect(secureAuthStorage.clearSession).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([STORAGE_KEYS.CACHE_SHIFTS, STORAGE_KEYS.CACHE_PRESENCES]);
  });

  test('refreshAccessToken persiste solo il nuovo access token via setTokenPair', async () => {
    secureAuthStorage.getRefreshToken.mockResolvedValue('refresh-1');
    apiClient.post.mockResolvedValue({ data: { data: { token: 'access-2' } } });

    const token = await authService.refreshAccessToken();

    expect(secureAuthStorage.setTokenPair).toHaveBeenCalledWith({ token: 'access-2' });
    expect(token).toBe('access-2');
  });

  test('refreshAccessToken lancia senza chiamare l\'API se non c\'è un refresh token salvato', async () => {
    secureAuthStorage.getRefreshToken.mockResolvedValue(null);

    await expect(authService.refreshAccessToken()).rejects.toThrow('No refresh token');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  test('isAuthenticated riflette se secureAuthStorage.getToken() risolve un token', async () => {
    secureAuthStorage.getToken.mockResolvedValue('access-1');
    await expect(authService.isAuthenticated()).resolves.toBe(true);

    secureAuthStorage.getToken.mockResolvedValue(null);
    await expect(authService.isAuthenticated()).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- src/__tests__/authService.test.js`
Expected: FAIL — `authService.login` chiama ancora `AsyncStorage.multiSet`, non `secureAuthStorage.setSession` (le asserzioni su `secureAuthStorage.setSession`/`setTokenPair`/`clearSession` non vengono mai soddisfatte).

- [ ] **Step 3: Riscrivere `authService.js`**

```javascript
// frontend-mobile/src/services/authService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';
import { ENDPOINTS, STORAGE_KEYS } from '../config/endpoints';
import secureAuthStorage from './secureAuthStorage';

const authService = {
  async login(email, password, clientId = null) {
    const body = { email, password };
    // Include client_id when available to prevent cross-tenant email collision
    // (required once a second client is onboarded with an overlapping employee email)
    if (clientId) body.client_id = clientId;
    const response = await apiClient.post(ENDPOINTS.AUTH_LOGIN, body);
    const { token, refresh_token, user } = response.data.data;
    await secureAuthStorage.setSession({ token, refreshToken: refresh_token, user });
    return { token, user };
  },

  async logout() {
    try {
      await apiClient.post(ENDPOINTS.AUTH_LOGOUT, {});
    } catch {
      // best-effort
    }
    // Clear read-only UI caches too — retail devices are often shared between employees,
    // and a stale cache would otherwise show the previous employee's shifts/presences to
    // whoever logs in next (offline mode, Task B5). The pending check-in queue is
    // deliberately NOT cleared here: those check-ins belong to the employee who created
    // them and must still sync even after they've logged out on this device.
    await Promise.all([
      secureAuthStorage.clearSession(),
      AsyncStorage.multiRemove([STORAGE_KEYS.CACHE_SHIFTS, STORAGE_KEYS.CACHE_PRESENCES]),
    ]);
  },

  async getToken() {
    return secureAuthStorage.getToken();
  },

  async getRefreshToken() {
    return secureAuthStorage.getRefreshToken();
  },

  async refreshAccessToken() {
    const refresh_token = await this.getRefreshToken();
    if (!refresh_token) throw new Error('No refresh token');
    const response = await apiClient.post(ENDPOINTS.AUTH_REFRESH, { refresh_token });
    const { token } = response.data.data;
    await secureAuthStorage.setTokenPair({ token });
    return token;
  },

  async getUser() {
    return secureAuthStorage.getUser();
  },

  async isAuthenticated() {
    const token = await secureAuthStorage.getToken();
    return !!token;
  },
};

export default authService;
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- src/__tests__/authService.test.js`
Expected: PASS (6/6 test).

- [ ] **Step 5: Rieseguire i test che dipendono indirettamente da `authService` (mockato per intero, ma verificare nessuna regressione)**

Run: `cd frontend-mobile && npm test -- LoginScreen offlineQueue`
Expected: PASS — questi file mockano `authService` per intero, quindi non sono affetti dal refactor interno.

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/src/services/authService.js frontend-mobile/src/__tests__/authService.test.js
git commit -m "refactor(mobile): authService uses secureAuthStorage for sensitive data (finding #1, Fase B)"
```

---

## Task 4: `apiClient.js` — usare `secureAuthStorage`

**Files:**
- Modify: `frontend-mobile/src/services/apiClient.js`
- Test: Create `frontend-mobile/src/__tests__/apiClient.test.js` (nessun test esisteva prima per questo file)

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// frontend-mobile/src/__tests__/apiClient.test.js
jest.mock('../services/secureAuthStorage', () => ({
  getToken: jest.fn(),
  clearSession: jest.fn(),
}));
jest.mock('../services/authService', () => ({
  refreshAccessToken: jest.fn(),
}));
jest.mock('../utils/navigationRef', () => ({ navigateTo: jest.fn() }));

const { interopDefault } = require('./helpers/rntl');
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));
const authService = interopDefault(require('../services/authService'));
const { navigateTo } = require('../utils/navigationRef');
const apiClient = interopDefault(require('../services/apiClient'));

function getRequestInterceptor() {
  return apiClient.interceptors.request.handlers[0].fulfilled;
}
function getResponseRejectedInterceptor() {
  return apiClient.interceptors.response.handlers[0].rejected;
}

describe('apiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    secureAuthStorage.clearSession.mockResolvedValue(undefined);
  });

  test('allega l\'header Authorization leggendo il token da secureAuthStorage.getToken()', async () => {
    secureAuthStorage.getToken.mockResolvedValue('token-abc');

    const config = await getRequestInterceptor()({ headers: {} });

    expect(config.headers.Authorization).toBe('Bearer token-abc');
  });

  test('non allega l\'header Authorization quando non c\'è alcun token salvato', async () => {
    secureAuthStorage.getToken.mockResolvedValue(null);

    const config = await getRequestInterceptor()({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });

  test('dopo un 401, se il refresh fallisce, ripulisce la sessione sicura e reindirizza a Login', async () => {
    authService.refreshAccessToken.mockRejectedValue(new Error('refresh failed'));
    const error = {
      response: { status: 401 },
      config: { url: '/api/v1/checkins', headers: {} },
    };

    await expect(getResponseRejectedInterceptor()(error)).rejects.toThrow('refresh failed');

    expect(secureAuthStorage.clearSession).toHaveBeenCalledTimes(1);
    expect(navigateTo).toHaveBeenCalledWith('Login');
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- src/__tests__/apiClient.test.js`
Expected: FAIL — l'interceptor richiesta legge ancora da `AsyncStorage.getItem`, non da `secureAuthStorage.getToken` (mockato); `config.headers.Authorization` risulta `undefined` nel primo test invece di `'Bearer token-abc'`.

- [ ] **Step 3: Riscrivere `apiClient.js`**

```javascript
// frontend-mobile/src/services/apiClient.js
import axios from 'axios';
import { API_BASE, ENDPOINTS, TIMING } from '../config/endpoints';
import { navigateTo } from '../utils/navigationRef';
import secureAuthStorage from './secureAuthStorage';

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: TIMING.API_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await secureAuthStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Queue-based 401 interceptor: refresh access token once, retry original request.
// If refresh fails, clear the secure session and redirect to Login.
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config;

    if (status === 401 && !originalRequest._retried && originalRequest.url !== ENDPOINTS.AUTH_REFRESH) {
      if (isRefreshing) {
        // Queue concurrent 401s — they all retry once the refresh resolves
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retried = true;
      isRefreshing = true;

      try {
        // Lazy import to avoid circular dependency at module load time
        const authService = (await import('./authService')).default;
        const newToken = await authService.refreshAccessToken();
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        await secureAuthStorage.clearSession();
        navigateTo('Login');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- src/__tests__/apiClient.test.js`
Expected: PASS (3/3 test).

- [ ] **Step 5: Rieseguire i test che dipendono indirettamente da `apiClient` (mockato per intero altrove)**

Run: `cd frontend-mobile && npm test -- offlineQueue`
Expected: PASS — nessuna regressione, `offlineQueue.test.js` mocka `apiClient` per intero.

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/src/services/apiClient.js frontend-mobile/src/__tests__/apiClient.test.js
git commit -m "refactor(mobile): apiClient interceptors use secureAuthStorage (finding #1, Fase B)"
```

---

## Task 5: `RootNavigator.jsx` — usare `secureAuthStorage`

**Files:**
- Modify: `frontend-mobile/src/navigation/RootNavigator.jsx`
- Test: Modify `frontend-mobile/src/__tests__/RootNavigator.test.jsx`

- [ ] **Step 1: Aggiornare il test esistente (rosso rispetto al codice attuale)**

In `frontend-mobile/src/__tests__/RootNavigator.test.jsx`, sostituire il blocco dei mock `AsyncStorage`/require (righe 30-33 e 48) con:

```javascript
jest.mock('@react-native-async-storage/async-storage', () => ({
  multiRemove: jest.fn(),
}));

jest.mock('../services/secureAuthStorage', () => ({
  clearSession: jest.fn(),
  getUser: jest.fn(),
}));
```

Subito dopo la riga `const AsyncStorage = require('@react-native-async-storage/async-storage');` aggiungere:

```javascript
const { interopDefault } = require('./helpers/rntl');
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));
```

Nel blocco `beforeEach`, sostituire

```javascript
    AsyncStorage.multiRemove.mockResolvedValue(undefined);
    // Simulate a still-valid stored token: the regression this guards against
    // is a code path that peeks at this and skips the force-Login behavior.
    AsyncStorage.getItem.mockResolvedValue('some-still-valid-token');
```

con

```javascript
    AsyncStorage.multiRemove.mockResolvedValue(undefined);
    secureAuthStorage.clearSession.mockResolvedValue(undefined);
    // Simulate a still-valid stored session: the regression this guards against
    // is a code path that peeks at this and skips the force-Login behavior.
    secureAuthStorage.getUser.mockResolvedValue({ role: 'employee' });
```

Sostituire l'intero test `'regression guard: multiRemove is called with exactly the 5 session/cache keys (never OFFLINE_QUEUE), and Login is always forced, even when a token already exists'` con:

```javascript
  test('regression guard: cold start clears the secure session and the 2 cache keys (never OFFLINE_QUEUE or auth keys via AsyncStorage), and Login is always forced, even when a session already exists', async () => {
    const { findByText } = await renderNavigator();

    await waitFor(() => expect(secureAuthStorage.clearSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(AsyncStorage.multiRemove).toHaveBeenCalledTimes(1));

    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      STORAGE_KEYS.CACHE_SHIFTS,
      STORAGE_KEYS.CACHE_PRESENCES,
    ]);

    const clearedKeys = AsyncStorage.multiRemove.mock.calls[0][0];
    expect(clearedKeys).not.toContain(STORAGE_KEYS.OFFLINE_QUEUE);
    expect(clearedKeys).not.toContain(STORAGE_KEYS.AUTH_TOKEN);
    expect(clearedKeys).not.toContain(STORAGE_KEYS.REFRESH_TOKEN);
    expect(clearedKeys).not.toContain(STORAGE_KEYS.USER_DATA);

    // Direct proof the app landed on Login despite a resolvable existing session.
    await findByText('LOGIN_SCREEN_STUB');
  });
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- src/__tests__/RootNavigator.test.jsx`
Expected: FAIL — il codice attuale chiama ancora `AsyncStorage.multiRemove` con le 5 chiavi insieme, mai `secureAuthStorage.clearSession`.

- [ ] **Step 3: Modificare `RootNavigator.jsx`**

Aggiungere l'import (dopo la riga `import { flushQueue } from '../services/offlineQueue';`):

```javascript
import secureAuthStorage from '../services/secureAuthStorage';
```

Sostituire l'effetto in `MainTabs` che legge il ruolo utente:

```javascript
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.USER_DATA).then(userData => {
      try {
        const user = JSON.parse(userData || '{}');
        setRole(user.role || 'employee');
      } catch {
        setRole('employee');
      }
    });
  }, []);
```

con:

```javascript
  useEffect(() => {
    secureAuthStorage.getUser()
      .then(user => setRole((user && user.role) || 'employee'))
      .catch(() => setRole('employee'));
  }, []);
```

Sostituire l'effetto di cold-start in `RootNavigator` (commento + corpo):

```javascript
  // Deliberately never restore a previous session on cold start (retail devices
  // are often shared between employees — see authService.logout's same reasoning
  // for CACHE_SHIFTS/CACHE_PRESENCES). This effect only runs once per app process,
  // so it fires on a real kill+reopen but not on background/foreground (RootNavigator
  // stays mounted for those — see the listener-registration effect below). The
  // pending offline check-in queue is NOT touched: those check-ins survive a kill
  // by design (Task B6, Section 4) and sync once their owner logs back in.
  useEffect(() => {
    AsyncStorage.multiRemove([
      STORAGE_KEYS.AUTH_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.USER_DATA,
      STORAGE_KEYS.CACHE_SHIFTS,
      STORAGE_KEYS.CACHE_PRESENCES,
    ]).finally(() => setInitialRoute('Login'));
  }, []);
```

con:

```javascript
  // Deliberately never restore a previous session on cold start (retail devices
  // are often shared between employees — see authService.logout's same reasoning
  // for CACHE_SHIFTS/CACHE_PRESENCES). This effect only runs once per app process,
  // so it fires on a real kill+reopen but not on background/foreground (RootNavigator
  // stays mounted for those — see the listener-registration effect below). The
  // pending offline check-in queue is NOT touched: those check-ins survive a kill
  // by design (Task B6, Section 4) and sync once their owner logs back in.
  //
  // Also doubles as opportunistic cleanup of any plaintext session leftover in
  // AsyncStorage from a pre-secureAuthStorage build (finding #1, Fase B) — this
  // effect runs on every kill+reopen, which every app-store update triggers.
  useEffect(() => {
    Promise.all([
      secureAuthStorage.clearSession(),
      AsyncStorage.multiRemove([STORAGE_KEYS.CACHE_SHIFTS, STORAGE_KEYS.CACHE_PRESENCES]),
    ]).finally(() => setInitialRoute('Login'));
  }, []);
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- src/__tests__/RootNavigator.test.jsx`
Expected: PASS (tutti i test del file, inclusi quelli su NetInfo/AppState non toccati da questo task).

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/navigation/RootNavigator.jsx frontend-mobile/src/__tests__/RootNavigator.test.jsx
git commit -m "refactor(mobile): RootNavigator uses secureAuthStorage, cold-start also cleans legacy plaintext leftovers (finding #1, Fase B)"
```

---

## Task 6: `ChangePasswordScreen.jsx` — usare `secureAuthStorage` + errore dedicato

**Files:**
- Modify: `frontend-mobile/src/screens/settings/ChangePasswordScreen.jsx`
- Test: Create `frontend-mobile/src/__tests__/ChangePasswordScreen.test.jsx` (nessun test esisteva prima per questo file)

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// frontend-mobile/src/__tests__/ChangePasswordScreen.test.jsx
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('../services/apiClient', () => ({ post: jest.fn() }));
jest.mock('../services/secureAuthStorage', () => {
  class SecureStorageError extends Error {}
  return { setTokenPair: jest.fn(), SecureStorageError };
});

const { interopDefault } = require('./helpers/rntl');
const apiClient = interopDefault(require('../services/apiClient'));
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));
const { SecureStorageError } = secureAuthStorage;

const ChangePasswordScreen = interopDefault(require('../screens/settings/ChangePasswordScreen'));

async function renderScreen(navigationOverrides = {}) {
  const navigation = { goBack: jest.fn(), ...navigationOverrides };
  const utils = await render(<ChangePasswordScreen navigation={navigation} />);
  return { ...utils, navigation };
}

async function type(input, value) {
  await act(async () => {
    fireEvent.changeText(input, value);
  });
}

async function press(button) {
  await act(async () => {
    fireEvent.press(button);
  });
}

describe('ChangePasswordScreen', () => {
  beforeAll(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('un cambio riuscito persiste la nuova coppia di token via secureAuthStorage.setTokenPair', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { token: 'new-access', refresh_token: 'new-refresh' } } });
    secureAuthStorage.setTokenPair.mockResolvedValue(undefined);
    const { getByPlaceholderText, getAllByPlaceholderText, getByText } = await renderScreen();

    const [oldPasswordInput, confirmPasswordInput] = getAllByPlaceholderText('••••••••');
    const newPasswordInput = getByPlaceholderText('Almeno 8 caratteri');

    await type(oldPasswordInput, 'oldpass1');
    await type(newPasswordInput, 'newpass1');
    await type(confirmPasswordInput, 'newpass1');
    await press(getByText('Aggiorna password'));

    expect(secureAuthStorage.setTokenPair).toHaveBeenCalledWith({ token: 'new-access', refreshToken: 'new-refresh' });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Password aggiornata',
      'La tua password è stata cambiata con successo.',
      expect.any(Array)
    );
  });

  test('se il salvataggio sicuro fallisce dopo un cambio password riuscito, mostra un messaggio dedicato', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { token: 'new-access', refresh_token: 'new-refresh' } } });
    secureAuthStorage.setTokenPair.mockRejectedValue(new SecureStorageError('disk full'));
    const { getByPlaceholderText, getAllByPlaceholderText, getByText, findByText } = await renderScreen();

    const [oldPasswordInput, confirmPasswordInput] = getAllByPlaceholderText('••••••••');
    const newPasswordInput = getByPlaceholderText('Almeno 8 caratteri');

    await type(oldPasswordInput, 'oldpass1');
    await type(newPasswordInput, 'newpass1');
    await type(confirmPasswordInput, 'newpass1');
    await press(getByText('Aggiorna password'));

    await findByText('Password cambiata, ma non è stato possibile salvare la nuova sessione. Effettua di nuovo il login.');
    expect(Alert.alert).not.toHaveBeenCalledWith('Password aggiornata', expect.anything(), expect.anything());
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- src/__tests__/ChangePasswordScreen.test.jsx`
Expected: FAIL — il primo test fallisce perché `secureAuthStorage.setTokenPair` non viene mai chiamato (il codice attuale usa `AsyncStorage.multiSet`); il secondo fallisce perché il messaggio dedicato non esiste.

- [ ] **Step 3: Modificare `ChangePasswordScreen.jsx`**

Sostituire il blocco import (righe 1-7):

```javascript
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../services/apiClient';
import { ENDPOINTS, STORAGE_KEYS } from '../../config/endpoints';
import { COLORS, FONTS } from '../../config/theme';
```

con:

```javascript
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../services/apiClient';
import { ENDPOINTS } from '../../config/endpoints';
import { COLORS, FONTS } from '../../config/theme';
import secureAuthStorage, { SecureStorageError } from '../../services/secureAuthStorage';
```

Sostituire il corpo di `handleSubmit` (dal `setSubmitting(true)` al `finally`):

```javascript
    setSubmitting(true);
    try {
      const response = await apiClient.post(ENDPOINTS.AUTH_CHANGE_PASSWORD, {
        old_password: oldPassword,
        new_password: newPassword,
      });

      // Backend issues a fresh token pair — persist it so the session continues
      // without forcing a re-login.
      const { token, refresh_token } = response.data.data;
      const pairs = [[STORAGE_KEYS.AUTH_TOKEN, token]];
      if (refresh_token) pairs.push([STORAGE_KEYS.REFRESH_TOKEN, refresh_token]);
      await AsyncStorage.multiSet(pairs);

      Alert.alert('Password aggiornata', 'La tua password è stata cambiata con successo.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      setError(err.response?.data?.message || 'Impossibile cambiare la password. Riprova.');
    } finally {
      setSubmitting(false);
    }
```

con:

```javascript
    setSubmitting(true);
    try {
      const response = await apiClient.post(ENDPOINTS.AUTH_CHANGE_PASSWORD, {
        old_password: oldPassword,
        new_password: newPassword,
      });

      // Backend issues a fresh token pair — persist it so the session continues
      // without forcing a re-login.
      const { token, refresh_token } = response.data.data;
      await secureAuthStorage.setTokenPair({ token, refreshToken: refresh_token });

      Alert.alert('Password aggiornata', 'La tua password è stata cambiata con successo.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      if (err instanceof SecureStorageError) {
        // The password WAS changed server-side by this point — the failure is
        // purely local storage. Say so explicitly instead of implying the
        // password change itself failed.
        setError('Password cambiata, ma non è stato possibile salvare la nuova sessione. Effettua di nuovo il login.');
      } else {
        setError(err.response?.data?.message || 'Impossibile cambiare la password. Riprova.');
      }
    } finally {
      setSubmitting(false);
    }
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- src/__tests__/ChangePasswordScreen.test.jsx`
Expected: PASS (2/2 test).

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/screens/settings/ChangePasswordScreen.jsx frontend-mobile/src/__tests__/ChangePasswordScreen.test.jsx
git commit -m "refactor(mobile): ChangePasswordScreen uses secureAuthStorage with dedicated storage-failure message (finding #1, Fase B)"
```

---

## Task 7: `LoginScreen.jsx` — messaggio dedicato per errori di storage sicuro

**Files:**
- Modify: `frontend-mobile/src/screens/auth/LoginScreen.jsx`
- Test: Modify `frontend-mobile/src/__tests__/LoginScreen.test.jsx`

- [ ] **Step 1: Aggiungere il test rosso**

In `frontend-mobile/src/__tests__/LoginScreen.test.jsx`, aggiungere subito dopo `jest.mock('../services/offlineQueue', ...)`:

```javascript
jest.mock('../services/secureAuthStorage', () => {
  class SecureStorageError extends Error {}
  return { SecureStorageError };
});
```

Subito dopo `const { flushQueue } = require('../services/offlineQueue');` aggiungere:

```javascript
const { SecureStorageError } = require('../services/secureAuthStorage');
```

Aggiungere un nuovo test, subito dopo `'failed login shows "Accesso negato" with the server message and resets loading'`:

```javascript
  test('login che fallisce con SecureStorageError mostra un messaggio dedicato, non "Accesso negato"', async () => {
    const err = new SecureStorageError('Impossibile salvare "badge_auth_token" in modo sicuro.');
    authService.login.mockRejectedValue(err);
    const { getByPlaceholderText, getByText } = await renderScreen();

    await type(getByPlaceholderText('Email'), 'user@example.com');
    await type(getByPlaceholderText('Password'), 'secret123');
    await press(getByText('Accedi'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Errore',
      'Accesso riuscito, ma non è stato possibile salvare la sessione in modo sicuro. Riprova.'
    );
    expect(getByText('Accedi')).toBeTruthy();
  });
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- src/__tests__/LoginScreen.test.jsx`
Expected: FAIL — il codice attuale mostra sempre `'Accesso negato'` con `err.response?.data?.message || 'Email o password non corretti'`, mai il messaggio dedicato.

- [ ] **Step 3: Modificare `LoginScreen.jsx`**

Aggiungere l'import, subito dopo `import authService from '../../services/authService';`:

```javascript
import { SecureStorageError } from '../../services/secureAuthStorage';
```

Sostituire il blocco `catch` di `handleLogin`:

```javascript
    } catch (err) {
      const msg = err.response?.data?.message || 'Email o password non corretti';
      Alert.alert('Accesso negato', msg);
      setLoading(false);
    }
```

con:

```javascript
    } catch (err) {
      if (err instanceof SecureStorageError) {
        Alert.alert('Errore', 'Accesso riuscito, ma non è stato possibile salvare la sessione in modo sicuro. Riprova.');
      } else {
        const msg = err.response?.data?.message || 'Email o password non corretti';
        Alert.alert('Accesso negato', msg);
      }
      setLoading(false);
    }
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- src/__tests__/LoginScreen.test.jsx`
Expected: PASS (tutti i test del file).

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/screens/auth/LoginScreen.jsx frontend-mobile/src/__tests__/LoginScreen.test.jsx
git commit -m "fix(mobile): dedicated LoginScreen message when secure session storage fails (finding #1, Fase B)"
```

---

## Task 8: Scrubbing Sentry (difesa in profondità)

**Files:**
- Create: `frontend-mobile/src/utils/sentryScrub.js`
- Test: Create `frontend-mobile/src/__tests__/sentryScrub.test.js`
- Modify: `frontend-mobile/App.jsx`

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// frontend-mobile/src/__tests__/sentryScrub.test.js
const { scrubBreadcrumb, scrubEvent } = require('../utils/sentryScrub');

describe('sentryScrub', () => {
  test('scrubBreadcrumb redige una chiave Authorization di primo livello in breadcrumb.data', () => {
    const breadcrumb = { category: 'xhr', data: { url: '/api/v1/checkins', Authorization: 'Bearer secret-token' } };

    const result = scrubBreadcrumb(breadcrumb);

    expect(result.data.Authorization).toBe('[Filtered]');
    expect(result.data.url).toBe('/api/v1/checkins');
  });

  test('scrubBreadcrumb redige gli header annidati sotto breadcrumb.data.headers', () => {
    const breadcrumb = { category: 'fetch', data: { headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' } } };

    const result = scrubBreadcrumb(breadcrumb);

    expect(result.data.headers.authorization).toBe('[Filtered]');
    expect(result.data.headers['content-type']).toBe('application/json');
  });

  test('scrubBreadcrumb non fa nulla se la breadcrumb non ha data', () => {
    const breadcrumb = { category: 'navigation' };

    expect(scrubBreadcrumb(breadcrumb)).toEqual(breadcrumb);
  });

  test('scrubEvent redige gli header sensibili della richiesta', () => {
    const event = { request: { headers: { authorization: 'Bearer secret-token', 'user-agent': 'BadgeApp/1.0' } } };

    const result = scrubEvent(event);

    expect(result.request.headers.authorization).toBe('[Filtered]');
    expect(result.request.headers['user-agent']).toBe('BadgeApp/1.0');
  });

  test('scrubEvent redige le chiavi sensibili nel body della richiesta', () => {
    const event = { request: { data: { password: 'hunter2', email: 'a@b.com' } } };

    const result = scrubEvent(event);

    expect(result.request.data.password).toBe('[Filtered]');
    expect(result.request.data.email).toBe('a@b.com');
  });

  test('scrubEvent non fa nulla se l\'evento non ha request', () => {
    const event = { message: 'boom' };

    expect(scrubEvent(event)).toEqual(event);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- sentryScrub`
Expected: FAIL — `Cannot find module '../utils/sentryScrub'`.

- [ ] **Step 3: Implementare `sentryScrub.js`**

Stessa lista di chiavi sensibili e stesso marker `'[Filtered]'` già usati lato backend (`backend/src/app.js`, finding storico S.15), per coerenza tra i due componenti.

```javascript
// frontend-mobile/src/utils/sentryScrub.js
const SENSITIVE_KEYS = ['authorization', 'password', 'token', 'cookie', 'x-api-key'];

function scrubObject(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      obj[key] = '[Filtered]';
    }
  }
}

export function scrubBreadcrumb(breadcrumb) {
  if (breadcrumb?.data) {
    scrubObject(breadcrumb.data);
    scrubObject(breadcrumb.data.headers);
    scrubObject(breadcrumb.data.request_headers);
  }
  return breadcrumb;
}

export function scrubEvent(event) {
  if (event?.request?.headers) scrubObject(event.request.headers);
  if (event?.request?.data) scrubObject(event.request.data);
  return event;
}
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- sentryScrub`
Expected: PASS (6/6 test).

- [ ] **Step 5: Collegare lo scrubbing a `Sentry.init()` in `App.jsx`**

Sostituire:

```javascript
import * as Sentry from '@sentry/react-native';
```

con:

```javascript
import * as Sentry from '@sentry/react-native';
import { scrubBreadcrumb, scrubEvent } from './src/utils/sentryScrub';
```

Sostituire:

```javascript
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.2,
    // Automatically capture JS exceptions + native crashes
    enableNativeCrashHandling: true,
  });
}
```

con:

```javascript
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.2,
    // Automatically capture JS exceptions + native crashes
    enableNativeCrashHandling: true,
    // Defense in depth (finding #1, Fase B): mirrors the backend's Sentry
    // scrubbing (app.js, finding S.25) so token/PII never leaves the device
    // via a breadcrumb or crash report either.
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
}
```

**Nota:** `App.jsx` non ha (e non guadagna qui) un test dedicato — richiederebbe mock estesi per il caricamento font/Sentry.wrap non altrimenti necessari in questo progetto. La correttezza dello scrubbing è già verificata alla radice sulle funzioni pure in `sentryScrub.test.js`; il collegamento a `Sentry.init()` è una singola riga per opzione, verificabile a vista.

- [ ] **Step 6: Verificare che l'app compili ancora (nessun test automatico per `App.jsx`, controllo statico)**

Run: `cd frontend-mobile && npx tsc --noEmit --allowJs --checkJs false App.jsx 2>/dev/null; node -e "require('@babel/core').transformFileSync('App.jsx', { presets: ['babel-preset-expo'] })" && echo "App.jsx transpila correttamente"`
Expected: `App.jsx transpila correttamente` (verifica solo che la sintassi sia valida e gli import risolvano, non esegue l'app).

- [ ] **Step 7: Commit**

```bash
git add frontend-mobile/src/utils/sentryScrub.js frontend-mobile/src/__tests__/sentryScrub.test.js frontend-mobile/App.jsx
git commit -m "feat(mobile): scrub sensitive keys from Sentry breadcrumbs/events, parity with backend S.15 (finding #1, Fase B)"
```

---

## Task 9: Gate finale — suite completa, lint, riepilogo rollout

- [ ] **Step 1: Suite completa mobile**

Run: `cd frontend-mobile && npm test`
Expected: tutti verdi, zero regressioni rispetto al baseline pre-piano. Il numero di test è salito rispetto al baseline (nuovi file: `secureAuthStorage.test.js`, `authService.test.js`, `apiClient.test.js`, `ChangePasswordScreen.test.jsx`, `sentryScrub.test.js`, più le estensioni a `RootNavigator.test.jsx`/`LoginScreen.test.jsx`) — verificare che nessun test PREESISTENTE sia passato da PASS a FAIL.

- [ ] **Step 2: Verifica grep — nessun residuo di `AsyncStorage` sulle 3 chiavi sensibili nei file toccati**

Run: `cd frontend-mobile && grep -n "AsyncStorage" src/services/authService.js src/services/apiClient.js src/navigation/RootNavigator.jsx src/screens/settings/ChangePasswordScreen.jsx`
Expected: solo le occorrenze attese — `authService.js` (import + `logout`'s `AsyncStorage.multiRemove` sulle 2 cache keys), `RootNavigator.jsx` (import + `AsyncStorage.multiRemove` sulle 2 cache keys). Zero occorrenze in `apiClient.js` e `ChangePasswordScreen.js`.

- [ ] **Step 3: Commit finale di verifica (solo se lo Step 2 ha richiesto una correzione; altrimenti nessun commit qui — l'ultimo commit resta quello del Task 8)**

Se lo Step 2 mostra un residuo inatteso, correggerlo nel file interessato e:

```bash
git add -A
git commit -m "fix(mobile): remove residual AsyncStorage usage on sensitive keys (finding #1, Fase B, gate finale)"
```

- [ ] **Step 4: Promemoria rollout (nessuna azione automatica — decisione dell'utente)**

`expo-secure-store` è un modulo nativo: questo lavoro non è distribuibile via OTA (`expo-updates`). Prima che raggiunga un utente reale serve una nuova build nativa (bump `buildNumber`/`versionCode` in `app.json`, build Codemagic, submit TestFlight/Play Store) — stesso processo già seguito per la Build 34. Non è uno step di questo piano: il bump/build è una decisione di rilascio separata, da fare quando l'utente sceglie di includere questo fix nella prossima build.

---

## Self-Review (eseguito durante la scrittura del piano)

**1. Copertura spec:** ogni sezione di `2026-08-07-mobile-secure-token-storage-design.md` è coperta — Architettura/API (Task 2-6), Migrazione forza re-login (Task 5, cold-start), verifica `allowBackup` (nessun task, già verificato in fase di design, documentato nello spec, nessuna azione di codice richiesta), Error Handling (Task 2 + Task 6/7), Sentry Scrubbing (Task 8), Testing (ogni task include il proprio), File Structure (coincide 1:1 con l'elenco qui sopra).

**2. Scan placeholder:** nessun "TBD"/"TODO"/"add appropriate handling" nel piano — ogni step ha codice completo o un comando eseguibile con output atteso concreto.

**3. Coerenza dei tipi/nomi:** `secureAuthStorage.{getToken,getRefreshToken,getUser,setSession,setTokenPair,clearSession}` e `SecureStorageError` sono usati con la stessa firma in tutti i task (2 li definisce, 3-7 li consumano) — verificato per corrispondenza esatta dei nomi di parametri (`token`/`refreshToken`/`user`) task per task.
