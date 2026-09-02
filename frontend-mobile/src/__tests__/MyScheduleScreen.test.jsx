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
