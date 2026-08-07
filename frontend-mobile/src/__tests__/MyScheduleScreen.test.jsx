import React from 'react';
import { View, Text } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, waitFor, act } from '@testing-library/react-native';
import { makeNetworkError } from './helpers/networkErrors';

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

    apiClient.get.mockResolvedValue({
      data: { data: { shifts_data: { [day1]: 'm', [day2]: 'R' } } },
    });

    const { getAllByText } = await renderInNavigator();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));
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

  test('refocus del tab (nessun cambio month/year) rifà la fetch: seconda apiClient.get chiamata', async () => {
    apiClient.get.mockResolvedValue({ data: { data: { shifts_data: {} } } });

    const { navRef, getByText } = await renderInNavigator();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

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
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
  });
});
