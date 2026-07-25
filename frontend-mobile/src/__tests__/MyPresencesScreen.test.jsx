import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../services/apiClient', () => ({
  get: jest.fn(),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const apiClient = require('../services/apiClient').default || require('../services/apiClient');

const MyPresencesScreen = require('../screens/presences/MyPresencesScreen').default;

// `render()` resolves as a Promise in this environment (React 19 concurrent
// root under jest-expo) — it must be awaited before its query functions
// (getByText, etc.) are usable, or they'll be undefined.
async function renderScreen() {
  return render(
    <NavigationContainer>
      <MyPresencesScreen />
    </NavigationContainer>,
  );
}

// Helper: axios-style network error — request sent, no response ever received
// (offline, DNS failure, timeout) — matches the `!err.response` branch the
// screen uses to distinguish "try the cache" from "show a hard error".
function makeNetworkError() {
  const err = new Error('Network Error');
  err.isAxiosError = true;
  return err;
}

describe('MyPresencesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.setItem.mockResolvedValue(undefined);
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  test('fetch riuscito: renderizza le entries e scrive su AsyncStorage', async () => {
    apiClient.get.mockImplementation((url) => {
      if (url.includes('smart-working')) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({
        data: {
          data: [
            { type: 'IN', timestamp: '2026-07-20T08:00:00.000Z', site_name: 'Sede Torino' },
            { type: 'OUT', timestamp: '2026-07-20T17:00:00.000Z', site_name: 'Sede Torino' },
          ],
        },
      });
    });

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Sede Torino')).toBeTruthy());

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'badge_cache_presences',
      expect.any(String),
    );
    const [, savedRaw] = AsyncStorage.setItem.mock.calls[0];
    const saved = JSON.parse(savedRaw);
    expect(saved.filterIndex).toBe(0);
    expect(saved.entries).toHaveLength(1);
  });

  test('errore di rete con cache corrispondente: mostra banner offline e non crasha (Date revival regression guard)', async () => {
    apiClient.get.mockRejectedValue(makeNetworkError());

    // Simulates exactly what's actually in AsyncStorage after a real
    // JSON.stringify round-trip: firstIn/lastOut as plain ISO strings, NOT
    // pre-made Date objects. If the component's `new Date(...)` revival were
    // removed/broken, calling `.toLocaleTimeString()` on these strings in
    // renderItem would throw and this test would fail (either by render()
    // throwing or by the time text never appearing).
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({
        savedAt: 1753000000000,
        filterIndex: 0,
        entries: [
          {
            kind: 'checkin',
            date: '2026-07-18',
            firstIn: '2026-07-18T08:00:00.000Z',
            lastOut: '2026-07-18T17:00:00.000Z',
            totalMinutes: 540,
            openPresence: false,
            siteName: 'Sede Milano',
          },
        ],
      }),
    );

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText(/Sei offline/)).toBeTruthy());

    // Direct proof the revive worked: the row renders a real formatted time
    // string produced by .toLocaleTimeString() on a genuine Date instance,
    // not a stringified Date and not a crash.
    const expectedFirstIn = new Date('2026-07-18T08:00:00.000Z').toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(getByText(new RegExp(expectedFirstIn))).toBeTruthy();
    expect(getByText('Sede Milano')).toBeTruthy();
  });

  test('errore di rete senza cache corrispondente: mostra schermata di errore con Riprova', async () => {
    apiClient.get.mockRejectedValue(makeNetworkError());
    AsyncStorage.getItem.mockResolvedValue(null); // no cache at all

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Errore caricamento presenze')).toBeTruthy());
    expect(getByText('Riprova')).toBeTruthy();
  });
});
