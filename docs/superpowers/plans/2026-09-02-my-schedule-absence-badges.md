# My Schedule Absence Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a distinct badge (Malattia/Ferie/Evento) on days in "I Miei Turni" (`MyScheduleScreen.jsx`) that have no assigned shift but do have an active illness, leave, or event request — instead of the ambiguous `—` used today for both "not planned" and "you're absent".

**Architecture:** A new pure function `resolveAbsenceBadge()` (in a new file `src/utils/absenceBadges.js`) decides, per calendar day, which badge (if any) to show, given the day's shift value and the month's illness/leave/event data. `MyScheduleScreen.jsx` fetches illness/leave/event data in parallel with the existing shifts fetch (3 new calls to already-existing self-service endpoints — no backend changes), waits for all 4 to settle before rendering (no flash), and renders the resolved badge using the same visual component already used for shift badges.

**Tech Stack:** React Native, Jest + `@testing-library/react-native` (existing test setup), axios (`apiClient`), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-02-my-schedule-absence-badges-design.md`

---

## Task 1: `resolveAbsenceBadge()` — pure priority logic + badge config

**Files:**
- Create: `frontend-mobile/src/utils/absenceBadges.js`
- Test: `frontend-mobile/src/__tests__/absenceBadges.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend-mobile/src/__tests__/absenceBadges.test.js`:

```js
import { resolveAbsenceBadge, ABSENCE_BADGES } from '../utils/absenceBadges';

describe('resolveAbsenceBadge', () => {
  test('returns null when a shift is already assigned, even if an illness covers the date', () => {
    const illnesses = [{ start_date: '2026-09-05T00:00:00.000Z', end_date: '2026-09-05T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-05', 'm', illnesses, [], [])).toBeNull();
  });

  test('returns the illness badge when an illness date range covers the date', () => {
    const illnesses = [{ start_date: '2026-08-31T00:00:00.000Z', end_date: '2026-09-05T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-04', null, illnesses, [], [])).toEqual(ABSENCE_BADGES.illness);
  });

  test('illness takes priority over an approved leave on the same date', () => {
    const illnesses = [{ start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    const leaves = [{ status: 'APPROVED', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-04', null, illnesses, leaves, [])).toEqual(ABSENCE_BADGES.illness);
  });

  test('returns the approved leave badge when no illness covers the date', () => {
    const leaves = [{ status: 'APPROVED', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-06T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-05', null, [], leaves, [])).toEqual(ABSENCE_BADGES.leaveApproved);
  });

  test('returns the pending leave badge (distinct label) when the leave is not yet approved', () => {
    const leaves = [{ status: 'PENDING', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], leaves, [])).toEqual(ABSENCE_BADGES.leavePending);
  });

  test('a REJECTED leave does not produce a badge', () => {
    const leaves = [{ status: 'REJECTED', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], leaves, [])).toBeNull();
  });

  test('a WITHDRAWN leave does not produce a badge', () => {
    const leaves = [{ status: 'WITHDRAWN', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], leaves, [])).toBeNull();
  });

  test('leave takes priority over an approved event on the same date', () => {
    const leaves = [{ status: 'APPROVED', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    const events = [{ status: 'APPROVED', event_date: '2026-09-04' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], leaves, events)).toEqual(ABSENCE_BADGES.leaveApproved);
  });

  test('returns the approved event badge when no illness or leave covers the date', () => {
    const events = [{ status: 'APPROVED', event_date: '2026-09-04' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], [], events)).toEqual(ABSENCE_BADGES.eventApproved);
  });

  test('returns the pending event badge (distinct label) when the event is not yet approved', () => {
    const events = [{ status: 'PENDING', event_date: '2026-09-04' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], [], events)).toEqual(ABSENCE_BADGES.eventPending);
  });

  test('a REJECTED event does not produce a badge', () => {
    const events = [{ status: 'REJECTED', event_date: '2026-09-04' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], [], events)).toBeNull();
  });

  test('returns null when no absence covers the date', () => {
    expect(resolveAbsenceBadge('2026-09-04', null, [], [], [])).toBeNull();
  });

  test('normalizes a plain YYYY-MM-DD event_date (already ::text-cast server-side) the same as an ISO-datetime illness/leave date', () => {
    // illnesses.start_date/end_date and leave_requests.start_date/end_date have
    // no ::text cast server-side, so node-postgres's default DATE parser turns
    // them into a JS Date object which JSON.stringify serializes as a full ISO
    // datetime string (e.g. "2026-09-04T00:00:00.000Z"). events.js's event_date
    // IS explicitly cast (::text), so it arrives as a plain "2026-09-04"
    // already. Both must resolve to the same calendar day.
    const events = [{ status: 'APPROVED', event_date: '2026-09-04' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], [], events)).toEqual(ABSENCE_BADGES.eventApproved);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend-mobile && npx jest src/__tests__/absenceBadges.test.js`
Expected: FAIL — `Cannot find module '../utils/absenceBadges'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `frontend-mobile/src/utils/absenceBadges.js`:

```js
/**
 * Absence badge configuration + resolution logic for MyScheduleScreen.jsx.
 * See docs/superpowers/specs/2026-09-02-my-schedule-absence-badges-design.md
 * (Decisions 2 and 5) for the full design rationale.
 *
 * Priority when multiple absences cover the same date: Malattia > Ferie >
 * Evento (CLAUDE.md Pattern 7 — "malattia vince sempre").
 */

export const ABSENCE_BADGES = {
  illness: { label: 'Malattia', icon: '🤒', color: '#EA580C' },
  leaveApproved: { label: 'Ferie', icon: '🏖️', color: '#059669' },
  leavePending: { label: 'Ferie (in attesa)', icon: '🏖️', color: '#059669' },
  eventApproved: { label: 'Evento', icon: '📅', color: '#7C3AED' },
  eventPending: { label: 'Evento (in attesa)', icon: '📅', color: '#7C3AED' },
};

// Backend DATE columns without an explicit ::text cast (illnesses.start_date/
// end_date, leave_requests.start_date/end_date) arrive over JSON as full ISO
// datetime strings (e.g. "2026-08-31T00:00:00.000Z") because node-postgres's
// default DATE parser produces a JS Date object, which res.json() then
// serializes via toISOString(). Columns the backend explicitly casts with
// ::text (events.js's event_date) arrive as a plain "YYYY-MM-DD" already.
// This normalizes both shapes to a plain YYYY-MM-DD string for comparison.
function toDateOnly(value) {
  return String(value).slice(0, 10);
}

/**
 * Returns the badge to show for `date` (a 'YYYY-MM-DD' string), or null if
 * none applies.
 *
 * `shiftValue` is the raw value from shiftsData[date] (e.g. 'm'/'p'/'s'/'R'/
 * undefined) — if truthy, the shift always wins and this returns null
 * without inspecting any absence (spec Decision 3).
 *
 * `illnesses`, `leaves`, `events` are the raw arrays returned by
 * GET /illnesses/by-date-range, GET /leave/my-requests, GET /events/my-requests
 * respectively — unfiltered by status; this function does that filtering.
 */
export function resolveAbsenceBadge(date, shiftValue, illnesses, leaves, events) {
  if (shiftValue) return null;

  const hasIllness = illnesses.some((i) => {
    const start = toDateOnly(i.start_date);
    const end = toDateOnly(i.end_date);
    return date >= start && date <= end;
  });
  if (hasIllness) return ABSENCE_BADGES.illness;

  const leave = leaves.find((l) => {
    if (l.status !== 'PENDING' && l.status !== 'APPROVED') return false;
    const start = toDateOnly(l.start_date);
    const end = toDateOnly(l.end_date);
    return date >= start && date <= end;
  });
  if (leave) return leave.status === 'APPROVED' ? ABSENCE_BADGES.leaveApproved : ABSENCE_BADGES.leavePending;

  const event = events.find((e) => {
    if (e.status !== 'PENDING' && e.status !== 'APPROVED') return false;
    return toDateOnly(e.event_date) === date;
  });
  if (event) return event.status === 'APPROVED' ? ABSENCE_BADGES.eventApproved : ABSENCE_BADGES.eventPending;

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend-mobile && npx jest src/__tests__/absenceBadges.test.js`
Expected: PASS — 13/13 tests green.

- [ ] **Step 5: Commit**

```bash
cd frontend-mobile
git add src/utils/absenceBadges.js src/__tests__/absenceBadges.test.js
git commit -m "feat: add resolveAbsenceBadge pure logic for My Schedule absence badges"
```

---

## Task 2: Wire absence fetches + badge rendering into MyScheduleScreen.jsx

**Files:**
- Modify: `frontend-mobile/src/screens/schedule/MyScheduleScreen.jsx`
- Modify: `frontend-mobile/src/__tests__/MyScheduleScreen.test.jsx`

**Context on the 3 endpoints being added** (all already exist, no backend changes):
- `ENDPOINTS.ILLNESS_LIST` = `/api/v1/illnesses/by-date-range` — query params `start_date`, `end_date` (plain `req.query`, no schema, both required). Already scoped to the calling employee's own illnesses server-side. Response: `{ data: [...] }`, rows have `start_date`, `end_date` (no `status` field — illness has no PENDING concept), already excludes cancelled illnesses server-side.
- `ENDPOINTS.LEAVES_LIST` = `/api/v1/leave/my-requests` — **no query params supported** (returns up to 100 most recent rows of the calling employee's own leave requests, any status, all time — do NOT pass a `params` object with date filters, they're silently ignored server-side). Response: `{ data: [...] }`, rows have `status`, `start_date`, `end_date`.
- `ENDPOINTS.EVENTS_LIST` = `/api/v1/events/my-requests` — query params `date_from`, `date_to`, both optional, format `YYYY-MM-DD` (validated by `GetMyEventRequestsSchema`, regex `/^\d{4}-\d{2}-\d{2}$/`). Response: `{ data: [...] }`, rows have `status`, `event_date` (already `::text`-cast to plain `YYYY-MM-DD` server-side).

**Known limitation, accepted (not fixed by this plan):** `LEAVES_LIST` returns only the 100 most recent leave requests, not scoped by date. An employee with more than 100 historical leave requests could scroll back far enough in the calendar that a genuinely approved old leave falls outside that window and its badge silently doesn't show. Not fixable without a backend change to add date filtering to this endpoint (out of scope — see spec Non-Goals). Realistic impact is very low for a retail employee's actual leave-request volume; documented here so it isn't mistaken for a new bug if ever noticed.

- [ ] **Step 1: Update `MyScheduleScreen.test.jsx`'s 3 existing tests for the new 4-call fetch, and add 6 new tests covering the absence-badge behavior, the shift-wins integration path, the exact per-endpoint request contract, the refactored hard-error path, and the abort/race-condition fix**

Replace the entire contents of `frontend-mobile/src/__tests__/MyScheduleScreen.test.jsx` with:

```jsx
import React from 'react';
import { View, Text } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import { makeNetworkError } from './helpers/networkErrors';
import { ENDPOINTS } from '../config/endpoints';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../services/apiClient', () => ({
  get: jest.fn(),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const apiClient = require('../services/apiClient').default || require('../services/apiClient');

const MyScheduleScreen = require('../screens/schedule/MyScheduleScreen').default;

const Stack = createNativeStackNavigator();

// `render()` resolves as a Promise in this environment (React 19 concurrent
// root under jest-expo) — it must be awaited before its query functions
// (getByText, etc.) are usable, or they'll be undefined (see MyPresencesScreen.test.jsx).
//
// A real NavigationContainer + native-stack Navigator with two screens is used
// (not a mock of @react-navigation/native) so that navigating away from and
// back to the "Schedule" screen actually blurs/refocuses it and fires the
// screen's real useFocusEffect — this is the only way to exercise the
// refocus-refetch regression guard below; it is not mockable.
async function renderInNavigator() {
  const navRef = createNavigationContainerRef();
  const utils = await render(
    <NavigationContainer ref={navRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="Schedule" component={MyScheduleScreen} />
        <Stack.Screen name="Other">
          {() => (
            <View>
              <Text>Other screen</Text>
            </View>
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>,
  );
  return { navRef, ...utils };
}

// Resolves the shifts endpoint with `shiftsData`, and every other endpoint
// (the 3 absence fetches) with an empty array — the shape MyScheduleScreen.jsx
// expects from illnesses/leaves/events' `{ data: [...] }` response envelope.
function mockShiftsOnly(shiftsData) {
  apiClient.get.mockImplementation((url) => {
    if (url === ENDPOINTS.SHIFTS_MY_SCHEDULE) {
      return Promise.resolve({ data: { data: { shifts_data: shiftsData } } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
}

describe('MyScheduleScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.setItem.mockResolvedValue(undefined);
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  test('fetch riuscito: renderizza i turni e scrive su AsyncStorage', async () => {
    // Date derivate dal mese/anno correnti (non hardcoded): il componente
    // renderizza sempre la griglia giorni per `new Date()` reale
    // (MyScheduleScreen.jsx:24-26), quindi date fisse di un mese passato
    // smettono di matchare le celle non appena l'orologio avanza di mese
    // (regression reale osservata: '2026-07-01' funzionava a Luglio, falliva
    // deterministicamente da Agosto in poi).
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day1 = `${y}-${m}-01`;
    const day2 = `${y}-${m}-02`;

    mockShiftsOnly({ [day1]: 'm', [day2]: 'R' });

    const { getAllByText } = await renderInNavigator();

    // 4 calls: shifts + illnesses + leaves + events, all fired in parallel.
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(getAllByText('Mattino').length).toBeGreaterThan(0));

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'badge_cache_shifts',
      expect.any(String),
    );
    const [, savedRaw] = AsyncStorage.setItem.mock.calls[0];
    const saved = JSON.parse(savedRaw);
    expect(saved.shiftsData[day1]).toBe('m');
  });

  test('errore di rete con cache dello stesso month/year: mostra banner offline', async () => {
    apiClient.get.mockRejectedValue(makeNetworkError());

    const now = new Date();
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({
        savedAt: 1753000000000,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        shiftsData: { '2026-07-01': 'p' },
      }),
    );

    const { getByText } = await renderInNavigator();

    await waitFor(() => expect(getByText(/Sei offline/)).toBeTruthy());
  });

  test('refocus del tab (nessun cambio month/year) rifà la fetch: 4 chiamate diventano 8', async () => {
    mockShiftsOnly({});

    const { navRef, getByText } = await renderInNavigator();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(4));

    await act(async () => {
      navRef.current.navigate('Other');
    });
    await waitFor(() => expect(getByText('Other screen')).toBeTruthy());

    // `goBack()` (not `navigate('Schedule')`) is deliberate: navigate() to a
    // route name earlier in the stack pushes a brand-new Schedule instance
    // (confirmed via navigationRef.getRootState() during development — a new
    // route key, distinct from the original) rather than returning to the
    // existing one, which would remount the screen and make even a plain
    // useEffect([month, year]) refetch — defeating the point of this test.
    // goBack() pops back to the *same* route key/instance, so this exercises
    // a true blur → refocus of one already-mounted screen, which is exactly
    // the scenario a plain useEffect fails to re-fetch on.
    await act(async () => {
      navRef.current.goBack();
    });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(8));
  });

  test('mostra il badge Malattia per un giorno coperto da una malattia senza turno assegnato', async () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const sickDay = `${y}-${m}-05`;

    apiClient.get.mockImplementation((url) => {
      if (url === ENDPOINTS.SHIFTS_MY_SCHEDULE) {
        return Promise.resolve({ data: { data: { shifts_data: {} } } });
      }
      if (url === ENDPOINTS.ILLNESS_LIST) {
        return Promise.resolve({
          data: { data: [{ start_date: `${sickDay}T00:00:00.000Z`, end_date: `${sickDay}T00:00:00.000Z` }] },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    const { getAllByText } = await renderInNavigator();

    await waitFor(() => expect(getAllByText('Malattia').length).toBeGreaterThan(0));
  });

  test('degrado silenzioso: turni visibili anche se le fetch di assenza falliscono, nessun banner di errore', async () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day1 = `${y}-${m}-01`;

    apiClient.get.mockImplementation((url) => {
      if (url === ENDPOINTS.SHIFTS_MY_SCHEDULE) {
        return Promise.resolve({ data: { data: { shifts_data: { [day1]: 'm' } } } });
      }
      return Promise.reject(makeNetworkError());
    });

    const { getAllByText, queryByText } = await renderInNavigator();

    await waitFor(() => expect(getAllByText('Mattino').length).toBeGreaterThan(0));
    expect(queryByText(/Errore caricamento/)).toBeNull();
    expect(queryByText(/Sei offline/)).toBeNull();
  });

  test('un giorno con turno assegnato mostra il turno, non il badge di malattia, anche se coperto da una malattia approvata', async () => {
    // Component-level guard for spec Decision 3 ("shift wins") — the pure
    // resolveAbsenceBadge() unit tests (absenceBadges.test.js) already prove
    // the function returns null when shiftValue is truthy, but that alone
    // doesn't prove the JSX branch order in MyScheduleScreen.jsx is correct
    // (e.g. an accidental `absenceBadge ? ... : shift ? ...` swap would pass
    // every absenceBadges.test.js assertion while still showing the wrong
    // badge on screen).
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = `${y}-${m}-05`;

    apiClient.get.mockImplementation((url) => {
      if (url === ENDPOINTS.SHIFTS_MY_SCHEDULE) {
        return Promise.resolve({ data: { data: { shifts_data: { [day]: 'm' } } } });
      }
      if (url === ENDPOINTS.ILLNESS_LIST) {
        return Promise.resolve({
          data: { data: [{ start_date: `${day}T00:00:00.000Z`, end_date: `${day}T00:00:00.000Z` }] },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    const { getAllByText, queryAllByText } = await renderInNavigator();

    await waitFor(() => expect(getAllByText('Mattino').length).toBeGreaterThan(0));
    expect(queryAllByText('Malattia').length).toBe(0);
  });

  test('invia i parametri corretti alle 3 fetch di assenza per il mese visualizzato', async () => {
    mockShiftsOnly({});
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    const firstDate = `${y}-${m}-01`;
    const lastDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

    await renderInNavigator();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(4));

    expect(apiClient.get).toHaveBeenCalledWith(
      ENDPOINTS.ILLNESS_LIST,
      expect.objectContaining({ params: { start_date: firstDate, end_date: lastDate } }),
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      ENDPOINTS.EVENTS_LIST,
      expect.objectContaining({ params: { date_from: firstDate, date_to: lastDate } }),
    );
    // LEAVES_LIST supports no date params server-side (see the "Known
    // limitation" note above this task) — asserting their absence here
    // guards against a future change silently adding params that the
    // backend would just ignore, masking a real gap behind an illusion of
    // date-scoping.
    const leavesCall = apiClient.get.mock.calls.find(([url]) => url === ENDPOINTS.LEAVES_LIST);
    expect(leavesCall).toBeDefined();
    expect(leavesCall[1].params).toBeUndefined();
  });

  test('errore reale del server (con response, non di rete): mostra il banner di errore', async () => {
    // Distinguishes the two error branches inside the async/await rewrite of
    // fetchSchedule: this is the "hard error, no cache fallback" path
    // (e.response present, e.g. a 500), never exercised by the pre-existing
    // "errore di rete" test above (which relies on e.response being absent).
    // Rewriting the original .then/.catch chain into async/await (Decision 6)
    // makes it easy to accidentally drop the setLoading(false) in this one
    // branch, which would leave the spinner stuck forever — this test would
    // fail (timeout waiting for the error text, since the FlatList/error view
    // are both gated by conditions that never observably change without it)
    // if that regressed.
    const serverError = { response: { status: 500, data: { message: 'Errore interno del server' } } };
    apiClient.get.mockImplementation((url) => {
      if (url === ENDPOINTS.SHIFTS_MY_SCHEDULE) {
        return Promise.reject(serverError);
      }
      return Promise.resolve({ data: { data: [] } });
    });

    const { getByText } = await renderInNavigator();

    await waitFor(() => expect(getByText('Errore interno del server')).toBeTruthy());
  });

  test('cambio mese rapido: una fetch precedente in volo, se risolve dopo, non sovrascrive i dati del mese corrente', async () => {
    // Guards the fix in this rewrite where the abort check now reads the
    // signal captured by THIS invocation's own closure, instead of the
    // original code's `abortControllerRef.current?.signal.aborted` — which
    // checks whatever controller is CURRENT at the time the check runs, not
    // the one that belonged to the specific in-flight request. After a second
    // fetchSchedule() call replaces the ref, that original pattern would have
    // let a late-resolving, already-superseded first request's data through.
    const now = new Date();
    const y = now.getFullYear();
    const m1 = String(now.getMonth() + 1).padStart(2, '0');
    let m2Num = now.getMonth() + 2;
    let y2 = y;
    if (m2Num > 12) { m2Num = 1; y2 += 1; }
    const m2 = String(m2Num).padStart(2, '0');

    let resolveFirstShifts;
    const firstShiftsPromise = new Promise((resolve) => { resolveFirstShifts = resolve; });
    let shiftsCallCount = 0;

    apiClient.get.mockImplementation((url) => {
      if (url === ENDPOINTS.SHIFTS_MY_SCHEDULE) {
        shiftsCallCount += 1;
        if (shiftsCallCount === 1) {
          // First invocation (current month): resolves LATE, after the second.
          return firstShiftsPromise.then(() => ({
            data: { data: { shifts_data: { [`${y}-${m1}-01`]: 'p' } } },
          }));
        }
        // Second invocation (next month, triggered by tapping "›"): resolves immediately.
        return Promise.resolve({ data: { data: { shifts_data: { [`${y2}-${m2}-01`]: 'm' } } } });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    const { getByText, queryAllByText } = await renderInNavigator();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(4));

    // Tap "next month" before the first fetch has resolved — this aborts the
    // in-flight first fetch and starts a second one for the new month.
    await act(async () => {
      fireEvent.press(getByText('›'));
    });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(8));

    // Now let the FIRST (superseded) fetch resolve, late.
    await act(async () => {
      resolveFirstShifts();
    });

    // The stale 'Pomeriggio' badge from the first (aborted) month must never
    // appear — only the second month's 'Mattino' badge should be visible.
    await waitFor(() => expect(queryAllByText('Mattino').length).toBeGreaterThan(0));
    expect(queryAllByText('Pomeriggio').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify the new/updated ones fail**

Run: `cd frontend-mobile && npx jest src/__tests__/MyScheduleScreen.test.jsx`
Expected: FAIL — most of the 9 tests fail against the still-unmodified component: the call-count assertions (`toHaveBeenCalledTimes(4)`/`(8)`) fail because it still calls `apiClient.get` once per fetch; the "Malattia" and "turno vince" tests fail because there's no badge rendering yet; the params-contract test fails (no illness/leave/event calls exist to assert on); the rapid-month-change test fails on the call-count wait. The pre-existing "errore di rete" test and the new "errore reale del server" test may already pass unchanged (the shifts-only error paths aren't touched by this step) — that's expected, not a problem.

- [ ] **Step 3: Rewrite `MyScheduleScreen.jsx` to fetch absences in parallel and render the badge**

Replace the entire contents of `frontend-mobile/src/screens/schedule/MyScheduleScreen.jsx` with:

```jsx
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../services/apiClient';
import { ENDPOINTS, SHIFTS_CONFIG, STORAGE_KEYS } from '../../config/endpoints';
import LoadingSpinner from '../../components/LoadingSpinner';
import { resolveAbsenceBadge } from '../../utils/absenceBadges';

const { LABELS: SHIFT_LABELS, COLORS: SHIFT_COLORS, ICONS: SHIFT_ICONS } = SHIFTS_CONFIG;

function getDaysInMonth(month, year) {
  const days = [];
  const count = new Date(year, month, 0).getDate();
  for (let d = 1; d <= count; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

export default function MyScheduleScreen({ navigation }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [shiftsData, setShiftsData] = useState({});
  const [absences, setAbsences] = useState({ illnesses: [], leaves: [], events: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offlineBanner, setOfflineBanner] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchSchedule = useCallback(async (m = month, y = year) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    setError(null);
    setOfflineBanner(null);

    const daysInRange = getDaysInMonth(m, y);
    const startDate = daysInRange[0];
    const endDate = daysInRange[daysInRange.length - 1];

    // Absence data is best-effort/display-only (spec Decision 4 — silent
    // degradation): a failure here must never block or error out the shifts
    // fetch below, which is the operationally critical data. Promise.allSettled
    // (not Promise.all) so one failing endpoint doesn't drop the other two.
    const absencesPromise = Promise.allSettled([
      apiClient.get(ENDPOINTS.ILLNESS_LIST, { params: { start_date: startDate, end_date: endDate }, signal }),
      apiClient.get(ENDPOINTS.LEAVES_LIST, { signal }),
      apiClient.get(ENDPOINTS.EVENTS_LIST, { params: { date_from: startDate, date_to: endDate }, signal }),
    ]).then(([illnessResult, leavesResult, eventsResult]) => ({
      illnesses: illnessResult.status === 'fulfilled' ? (illnessResult.value.data.data ?? []) : [],
      leaves: leavesResult.status === 'fulfilled' ? (leavesResult.value.data.data ?? []) : [],
      events: eventsResult.status === 'fulfilled' ? (eventsResult.value.data.data ?? []) : [],
    }));

    let shiftsResult;
    let offline = null;
    try {
      const r = await apiClient.get(ENDPOINTS.SHIFTS_MY_SCHEDULE, { params: { month: m, year: y }, signal });
      shiftsResult = r.data.data?.shifts_data ?? {};
      AsyncStorage.setItem(
        STORAGE_KEYS.CACHE_SHIFTS,
        JSON.stringify({ savedAt: Date.now(), month: m, year: y, shiftsData: shiftsResult }),
      ).catch(() => {});
    } catch (e) {
      if (signal.aborted) return;

      if (!e.response) {
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_SHIFTS);
          const cached = raw ? JSON.parse(raw) : null;
          if (cached && cached.month === m && cached.year === y) {
            shiftsResult = cached.shiftsData ?? {};
            offline = { savedAt: cached.savedAt };
          }
        } catch (cacheErr) {
          // corrupt cache or storage failure — fall through to normal error
        }
      }

      if (shiftsResult === undefined) {
        if (!signal.aborted) {
          setError(e.response?.data?.message || 'Errore caricamento turni');
          setLoading(false);
        }
        return;
      }
    }

    const absencesData = await absencesPromise;
    if (signal.aborted) return;

    setShiftsData(shiftsResult);
    setAbsences(absencesData);
    if (offline) setOfflineBanner(offline);
    setLoading(false);
  }, [month, year]);

  // useFocusEffect (not plain useEffect) so returning to this tab re-attempts the
  // fetch even when month/year haven't changed — otherwise, since bottom-tab screens
  // stay mounted across tab switches, going offline and back to this tab would just
  // keep showing whatever was last in memory with no retry, no offline banner, and
  // no way to notice the data might be stale until the month is changed.
  useFocusEffect(
    useCallback(() => {
      fetchSchedule(month, year);
      return () => abortControllerRef.current?.abort();
    }, [month, year, fetchSchedule]),
  );

  const days = getDaysInMonth(month, year);
  const monthLabel = new Date(year, month - 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  const changeMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };

  const assignedCount = Object.values(shiftsData).filter(s => s && s !== 'R').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { justifyContent: 'center' }]}>
        <Text style={styles.title}>I Miei Turni</Text>
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navBtn}>
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navBtn}>
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{assignedCount}</Text>
          <Text style={styles.kpiLabel}>Turni assegnati</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{days.length}</Text>
          <Text style={styles.kpiLabel}>Giorni nel mese</Text>
        </View>
      </View>

      {loading && <LoadingSpinner color="#1E3A5F" />}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchSchedule(month, year)}
          >
            <Text style={styles.retryButtonText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && offlineBanner && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            Sei offline — dati aggiornati al {new Date(offlineBanner.savedAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      )}

      {!loading && (
        <FlatList
          data={days}
          keyExtractor={d => d}
          contentContainerStyle={styles.list}
          renderItem={({ item: date }) => {
            const shift = shiftsData[date];
            const dayNum = parseInt(date.split('-')[2]);
            const dayObj = new Date(date + 'T12:00:00');
            const dayName = dayObj.toLocaleDateString('it-IT', { weekday: 'short' });
            const isWeekend = dayObj.getDay() === 0 || dayObj.getDay() === 6;
            const isToday = date === now.toISOString().split('T')[0];
            const absenceBadge = resolveAbsenceBadge(date, shift, absences.illnesses, absences.leaves, absences.events);

            return (
              <View style={[styles.dayRow, isWeekend && styles.weekend, isToday && styles.today]}>
                <View style={styles.dateCol}>
                  <Text style={[styles.dayNum, isToday && styles.todayText]}>{dayNum}</Text>
                  <Text style={[styles.dayName, isWeekend && styles.weekendText]}>{dayName}</Text>
                </View>
                {shift ? (
                  <View style={[styles.shiftBadge, { backgroundColor: SHIFT_COLORS[shift] + '20' }]}>
                    <Text style={styles.shiftIcon}>{SHIFT_ICONS[shift]}</Text>
                    <Text style={[styles.shiftLabel, { color: SHIFT_COLORS[shift] }]}>
                      {SHIFT_LABELS[shift]}
                    </Text>
                  </View>
                ) : absenceBadge ? (
                  <View style={[styles.shiftBadge, { backgroundColor: absenceBadge.color + '20' }]}>
                    <Text style={styles.shiftIcon}>{absenceBadge.icon}</Text>
                    <Text style={[styles.shiftLabel, { color: absenceBadge.color }]}>
                      {absenceBadge.label}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.noShift}>—</Text>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#1E3A5F',
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  monthNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 16, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  navBtn: { paddingHorizontal: 12 },
  navText: { fontSize: 28, color: '#1E3A5F', fontWeight: '300' },
  monthLabel: { fontSize: 17, fontWeight: '600', color: '#2A2520', textTransform: 'capitalize' },
  kpiRow: { flexDirection: 'row', padding: 16, gap: 12 },
  kpiCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, alignItems: 'center',
  },
  kpiValue: { fontSize: 28, fontWeight: '700', color: '#1E3A5F' },
  kpiLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 10, marginBottom: 6, paddingHorizontal: 16, paddingVertical: 12,
  },
  weekend: { backgroundColor: '#F9FAFB' },
  today: { borderLeftWidth: 3, borderLeftColor: '#2563EB' },
  dateCol: { width: 48 },
  dayNum: { fontSize: 18, fontWeight: '600', color: '#2A2520' },
  dayName: { fontSize: 12, color: '#6B7280', textTransform: 'capitalize' },
  weekendText: { color: '#9CA3AF' },
  todayText: { color: '#2563EB' },
  shiftBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginLeft: 12, gap: 8,
  },
  shiftIcon: { fontSize: 18 },
  shiftLabel: { fontSize: 15, fontWeight: '600' },
  noShift: { flex: 1, textAlign: 'center', color: '#D1D5DB', fontSize: 20, fontWeight: '300' },
  errorContainer: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  errorText: { color: '#C0392B', textAlign: 'center', fontSize: 16, marginBottom: 16 },
  retryButton: {
    backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  offlineBanner: {
    backgroundColor: '#FEF6EC', marginHorizontal: 16, marginBottom: 8,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  offlineBannerText: { color: '#B45309', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend-mobile && npx jest src/__tests__/MyScheduleScreen.test.jsx`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Run lint**

Run: `cd frontend-mobile && npx eslint src/screens/schedule/MyScheduleScreen.jsx src/utils/absenceBadges.js src/__tests__/MyScheduleScreen.test.jsx src/__tests__/absenceBadges.test.js`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd frontend-mobile
git add src/screens/schedule/MyScheduleScreen.jsx src/__tests__/MyScheduleScreen.test.jsx
git commit -m "feat: show illness/leave/event absence badges in My Schedule when no shift is assigned"
```

---

## Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full mobile test suite**

Run: `cd frontend-mobile && npx jest`
Expected: all suites pass, no regressions in unrelated files.

- [ ] **Step 2: Run lint on the whole mobile app**

Run: `cd frontend-mobile && npx eslint src/`
Expected: 0 errors (pre-existing warnings, if any, are acceptable — do not introduce new ones).

- [ ] **Step 3: Manual sanity check against the spec**

Re-read `docs/superpowers/specs/2026-09-02-my-schedule-absence-badges-design.md` end to end and confirm each Decision (1 through 6) and each Non-Goal has a corresponding implemented behavior or explicit exclusion in the code from Tasks 1-2. No code change expected in this step — if a gap is found, go back and add a task to close it before considering this plan done.

---

## Critical Analysis (post-approval, user-requested)

After the plan above was first written, a dedicated critical pass checked for interactions with the rest of the codebase and for test coverage gaps, without changing the planned behavior:

- **Verified safe, no action needed:** `RootNavigator.test.jsx` mocks `MyScheduleScreen` entirely (`() => null`) — untouched by this plan. `QRScannerScreen.jsx`'s only reference to `MyScheduleScreen` is a comment, not an import. The Maestro E2E smoke flow (`maestro/navigation-smoke.yaml`) only asserts the screen title "I Miei Turni" (unchanged), never shift/badge content. The general API rate limiter (100 req/min per authenticated user) has ample headroom for 4 calls per screen focus/month change.
- **Real correctness detail found in the already-written Task 2 code, now covered by a test:** the rewrite reads the AbortController's `signal` from this invocation's own closure, not `abortControllerRef.current?.signal.aborted` (the original code's pattern). This is a deliberate improvement — the original pattern checks whichever controller is *current* at the time an in-flight request's callback runs, not the one that request actually belongs to, which is a latent race window on rapid month changes. Added the "cambio mese rapido" test above to lock this in.
- **Coverage gaps closed** (no bug found, but nothing was guarding against a future regression): shift-wins-over-absence-badge precedence was previously proven only at the pure-function level (`absenceBadges.test.js`), not at the component/JSX-wiring level — added a dedicated component test. The exact request parameters sent to each of the 3 new endpoints (easy to get wrong — three different shapes) had no test — added one. The hard-error (non-network, e.g. HTTP 500) path through the rewritten `async`/`await` `fetchSchedule` had no test, and a rewrite from promise-chaining is exactly the kind of change that can silently drop a `setLoading(false)` in an untested branch — added one.
- **Known limitation documented, deliberately not fixed:** `LEAVES_LIST` returns only the 100 most recent leave requests with no server-side date filter — see the note in Task 2's endpoint context above. Out of scope (would require a backend change); low real-world impact.

## Self-Review (already performed while writing this plan)

**Spec coverage:** Decision 1 (3 fetches, exact endpoints/params) → Task 2 Step 3. Decision 2 (priority + labels/colors, including the post-critique `#EA580C`) → Task 1 Step 3 (`ABSENCE_BADGES`). Decision 3 (shift wins) → Task 1 Step 3 (`if (shiftValue) return null`) + Task 2 Step 3 (shift branch checked before `absenceBadge` in the render). Decision 4 (silent degradation) → Task 2 Step 3 (`Promise.allSettled`, defaults to `[]` on rejection, no error state touched) + Task 2's degrado-silenzioso test. Decision 5 (pure testable function) → Task 1 in full. Decision 6 (unified loading, no flash) → Task 2 Step 3 (`loading` stays `true` until `absencesPromise` is awaited in every non-early-return path). Non-Goals (ManagerScheduleScreen untouched, no offline cache for absences, no backend changes, shift-over-absence precedence, no tap-to-detail navigation) — none of these are touched by any task; verified by scanning Task 2 Step 3's diff for `ManagerScheduleScreen`, `AsyncStorage` absence-caching, or any `onPress`/`TouchableOpacity` added around the absence badge (none present).

**Placeholder scan:** none found — every step has complete, runnable code.

**Type consistency:** `resolveAbsenceBadge(date, shiftValue, illnesses, leaves, events)` signature is identical between its definition (Task 1) and its two call sites (Task 1's own tests, Task 2's render call: `resolveAbsenceBadge(date, shift, absences.illnesses, absences.leaves, absences.events)`). `ABSENCE_BADGES` key names (`illness`, `leaveApproved`, `leavePending`, `eventApproved`, `eventPending`) are used consistently between Task 1's implementation and Task 1's tests. The `absences` state shape (`{ illnesses, leaves, events }`) is identical between its `useState` initializer, the `absencesPromise` resolution, and the render call in Task 2.
