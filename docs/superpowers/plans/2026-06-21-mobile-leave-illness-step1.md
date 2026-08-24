# Mobile Leave & Illness Step 1 — Implementation Plan (v2 — correzioni applicate)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere tab bar di navigazione + schermata Richiesta Ferie + schermata Comunicazione Malattia all'app mobile Expo SDK 54, poi fare una build iOS su Codemagic per TestFlight. Tutte le correzioni identificate nella code review sono incorporate con test TDD per le fix critiche/alte.

**Architecture:** Si aggiunge `@react-navigation/bottom-tabs` come livello di navigazione principale (5 tab: Badge, Ferie, Malattia, Turni, Presenze). `LoginScreen` → `MainTabs`. La tab Badge contiene uno Stack annidato per QRScanner + Success. `LeaveRequestScreen` e `IllnessReportScreen` sono nuove schermate flat. `PresenzaTabScreen` legge il ruolo da AsyncStorage e monta `MyPresencesScreen` (employee) o `StorePresencesScreen` (manager/admin). Utility `dateUtils.js` centralizza `toISO()` con fix timezone (usa getter locali, non UTC).

**Tech Stack:** Expo SDK 54, React Navigation 7.x, `@react-navigation/bottom-tabs`, `@react-native-community/datetimepicker`, Ionicons (bundled), Axios via `apiClient.js`, Jest (utility tests), Codemagic CI/CD.

**Demo accounts (post-Session-46):** `maria@badge.local` = employee, `pino@badge.local` = manager, `pippo@badge.local` = admin.

**Backend API endpoints già esistenti in produzione:**
- `POST /api/v1/leaves` body: `{leave_type, start_date, end_date, reason}`
- `GET /api/v1/leaves` params: `{limit}` — lista richieste utente corrente
- `GET /api/v1/leaves/balance` — saldi per tipo
- `POST /api/v1/illnesses/report` body: `{start_date, end_date, reason}`
- `GET /api/v1/illnesses/by-date-range` params: `{start_date, end_date}`

**Ruoli backend (valori esatti in `req.user.role`):** `'admin'`, `'manager'`, `'employee'`

---

## Correzioni incorporate (rispetto alla v1 del piano)

| Priorità | Correzione |
|----------|-----------|
| 🔴 Critico | `toISO()` estratta in `dateUtils.js` — usa getter locali, non `toISOString()` (timezone bug) |
| 🔴 Critico | `TODAY` spostato dentro il component (era stale a livello di modulo) |
| 🟠 Alto | `StorePresencesScreen`: rimosso `navigation.replace('CheckIn')` — rompeva in contesto tab |
| 🟠 Alto | Tutti i before/after code basati sul codice attuale dei file (letti prima della v2) |
| 🟠 Alto | `MyPresencesScreen` e `StorePresencesScreen`: back button rimosso (codice attuale incluso) |
| 🟠 Alto | `PresenzaTabScreen` accetta role `'manager'` E `'admin'` (il vecchio check era solo `'manager'`) |
| 🟡 Medio | `codemagic.yaml`: code signing solo in YAML (rimosso Step 6D.1 UI che era duplicato) |
| 🟡 Medio | `endpoints.js` — step legge il file attuale prima di sovrascrivere |
| 🟡 Medio | `buildNumber` "16" verificato nel file reale → incremento a "17" confermato |
| 🟢 Minore | `npx expo doctor` aggiunto prima del Task Codemagic |
| 🟢 Minore | Password demo: recuperate da SSM con comando esplicito |

---

## File Map

| Azione | File |
|--------|------|
| Create | `frontend-mobile/src/utils/dateUtils.js` — `toISO()` e `formatDateIT()` timezone-correct |
| Create | `frontend-mobile/src/__tests__/dateUtils.test.js` — unit test TDD |
| Modify | `frontend-mobile/src/config/endpoints.js` — aggiunge LEAVE_*, ILLNESS_*, LEAVE_TYPES, fix DEMO_ACCOUNTS |
| Modify | `frontend-mobile/src/navigation/RootNavigator.jsx` — bottom tab bar |
| Create | `frontend-mobile/src/screens/presences/PresenzaTabScreen.jsx` — wrapper role-based |
| Modify | `frontend-mobile/src/screens/auth/LoginScreen.jsx` — riga 25: `'CheckIn'` → `'Main'` |
| Modify | `frontend-mobile/src/screens/checkin/CheckInScreen.jsx` — rimuovi secondaryButtons block |
| Modify | `frontend-mobile/src/screens/schedule/MyScheduleScreen.jsx` — rimuovi back button |
| Modify | `frontend-mobile/src/screens/presences/MyPresencesScreen.jsx` — rimuovi back button |
| Modify | `frontend-mobile/src/screens/presences/StorePresencesScreen.jsx` — rimuovi back button + role redirect |
| Create | `frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx` |
| Create | `frontend-mobile/src/screens/illness/IllnessReportScreen.jsx` |
| Create | `codemagic.yaml` (root del repo) |

---

## Task 0: Installa dipendenze

**Files:** `frontend-mobile/package.json`

- [ ] **Step 0.1: Installa bottom-tabs e datetimepicker**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
npx expo install @react-navigation/bottom-tabs @react-native-community/datetimepicker
```

Atteso: `package.json` aggiornato con le due dipendenze, nessun errore.

- [ ] **Step 0.2: Installa Jest per unit test utility (solo dev)**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
npm install --save-dev jest babel-jest @babel/preset-env
```

- [ ] **Step 0.3: Crea `babel.config.js` per Jest**

Se non esiste già un `babel.config.js`, crealo:

```bash
ls "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile/babel.config.js" 2>/dev/null || echo "MISSING"
```

Se manca, crea `frontend-mobile/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['@babel/preset-env', { targets: { node: 'current' } }],
    ],
  };
};
```

- [ ] **Step 0.4: Aggiungi script test a `package.json`**

Aggiungi in `frontend-mobile/package.json` → sezione `"scripts"`:

```json
"test": "jest src/__tests__/",
"test:watch": "jest src/__tests__/ --watch"
```

E aggiungi campo `"jest"` nella root di `package.json`:

```json
"jest": {
  "testEnvironment": "node",
  "transform": {
    "^.+\\.js$": "babel-jest"
  }
}
```

- [ ] **Step 0.5: Commit**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
git add package.json babel.config.js
git commit -m "chore(mobile): add bottom-tabs, datetimepicker, jest dev setup"
```

---

## Task 1: `dateUtils.js` + unit tests TDD (fix critica timezone)

**Files:**
- Create: `frontend-mobile/src/utils/dateUtils.js`
- Create: `frontend-mobile/src/__tests__/dateUtils.test.js`

Questa task risolve il bug critico: `new Date().toISOString()` restituisce data UTC, non locale. In Italia (UTC+2), alle 00:30 del 21 giugno, `toISOString()` darebbe `'2026-06-20'`. La fix usa getter locali (`getFullYear/Month/Date`).

Il `TODAY` era definito a livello di modulo (fuori dal componente), rendendolo stale se l'app resta in background dopo la mezzanotte. La fix spiega agli screen di calcolare `today()` come funzione, non costante.

### Step TDD: scrivi test PRIMA del codice

- [ ] **Step 1.1: Crea `src/__tests__/dateUtils.test.js`**

```bash
mkdir -p "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile/src/__tests__"
```

Crea `frontend-mobile/src/__tests__/dateUtils.test.js`:

```js
const { toISO, formatDateIT, today } = require('../utils/dateUtils');

describe('toISO', () => {
  test('returns YYYY-MM-DD format', () => {
    const d = new Date(2026, 5, 21, 10, 0, 0); // June 21 10:00 local
    expect(toISO(d)).toBe('2026-06-21');
  });

  test('pads single-digit months', () => {
    const d = new Date(2026, 0, 5, 10, 0, 0); // January 5
    expect(toISO(d)).toBe('2026-01-05');
  });

  test('pads single-digit days', () => {
    const d = new Date(2026, 11, 3, 10, 0, 0); // December 3
    expect(toISO(d)).toBe('2026-12-03');
  });

  test('uses LOCAL date getters, not UTC (timezone safety)', () => {
    // Simulate a Date whose UTC date differs from local date
    // e.g. Italy UTC+2: 00:30 local = 22:30 the day before in UTC
    // We can't control TZ in tests, but we can verify the implementation
    // uses getFullYear/getMonth/getDate (local) not toISOString() (UTC).
    // We do this by passing a mock Date object.
    const mockDate = {
      getFullYear: () => 2026,
      getMonth: () => 5,  // June (0-indexed)
      getDate: () => 21,
      // toISOString() would return a different (wrong) date if timezone offset exists
      toISOString: () => '2026-06-20T22:00:00.000Z',
    };
    // With the OLD toISOString() approach: '2026-06-20' (WRONG)
    // With the NEW getters approach: '2026-06-21' (CORRECT)
    expect(toISO(mockDate)).toBe('2026-06-21');
  });

  test('handles year boundary', () => {
    const d = new Date(2025, 11, 31, 10, 0, 0); // Dec 31
    expect(toISO(d)).toBe('2025-12-31');
  });
});

describe('formatDateIT', () => {
  test('formats YYYY-MM-DD to DD/MM/YYYY', () => {
    expect(formatDateIT('2026-06-21')).toBe('21/06/2026');
  });

  test('returns — for null', () => {
    expect(formatDateIT(null)).toBe('—');
  });

  test('returns — for undefined', () => {
    expect(formatDateIT(undefined)).toBe('—');
  });

  test('pads single digits in output', () => {
    expect(formatDateIT('2026-01-05')).toBe('05/01/2026');
  });
});

describe('today', () => {
  test('returns a Date object', () => {
    const result = today();
    expect(result).toBeInstanceOf(Date);
  });

  test('returns a date with time set to midnight', () => {
    const result = today();
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  test('returns current local date', () => {
    const result = today();
    const now = new Date();
    expect(result.getFullYear()).toBe(now.getFullYear());
    expect(result.getMonth()).toBe(now.getMonth());
    expect(result.getDate()).toBe(now.getDate());
  });

  test('calling today() twice returns equal dates (no stale reference)', () => {
    const a = today();
    const b = today();
    // Each call creates a new object (no module-level cache)
    expect(a).not.toBe(b);
    expect(a.getTime()).toBe(b.getTime());
  });
});
```

- [ ] **Step 1.2: Esegui test — devono FALLIRE (file non esiste)**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
npm test 2>&1 | head -30
```

Atteso: `Cannot find module '../utils/dateUtils'` — conferma che i test esistono ma il codice no.

- [ ] **Step 1.3: Crea `src/utils/dateUtils.js`**

```js
/**
 * Date utilities for mobile app.
 * Uses local getters (getFullYear/Month/Date) — NOT toISOString() — to avoid
 * timezone bugs where Italian users (UTC+2) would see the previous day after midnight.
 */

/**
 * Formats a Date to 'YYYY-MM-DD' using LOCAL time.
 * @param {Date|{getFullYear:()=>number,getMonth:()=>number,getDate:()=>number}} d
 * @returns {string}
 */
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Formats 'YYYY-MM-DD' string to Italian 'DD/MM/YYYY'.
 * @param {string|null|undefined} dateStr
 * @returns {string}
 */
function formatDateIT(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Returns today's date at midnight local time.
 * Call this inside components — never cache at module level.
 * @returns {Date}
 */
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

module.exports = { toISO, formatDateIT, today };
```

- [ ] **Step 1.4: Esegui test — devono passare**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
npm test 2>&1
```

Atteso:
```
PASS  src/__tests__/dateUtils.test.js
  toISO
    ✓ returns YYYY-MM-DD format
    ✓ pads single-digit months
    ✓ pads single-digit days
    ✓ uses LOCAL date getters, not UTC (timezone safety)
    ✓ handles year boundary
  formatDateIT
    ✓ formats YYYY-MM-DD to DD/MM/YYYY
    ✓ returns — for null
    ✓ returns — for undefined
    ✓ pads single digits in output
  today
    ✓ returns a Date object
    ✓ returns a date with time set to midnight
    ✓ returns current local date
    ✓ calling today() twice returns equal dates (no stale reference)

Tests: 13 passed, 13 total
```

- [ ] **Step 1.5: Commit**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
git add src/utils/dateUtils.js src/__tests__/dateUtils.test.js package.json babel.config.js
git commit -m "feat(mobile): dateUtils.js — toISO/formatDateIT/today with timezone fix + 13 unit tests"
```

---

## Task 2: Aggiorna `endpoints.js`

**Files:** `frontend-mobile/src/config/endpoints.js`

Il file attuale ha:
- `DEMO_ACCOUNTS.employee.email = 'alice.neri@employee.it'` (stale — alice non esiste più)
- `DEMO_ACCOUNTS.manager.email = 'diego@badge.local'` (stale)
- Mancano: `LEAVES_LIST, LEAVES_CREATE, LEAVES_BALANCE, ILLNESS_REPORT, ILLNESS_LIST`
- Manca: `LEAVE_TYPES`

- [ ] **Step 2.1: Sostituisci `endpoints.js`**

Sostituisci `frontend-mobile/src/config/endpoints.js` con:

```js
/**
 * Centralized app configuration
 * Single source of truth for all constants, endpoints, and UI config
 */

export const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.dataxiom.it';

export const ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/api/v1/auth/login',
  AUTH_LOGOUT: '/api/v1/auth/logout',
  AUTH_REFRESH: '/api/v1/auth/refresh',

  // Check-ins
  CHECKINS_POST: '/api/v1/checkins',
  CHECKINS_LIST: '/api/v1/checkins',

  // Consent (GDPR Art. 7)
  CONSENT_GPS_ACCEPTANCE: '/api/v1/consent/gps-acceptance',

  // Shifts
  SHIFTS_MY_SCHEDULE: '/api/v1/shifts/my-schedule',

  // Leaves (ferie)
  LEAVES_LIST: '/api/v1/leaves',
  LEAVES_CREATE: '/api/v1/leaves',
  LEAVES_BALANCE: '/api/v1/leaves/balance',

  // Illnesses (malattia)
  ILLNESS_REPORT: '/api/v1/illnesses/report',
  ILLNESS_LIST: '/api/v1/illnesses/by-date-range',

  // Health
  HEALTH: '/health',
};

// Leave types — all three shown per user decision
export const LEAVE_TYPES = [
  { value: 'FERIE_1', label: 'Ferie ordinarie' },
  { value: 'FERIE_2', label: 'Ex-festività' },
  { value: 'FERIE_3', label: 'Permessi ROL' },
];

// Shift configuration (for Planning page and schedule views)
export const SHIFTS_CONFIG = {
  LABELS: {
    m: 'Mattino',
    p: 'Pomeriggio',
    s: 'Sera',
    R: 'Riposo',
  },
  COLORS: {
    m: '#1E3A5F',
    p: '#B45309',
    s: '#7C3AED',
    R: '#6B7280',
  },
  ICONS: {
    m: '🌅',
    p: '☀️',
    s: '🌙',
    R: '❌',
  },
};

// Check-in configuration (for MyPresencesScreen)
export const CHECKINS_CONFIG = {
  TYPE_COLORS: {
    IN: '#166534',
    OUT: '#7C3AED',
  },
  TYPE_ICONS: {
    IN: '→',
    OUT: '←',
  },
  DEFAULTS: {
    LIMIT: 50,
  },
};

// Demo account emails (post-Session-46 cleanup)
// Passwords are never stored client-side — set via DEMO_*_PASSWORD env vars on the backend
export const DEMO_ACCOUNTS = {
  employee: { email: 'maria@badge.local' },
  manager: { email: 'pino@badge.local' },
  admin: { email: 'pippo@badge.local' },
  // Legacy alias used by LoginScreen __DEV__ hint
  email: 'maria@badge.local',
};

// Timing configuration (in milliseconds)
export const TIMING = {
  API_TIMEOUT: 15000,
  CLOCK_TICK: 1000,
  SUCCESS_AUTO_RETURN: 5000,
};

// Storage keys for AsyncStorage persistence
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'badge_auth_token',
  REFRESH_TOKEN: 'badge_refresh_token',
  USER_DATA: 'badge_user',
};

export default { API_BASE, ENDPOINTS, LEAVE_TYPES, SHIFTS_CONFIG, CHECKINS_CONFIG, DEMO_ACCOUNTS, TIMING, STORAGE_KEYS };
```

- [ ] **Step 2.2: Commit**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
git add src/config/endpoints.js
git commit -m "feat(mobile): endpoints.js — add leave/illness endpoints, LEAVE_TYPES, fix demo accounts"
```

---

## Task 3: Navigation restructure + correzioni schermate esistenti

**Files:**
- Create: `frontend-mobile/src/screens/presences/PresenzaTabScreen.jsx`
- Modify: `frontend-mobile/src/navigation/RootNavigator.jsx`
- Modify: `frontend-mobile/src/screens/auth/LoginScreen.jsx`
- Modify: `frontend-mobile/src/screens/checkin/CheckInScreen.jsx`
- Modify: `frontend-mobile/src/screens/schedule/MyScheduleScreen.jsx`
- Modify: `frontend-mobile/src/screens/presences/MyPresencesScreen.jsx`
- Modify: `frontend-mobile/src/screens/presences/StorePresencesScreen.jsx`

### Step 3.1: Crea `PresenzaTabScreen.jsx`

```bash
# Il file non esiste ancora
```

Crea `frontend-mobile/src/screens/presences/PresenzaTabScreen.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import authService from '../../services/authService';
import MyPresencesScreen from './MyPresencesScreen';
import StorePresencesScreen from './StorePresencesScreen';

export default function PresenzaTabScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService.getUser().then(setUser).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F2ED' }}>
        <ActivityIndicator size="large" color="#1E3A5F" />
      </View>
    );
  }

  // Accetta sia 'manager' che 'admin' — ruoli esatti dal backend
  const isManager = user?.role === 'manager' || user?.role === 'admin';
  return isManager
    ? <StorePresencesScreen navigation={navigation} />
    : <MyPresencesScreen navigation={navigation} />;
}
```

### Step 3.2: Riscrivi `RootNavigator.jsx`

Sostituisci **interamente** `frontend-mobile/src/navigation/RootNavigator.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config/endpoints';
import { navigationRef } from '../utils/navigationRef';

import LoginScreen from '../screens/auth/LoginScreen';
import CheckInScreen from '../screens/checkin/CheckInScreen';
import QRScannerScreen from '../screens/checkin/QRScannerScreen';
import SuccessScreen from '../screens/checkin/SuccessScreen';
import MyScheduleScreen from '../screens/schedule/MyScheduleScreen';
import PresenzaTabScreen from '../screens/presences/PresenzaTabScreen';
import LeaveRequestScreen from '../screens/leave/LeaveRequestScreen';
import IllnessReportScreen from '../screens/illness/IllnessReportScreen';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const CheckInStack = createNativeStackNavigator();

function CheckInStackNavigator() {
  return (
    <CheckInStack.Navigator screenOptions={{ headerShown: false }}>
      <CheckInStack.Screen name="CheckInMain" component={CheckInScreen} />
      <CheckInStack.Screen name="QRScanner" component={QRScannerScreen} />
      <CheckInStack.Screen name="Success" component={SuccessScreen} />
    </CheckInStack.Navigator>
  );
}

const TAB_ICONS = {
  Badge: 'qr-code-outline',
  Ferie: 'calendar-outline',
  Malattia: 'medical-outline',
  Turni: 'time-outline',
  Presenze: 'people-outline',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1E3A5F',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name] || 'ellipse-outline'} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Badge" component={CheckInStackNavigator} options={{ title: 'Badge' }} />
      <Tab.Screen name="Ferie" component={LeaveRequestScreen} />
      <Tab.Screen name="Malattia" component={IllnessReportScreen} />
      <Tab.Screen name="Turni" component={MyScheduleScreen} />
      <Tab.Screen name="Presenze" component={PresenzaTabScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN).then(token => {
      setInitialRoute(token ? 'Main' : 'Login');
    });
  }, []);

  if (initialRoute === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E3A5F' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
        <RootStack.Screen name="Login" component={LoginScreen} />
        <RootStack.Screen name="Main" component={MainTabs} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
```

### Step 3.3: Aggiorna `LoginScreen.jsx` — riga 25

**PRIMA** (riga 25, codice attuale verificato):
```jsx
navigation.navigate('CheckIn');
```

**DOPO:**
```jsx
navigation.navigate('Main');
```

Cambia solo quella riga. Il try/catch e tutto il resto rimane identico.

### Step 3.4: Semplifica `CheckInScreen.jsx` — rimuovi secondaryButtons

**PRIMA** (righe 89-115, codice attuale verificato):
```jsx
        <View style={styles.secondaryButtons}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('MySchedule')}
          >
            <Text style={styles.secondaryIcon}>📅</Text>
            <Text style={styles.secondaryText}>I Miei Turni</Text>
          </TouchableOpacity>

          {user?.role === 'manager' ? (
            <TouchableOpacity
              style={[styles.secondaryButton, styles.secondaryButtonManager]}
              onPress={() => navigation.navigate('StorePresences')}
            >
              <Text style={styles.secondaryIcon}>👥</Text>
              <Text style={[styles.secondaryText, styles.secondaryTextManager]}>Presenze Store</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('MyPresences')}
            >
              <Text style={styles.secondaryIcon}>📋</Text>
              <Text style={styles.secondaryText}>Le Mie Presenze</Text>
            </TouchableOpacity>
          )}
        </View>
```

**DOPO:** rimuovi tutto il blocco sopra.

Poi nella StyleSheet rimuovi questi stili (righe 147-157):
```jsx
  secondaryButtons: { flexDirection: 'row', gap: 12 },
  secondaryButton: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20,
    alignItems: 'center', elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  secondaryIcon: { fontSize: 32, marginBottom: 8 },
  secondaryText: { color: '#1E3A5F', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  secondaryButtonManager: { borderWidth: 2, borderColor: '#0F4C2A' },
  secondaryTextManager: { color: '#0F4C2A' },
```

### Step 3.5: Rimuovi back button da `MyScheduleScreen.jsx`

**PRIMA** (righe 79-83, codice attuale verificato):
```jsx
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>I Miei Turni</Text>
        <View style={{ width: 80 }} />
      </View>
```

**DOPO:**
```jsx
      <View style={[styles.header, { justifyContent: 'center' }]}>
        <Text style={styles.title}>I Miei Turni</Text>
      </View>
```

Rimuovi anche lo stile `back` dalla StyleSheet (riga 164):
```jsx
  back: { color: '#93C5FD', fontSize: 16, width: 80 },
```

### Step 3.6: Rimuovi back button da `MyPresencesScreen.jsx`

**PRIMA** (righe 53-59, codice attuale verificato):
```jsx
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Le Mie Presenze</Text>
        <View style={{ width: 80 }} />
      </View>
```

**DOPO:**
```jsx
      <View style={[styles.header, { justifyContent: 'center' }]}>
        <Text style={styles.title}>Le Mie Presenze</Text>
      </View>
```

Rimuovi stile `back` dalla StyleSheet.

### Step 3.7: Fix `StorePresencesScreen.jsx` — back button + role redirect

**Problema critico:** `StorePresencesScreen` fa `navigation.replace('CheckIn')` all'interno di un `useEffect`. In contesto tab, `'CheckIn'` non è una rotta diretta del Tab navigator → crash. Questo check era necessario quando la schermata era accessibile direttamente; ora `PresenzaTabScreen` gestisce il routing per ruolo, quindi il check è obsoleto e va rimosso.

**Fix 1 — rimuovi il role-redirect useEffect** (righe 73-77, codice attuale verificato):
```jsx
  useEffect(() => {
    authService.getUser().then(u => {
      if (u?.role !== 'manager') navigation.replace('CheckIn');
    });
  }, []);
```
→ **Rimuovi questo intero `useEffect`.**

Rimuovi anche l'import di `authService` se non usato altrove nel file:
```jsx
import authService from '../../services/authService';
```
→ **Rimuovi questa riga** (non è usata da nessun'altra parte in `StorePresencesScreen`).

**Fix 2 — rimuovi back button** (righe 129-134, codice attuale verificato):
```jsx
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Presenze Store</Text>
        <View style={{ width: 80 }} />
      </View>
```

**DOPO:**
```jsx
      <View style={[styles.header, { justifyContent: 'center' }]}>
        <Text style={styles.title}>Presenze Store</Text>
      </View>
```

Rimuovi stile `back` dalla StyleSheet.

### Step 3.8: Commit

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
git add \
  src/navigation/RootNavigator.jsx \
  src/screens/presences/PresenzaTabScreen.jsx \
  src/screens/auth/LoginScreen.jsx \
  src/screens/checkin/CheckInScreen.jsx \
  src/screens/schedule/MyScheduleScreen.jsx \
  src/screens/presences/MyPresencesScreen.jsx \
  src/screens/presences/StorePresencesScreen.jsx
git commit -m "feat(mobile): bottom tab bar — Badge/Ferie/Malattia/Turni/Presenze + screen cleanup"
```

---

## Task 4: `LeaveRequestScreen.jsx`

**Files:**
- Create: `frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx`

Usa `toISO()` e `formatDateIT()` da `dateUtils.js`. `today()` viene chiamata dentro il component (non a livello di modulo).

- [ ] **Step 4.1: Crea la directory**

```bash
mkdir -p "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile/src/screens/leave"
```

- [ ] **Step 4.2: Crea `LeaveRequestScreen.jsx`**

Crea `frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiClient from '../../services/apiClient';
import { ENDPOINTS, LEAVE_TYPES } from '../../config/endpoints';
import { toISO, formatDateIT, today } from '../../utils/dateUtils';

const STATUS_COLORS = { PENDING: '#B45309', APPROVED: '#166534', REJECTED: '#991B1B' };
const STATUS_LABELS = { PENDING: 'In attesa', APPROVED: 'Approvata', REJECTED: 'Rifiutata' };

export default function LeaveRequestScreen() {
  const [balance, setBalance] = useState([]);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [leaveType, setLeaveType] = useState('FERIE_1');
  const [startDate, setStartDate] = useState(() => today());
  const [endDate, setEndDate] = useState(() => today());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadBalance = useCallback(() => {
    setBalanceLoading(true);
    apiClient.get(ENDPOINTS.LEAVES_BALANCE)
      .then(r => setBalance(r.data.data || []))
      .catch(() => setBalance([]))
      .finally(() => setBalanceLoading(false));
  }, []);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    apiClient.get(ENDPOINTS.LEAVES_LIST, { params: { limit: 5 } })
      .then(r => setRequests(r.data.data || []))
      .catch(() => setRequests([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    loadBalance();
    loadHistory();
  }, [loadBalance, loadHistory]);

  const handleSubmit = async () => {
    if (endDate < startDate) {
      Alert.alert('Errore', 'La data di fine deve essere uguale o successiva alla data di inizio.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(ENDPOINTS.LEAVES_CREATE, {
        leave_type: leaveType,
        start_date: toISO(startDate),
        end_date: toISO(endDate),
        reason: reason.trim() || null,
      });
      Alert.alert('✅ Richiesta inviata', 'La tua richiesta di ferie è stata inviata al manager per approvazione.');
      setReason('');
      setStartDate(today());
      setEndDate(today());
      loadBalance();
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Errore invio richiesta';
      Alert.alert('Errore', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Richiesta Ferie</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Saldi */}
        <Text style={styles.sectionTitle}>Saldo disponibile</Text>
        <View style={styles.balanceRow}>
          {balanceLoading ? (
            <ActivityIndicator color="#1E3A5F" />
          ) : balance.length === 0 ? (
            <Text style={styles.emptyText}>Saldi non disponibili</Text>
          ) : (
            balance
              .filter(b => ['FERIE_1', 'FERIE_2', 'FERIE_3'].includes(b.leave_type))
              .map(b => {
                const type = LEAVE_TYPES.find(t => t.value === b.leave_type);
                const isActive = leaveType === b.leave_type;
                return (
                  <TouchableOpacity
                    key={b.leave_type}
                    style={[styles.balanceCard, isActive && styles.balanceCardActive]}
                    onPress={() => setLeaveType(b.leave_type)}
                  >
                    <Text style={[styles.balanceDays, isActive && styles.balanceDaysActive]}>
                      {b.remaining_days ?? '—'}
                    </Text>
                    <Text style={[styles.balanceLabel, isActive && styles.balanceLabelActive]}>
                      {type?.label ?? b.leave_type}
                    </Text>
                  </TouchableOpacity>
                );
              })
          )}
        </View>

        {/* Tipo ferie (chips) */}
        <Text style={styles.label}>Tipo ferie</Text>
        <View style={styles.typeRow}>
          {LEAVE_TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, leaveType === t.value && styles.typeChipActive]}
              onPress={() => setLeaveType(t.value)}
            >
              <Text style={[styles.typeChipText, leaveType === t.value && styles.typeChipTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Data inizio */}
        <Text style={styles.label}>Data inizio</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => { setShowStartPicker(true); setShowEndPicker(false); }}
        >
          <Text style={styles.dateButtonText}>📅  {toISO(startDate)}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={startDate}
              mode="date"
              display="spinner"
              minimumDate={today()}
              locale="it-IT"
              onChange={(_, d) => { if (d) setStartDate(d); }}
              style={styles.picker}
            />
            <TouchableOpacity style={styles.doneButton} onPress={() => setShowStartPicker(false)}>
              <Text style={styles.doneButtonText}>Fine</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Data fine */}
        <Text style={styles.label}>Data fine</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => { setShowEndPicker(true); setShowStartPicker(false); }}
        >
          <Text style={styles.dateButtonText}>📅  {toISO(endDate)}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={endDate}
              mode="date"
              display="spinner"
              minimumDate={startDate}
              locale="it-IT"
              onChange={(_, d) => { if (d) setEndDate(d); }}
              style={styles.picker}
            />
            <TouchableOpacity style={styles.doneButton} onPress={() => setShowEndPicker(false)}>
              <Text style={styles.doneButtonText}>Fine</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Motivazione */}
        <Text style={styles.label}>Motivazione (opzionale)</Text>
        <TextInput
          style={styles.textInput}
          value={reason}
          onChangeText={setReason}
          placeholder="Es. vacanze estive, viaggio familiare"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={2}
          maxLength={500}
        />

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.submitButtonText}>Invia Richiesta Ferie</Text>
          }
        </TouchableOpacity>

        {/* Storico ultime richieste */}
        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Ultime richieste</Text>
        {historyLoading ? (
          <ActivityIndicator color="#1E3A5F" style={{ marginVertical: 16 }} />
        ) : requests.length === 0 ? (
          <Text style={styles.emptyText}>Nessuna richiesta registrata.</Text>
        ) : (
          requests.map(r => (
            <View key={r.id} style={styles.historyItem}>
              <View style={styles.historyLeft}>
                <Text style={styles.historyType}>
                  {LEAVE_TYPES.find(t => t.value === r.leave_type)?.label ?? r.leave_type}
                </Text>
                <Text style={styles.historyDates}>
                  {formatDateIT(r.start_date)} → {formatDateIT(r.end_date)}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[r.status] ?? '#6B7280') + '20' }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[r.status] ?? '#6B7280' }]}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: { backgroundColor: '#1E3A5F', paddingHorizontal: 20, paddingVertical: 16 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  balanceRow: { flexDirection: 'row', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  balanceCard: {
    flex: 1, minWidth: 90, backgroundColor: '#FFFFFF', borderRadius: 12,
    padding: 14, alignItems: 'center', borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  balanceCardActive: { borderColor: '#1E3A5F', backgroundColor: '#EFF6FF' },
  balanceDays: { fontSize: 28, fontWeight: '700', color: '#374151' },
  balanceDaysActive: { color: '#1E3A5F' },
  balanceLabel: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 4 },
  balanceLabelActive: { color: '#1E3A5F', fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 20 },
  typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#D1D5DB',
  },
  typeChipActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  typeChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  typeChipTextActive: { color: '#FFFFFF' },
  dateButton: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#D1D5DB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  dateButtonText: { fontSize: 16, color: '#1E3A5F', fontWeight: '500' },
  pickerContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  picker: { height: 150 },
  doneButton: { backgroundColor: '#1E3A5F', paddingVertical: 10, alignItems: 'center' },
  doneButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  textInput: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#D1D5DB', fontSize: 15, color: '#1F2937',
    minHeight: 70, textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#1E3A5F', borderRadius: 12, padding: 18,
    alignItems: 'center', marginTop: 24,
    shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitButtonDisabled: { opacity: 0.55 },
  submitButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  historyItem: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  historyLeft: { flex: 1, marginRight: 8 },
  historyType: { fontSize: 14, fontWeight: '600', color: '#2A2520' },
  historyDates: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 4 },
});
```

- [ ] **Step 4.3: Commit**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
git add src/screens/leave/
git commit -m "feat(mobile): LeaveRequestScreen — ferie con saldo, date picker, storico"
```

---

## Task 5: `IllnessReportScreen.jsx`

**Files:**
- Create: `frontend-mobile/src/screens/illness/IllnessReportScreen.jsx`

- [ ] **Step 5.1: Crea la directory**

```bash
mkdir -p "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile/src/screens/illness"
```

- [ ] **Step 5.2: Crea `IllnessReportScreen.jsx`**

Crea `frontend-mobile/src/screens/illness/IllnessReportScreen.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiClient from '../../services/apiClient';
import { ENDPOINTS } from '../../config/endpoints';
import { toISO, formatDateIT, today } from '../../utils/dateUtils';

export default function IllnessReportScreen() {
  const [startDate, setStartDate] = useState(() => today());
  const [endDate, setEndDate] = useState(() => today());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    apiClient.get(ENDPOINTS.ILLNESS_LIST, {
      params: {
        start_date: toISO(threeMonthsAgo),
        end_date: toISO(now),
      },
    })
      .then(r => setReports((r.data.data || []).slice(0, 5)))
      .catch(() => setReports([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSubmit = async () => {
    if (endDate < startDate) {
      Alert.alert('Errore', 'La data di fine deve essere uguale o successiva alla data di inizio.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(ENDPOINTS.ILLNESS_REPORT, {
        start_date: toISO(startDate),
        end_date: toISO(endDate),
        reason: reason.trim() || null,
      });
      Alert.alert(
        '✅ Comunicazione inviata',
        'La comunicazione di malattia è stata registrata. Ricordati di consegnare il certificato medico in azienda entro 2 giorni.'
      );
      setReason('');
      setStartDate(today());
      setEndDate(today());
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Errore invio comunicazione';
      Alert.alert('Errore', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Comunicazione Malattia</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>🏥</Text>
          <Text style={styles.infoText}>
            Comunica il periodo di malattia il prima possibile. Il certificato medico va consegnato in azienda entro 2 giorni lavorativi.
          </Text>
        </View>

        {/* Data inizio */}
        <Text style={styles.label}>Data inizio malattia</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => { setShowStartPicker(true); setShowEndPicker(false); }}
        >
          <Text style={styles.dateButtonText}>📅  {toISO(startDate)}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={startDate}
              mode="date"
              display="spinner"
              locale="it-IT"
              onChange={(_, d) => { if (d) setStartDate(d); }}
              style={styles.picker}
            />
            <TouchableOpacity style={styles.doneButton} onPress={() => setShowStartPicker(false)}>
              <Text style={styles.doneButtonText}>Fine</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Data fine prevista */}
        <Text style={styles.label}>Data fine prevista</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => { setShowEndPicker(true); setShowStartPicker(false); }}
        >
          <Text style={styles.dateButtonText}>📅  {toISO(endDate)}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={endDate}
              mode="date"
              display="spinner"
              minimumDate={startDate}
              locale="it-IT"
              onChange={(_, d) => { if (d) setEndDate(d); }}
              style={styles.picker}
            />
            <TouchableOpacity style={styles.doneButton} onPress={() => setShowEndPicker(false)}>
              <Text style={styles.doneButtonText}>Fine</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Note */}
        <Text style={styles.label}>Note aggiuntive (opzionale)</Text>
        <TextInput
          style={styles.textInput}
          value={reason}
          onChangeText={setReason}
          placeholder="Es. influenza, febbre alta, visita specialistica"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={2}
          maxLength={500}
        />

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.submitButtonText}>Comunica Malattia</Text>
          }
        </TouchableOpacity>

        {/* Storico */}
        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Ultimi 3 mesi</Text>
        {historyLoading ? (
          <ActivityIndicator color="#1E3A5F" style={{ marginVertical: 16 }} />
        ) : reports.length === 0 ? (
          <Text style={styles.emptyText}>Nessuna malattia registrata negli ultimi 3 mesi.</Text>
        ) : (
          reports.map(r => (
            <View key={r.id} style={styles.historyItem}>
              <Text style={styles.historyIcon}>🏥</Text>
              <View style={styles.historyContent}>
                <Text style={styles.historyDates}>
                  {formatDateIT(r.start_date)} → {formatDateIT(r.end_date)}
                </Text>
                {r.reason ? <Text style={styles.historyReason}>{r.reason}</Text> : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: { backgroundColor: '#1E3A5F', paddingHorizontal: 20, paddingVertical: 16 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 48 },
  infoBox: {
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, marginBottom: 4,
    borderLeftWidth: 4, borderLeftColor: '#2563EB',
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  infoIcon: { fontSize: 20 },
  infoText: { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 20 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 20 },
  dateButton: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#D1D5DB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  dateButtonText: { fontSize: 16, color: '#1E3A5F', fontWeight: '500' },
  pickerContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  picker: { height: 150 },
  doneButton: { backgroundColor: '#1E3A5F', paddingVertical: 10, alignItems: 'center' },
  doneButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  textInput: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#D1D5DB', fontSize: 15, color: '#1F2937',
    minHeight: 70, textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#2563EB', borderRadius: 12, padding: 18,
    alignItems: 'center', marginTop: 24,
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitButtonDisabled: { opacity: 0.55 },
  submitButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  historyItem: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderLeftWidth: 3, borderLeftColor: '#2563EB',
  },
  historyIcon: { fontSize: 20 },
  historyContent: { flex: 1 },
  historyDates: { fontSize: 14, fontWeight: '600', color: '#2A2520' },
  historyReason: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 4 },
});
```

- [ ] **Step 5.3: Commit**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
git add src/screens/illness/
git commit -m "feat(mobile): IllnessReportScreen — malattia con date picker e storico"
```

---

## Task 6: Test con Expo Go (pre-build)

Questo task non produce codice. È il collaudo finale su dispositivo prima di investire tempo nella build Codemagic.

- [ ] **Step 6.1: Recupera password demo**

Prima di testare, recupera le password dei demo account:

```bash
aws ssm get-parameter --name "/badge/DEMO_MARIA_PASSWORD" --with-decryption --query "Parameter.Value" --output text 2>/dev/null || echo "SSM non disponibile — usa la password salvata localmente"
aws ssm get-parameter --name "/badge/DEMO_PINO_PASSWORD" --with-decryption --query "Parameter.Value" --output text 2>/dev/null || echo "SSM non disponibile"
```

Se SSM non è disponibile nell'ambiente locale, usa la password dal tuo `.env` o dal file `backend/.env` (`DEMO_MARIA_PASSWORD`).

- [ ] **Step 6.2: Esegui unit test**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
npm test
```

Atteso: 13/13 test passano per `dateUtils.test.js`.

- [ ] **Step 6.3: Avvia Expo Go**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
npx expo start
```

Scansiona il QR con l'app **Expo Go** su iPhone.

- [ ] **Step 6.4: Test employee (maria@badge.local)**

| # | Test | Atteso |
|---|------|--------|
| E1 | App carica → schermata Login blu | Senza errori |
| E2 | Login `maria@badge.local` → 5 tab | Badge, Ferie, Malattia, Turni, Presenze |
| E3 | Tab Badge: solo orologio + bottone QR | Nessun bottone secondario (MySchedule/Presenze rimossi) |
| E4 | Tab Ferie: carte saldo OPPURE "Saldi non disponibili" | Entrambi OK — dipende da DB |
| E5 | Ferie: chip tipo si aggiorna al tap | FERIE_1/2/3 selezionabili |
| E6 | Ferie: premi "Data inizio" → spinner apre | Data oggi locale (NON ieri!) |
| E7 | Ferie: invia richiesta con date valide | Alert ✅ — oppure 400 se saldo zero |
| E8 | Malattia: premi "Data inizio" → spinner apre | Data oggi locale |
| E9 | Malattia: invia comunicazione | Alert ✅ |
| E10 | Tab Turni: turni mese corrente | Lista giorni (nessun back button) |
| E11 | Tab Presenze: check-in di Maria | Lista presenze employee |
| E12 | Logout da tab Badge | Torna a Login |

- [ ] **Step 6.5: Test manager (pino@badge.local)**

| # | Test | Atteso |
|---|------|--------|
| M1 | Login `pino@badge.local` → 5 tab | Identiche |
| M2 | Tab Presenze → StorePresences (presenze sede) | NON reindirizza a Login (vecchio bug rimosso) |
| M3 | Tab Ferie: funziona come employee | Saldo + form attivi |
| M4 | Tab Malattia: funziona come employee | Form + storico attivi |

- [ ] **Step 6.6: Correggi bug trovati e commit finale**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
# (fix eventuali bug)
npm test  # riconferma 13/13
git add -A
git commit -m "fix(mobile): post-test Expo Go corrections"
git push origin main
```

---

## Task 7: Build iOS con Codemagic → TestFlight

### 7A — Prerequisiti locali (~5 min)

- [ ] **Step 7A.1: Verifica buildNumber attuale**

```bash
cat "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile/app.json" | grep buildNumber
```

Atteso: `"buildNumber": "16"`. Il prossimo è `"17"`.

- [ ] **Step 7A.2: `npx expo doctor`**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
npx expo doctor 2>&1
```

Correggi eventuali warning/error prima di procedere.

### 7B — App Store Connect API Key (~10 min, su browser)

- [ ] **Step 7B.1: Crea API Key su ASC**

1. Apri https://appstoreconnect.apple.com
2. **Users and Access** → tab **Integrations** → **App Store Connect API**
3. Clicca **"+"** → nome: `Codemagic` — Role: **Developer**
4. Clicca **Generate** → **Download API Key** (scaricabile **una sola volta**)
5. Annota su un foglio sicuro:
   - **Key ID** (es. `ABC1234DEF`) — colonna "Key ID"
   - **Issuer ID** (es. `12345678-1234-1234-1234-123456789012`) — in cima alla pagina

### 7C — Account Codemagic (~15 min, su browser)

- [ ] **Step 7C.1: Crea account**

1. https://codemagic.io/signup → **"Sign up with GitHub"**
2. Autorizza Codemagic → piano **Free** (500 min/mese)

- [ ] **Step 7C.2: Aggiungi l'app**

1. Dashboard → **"Add application"** → **GitHub**
2. Seleziona il repository `badge` → Framework: **"React Native"**
3. **"Finish: Add application"**

- [ ] **Step 7C.3: Carica la ASC API Key**

1. In Codemagic → la tua app → **"Settings"** → sezione **"Build triggers"** e cerca **"App Store Connect API key"**
   OPPURE: account icon → **"Teams"** → il tuo team → **"Integrations"** → App Store Connect → **"Add API key"**
2. Inserisci: Name `Badge Production`, Issuer ID, Key ID, carica il `.p8`
3. Salva

### 7D — `codemagic.yaml` + buildNumber (~10 min)

- [ ] **Step 7D.1: Crea `codemagic.yaml` nella root del repo**

Crea `/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/codemagic.yaml`:

```yaml
workflows:
  badge-ios-testflight:
    name: Badge System iOS — TestFlight
    max_build_duration: 60
    instance_type: mac_mini_m2
    environment:
      ios_signing:
        distribution_type: app_store
        bundle_identifier: it.dataxiom.badge
        # Codemagic legge questa chiave dalla tua integrazione ASC
        # Nessuna configurazione aggiuntiva nella UI è necessaria
        api_key: Badge Production
      node: v20.x
      xcode: latest
      cocoapods: default
    working_directory: frontend-mobile
    scripts:
      - name: Installa dipendenze npm
        script: npm ci

      - name: Genera progetto nativo iOS
        script: npx expo prebuild --platform ios --clean

      - name: Installa CocoaPods
        script: |
          cd ios
          pod install

      - name: Build IPA
        script: |
          # Se la build fallisce per nome workspace errato, esegui localmente:
          # cd frontend-mobile && npx expo prebuild --platform ios --clean && ls ios/*.xcworkspace
          xcode-project build-ipa \
            --workspace "ios/Badge System.xcworkspace" \
            --scheme "Badge System"

    artifacts:
      - build/ios/ipa/*.ipa
      - /tmp/xcodebuild_logs/*.log

    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true
        beta_groups:
          - App Store Connect Users
```

- [ ] **Step 7D.2: Incrementa buildNumber in `app.json`**

In `frontend-mobile/app.json`, cambia:
```json
"buildNumber": "16",
```
→
```json
"buildNumber": "17",
```

- [ ] **Step 7D.3: Commit e push**

```bash
git add codemagic.yaml frontend-mobile/app.json
git commit -m "feat(ci): codemagic.yaml iOS TestFlight + build 17"
git push origin main
```

### 7E — Avvia build (~5 min + attesa 35-45 min)

- [ ] **Step 7E.1: Avvia la build su Codemagic**

1. In Codemagic → la tua app → **"Start new build"**
2. Branch: `main` — Workflow: `badge-ios-testflight`
3. Clicca **"Start new build"** — attendi 35-45 minuti

- [ ] **Step 7E.2: Se fallisce per nome workspace**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-mobile"
npx expo prebuild --platform ios --clean
ls ios/*.xcworkspace
```

Aggiorna `codemagic.yaml` con il nome esatto trovato, push, riavvia build.

- [ ] **Step 7E.3: Verifica su TestFlight**

1. Quando Codemagic mostra ✅ → apri **TestFlight** sull'iPhone
2. Dovresti vedere "Badge System — Build 17"
3. Installa e ripeti i test E1–M4 del Task 6 sulla build nativa

---

## Checklist finale

- [ ] 13/13 unit test `dateUtils.test.js` passano
- [ ] 5 tab funzionanti su Expo Go (Badge, Ferie, Malattia, Turni, Presenze)
- [ ] Login employee (maria) → tab Presenze mostra le proprie presenze
- [ ] Login manager (pino) → tab Presenze mostra StorePresences SENZA redirect/crash
- [ ] Richiesta ferie inviata → Alert ✅ + storico aggiornato
- [ ] Comunicazione malattia inviata → Alert ✅ + storico aggiornato
- [ ] Date nei form mostrano la data locale corretta (non UTC-1 giorno)
- [ ] Build 17 su TestFlight installata e funzionante su iPhone
- [ ] `npm test` verde nel CI/CD (se configurato)
- [ ] Push su `main`, GitHub Actions verde
