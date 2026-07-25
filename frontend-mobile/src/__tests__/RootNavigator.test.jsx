import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { STORAGE_KEYS } from '../config/endpoints';
import { interopDefault } from './helpers/rntl';

// RootNavigator transitively imports 11+ screens. Stub every single one to a
// trivial component so this test only exercises RootNavigator's own top-level
// effects (mount-time AsyncStorage.multiRemove, NetInfo/AppState listener
// registration) — never any downstream screen's dependencies (camera,
// face-id, forms, etc).
jest.mock('../screens/auth/LoginScreen', () => {
  const { Text } = require('react-native');
  const ReactLib = require('react');
  return () => ReactLib.createElement(Text, null, 'LOGIN_SCREEN_STUB');
});
jest.mock('../screens/checkin/CheckInScreen', () => () => null);
jest.mock('../screens/checkin/FaceIDScreen', () => () => null);
jest.mock('../screens/checkin/QRScannerScreen', () => () => null);
jest.mock('../screens/checkin/SuccessScreen', () => () => null);
jest.mock('../screens/checkin/SmartWorkingScreen', () => () => null);
jest.mock('../screens/schedule/MyScheduleScreen', () => () => null);
jest.mock('../screens/schedule/ManagerScheduleScreen', () => () => null);
jest.mock('../screens/presences/PresenzaTabScreen', () => () => null);
jest.mock('../screens/leave/LeaveRequestScreen', () => () => null);
jest.mock('../screens/leave/ManagerLeaveApprovalScreen', () => () => null);
jest.mock('../screens/illness/IllnessReportScreen', () => () => null);
jest.mock('../screens/settings/SettingsScreen', () => () => null);
jest.mock('../screens/settings/ChangePasswordScreen', () => () => null);

jest.mock('@react-native-async-storage/async-storage', () => ({
  multiRemove: jest.fn(),
  getItem: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
}));

jest.mock('../services/offlineQueue', () => ({
  flushQueue: jest.fn(),
}));

// AppState is already a jest.fn()-based mock under the jest-expo/react-native
// jest preset (node_modules/react-native/jest/mocks/AppState.js) — no
// jest.mock() of the whole 'react-native' module needed (and requiring the
// *actual* module here would drag in native TurboModules that don't exist
// under Jest).
const AsyncStorage = require('@react-native-async-storage/async-storage');
const NetInfo = require('@react-native-community/netinfo');
const { AppState } = require('react-native');
const { flushQueue } = interopDefault(require('../services/offlineQueue'));

const RootNavigator = require('../navigation/RootNavigator').default;

async function renderNavigator() {
  // `render()` resolves as a Promise in this environment (React 19 concurrent
  // root under jest-expo) — it must be awaited before its query functions
  // (getByText, etc.) are usable, or they'll be undefined.
  return render(<RootNavigator />);
}

describe('RootNavigator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.multiRemove.mockResolvedValue(undefined);
    // Simulate a still-valid stored token: the regression this guards against
    // is a code path that peeks at this and skips the force-Login behavior.
    AsyncStorage.getItem.mockResolvedValue('some-still-valid-token');
    NetInfo.addEventListener.mockReturnValue(jest.fn());
    AppState.addEventListener.mockReturnValue({ remove: jest.fn() });
  });

  test('regression guard: multiRemove is called with exactly the 5 session/cache keys (never OFFLINE_QUEUE), and Login is always forced, even when a token already exists', async () => {
    const { findByText } = await renderNavigator();

    await waitFor(() => expect(AsyncStorage.multiRemove).toHaveBeenCalledTimes(1));

    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      STORAGE_KEYS.AUTH_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.USER_DATA,
      STORAGE_KEYS.CACHE_SHIFTS,
      STORAGE_KEYS.CACHE_PRESENCES,
    ]);

    const clearedKeys = AsyncStorage.multiRemove.mock.calls[0][0];
    expect(clearedKeys).not.toContain(STORAGE_KEYS.OFFLINE_QUEUE);

    // Direct proof the app landed on Login despite a resolvable existing token.
    await findByText('LOGIN_SCREEN_STUB');
  });

  test('NetInfo listener calls flushQueue only when isConnected AND isInternetReachable are both true', async () => {
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
  });

  test('AppState "change" listener calls flushQueue only when nextState is "active"', async () => {
    await renderNavigator();

    await waitFor(() => expect(AppState.addEventListener).toHaveBeenCalledTimes(1));
    const [eventName, onAppStateChange] = AppState.addEventListener.mock.calls[0];
    expect(eventName).toBe('change');

    // Clear the best-effort flushQueue() call fired unconditionally at startup.
    flushQueue.mockClear();

    await act(async () => onAppStateChange('background'));
    expect(flushQueue).not.toHaveBeenCalled();

    await act(async () => onAppStateChange('inactive'));
    expect(flushQueue).not.toHaveBeenCalled();

    await act(async () => onAppStateChange('active'));
    expect(flushQueue).toHaveBeenCalledTimes(1);
  });
});
