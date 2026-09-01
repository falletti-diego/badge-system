import React from 'react';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import { STORAGE_KEYS } from '../config/endpoints';
import { interopDefault } from './helpers/rntl';
import { navigationRef } from '../utils/navigationRef';

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
jest.mock('../screens/events/EventRequestScreen', () => () => null);
jest.mock('../screens/events/ManagerEventApprovalScreen', () => () => null);
jest.mock('../screens/illness/IllnessReportScreen', () => () => null);
jest.mock('../screens/settings/SettingsScreen', () => () => null);
jest.mock('../screens/settings/ChangePasswordScreen', () => () => null);

jest.mock('@react-native-async-storage/async-storage', () => ({
  multiRemove: jest.fn(),
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../services/secureAuthStorage', () => ({
  clearSession: jest.fn(),
  getUser: jest.fn(),
}));

jest.mock('../services/pushNotificationsService', () => ({
  registerForPushNotifications: jest.fn(),
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
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));
const NetInfo = require('@react-native-community/netinfo');
const { AppState } = require('react-native');
const { flushQueue } = interopDefault(require('../services/offlineQueue'));
const pushNotificationsService = interopDefault(require('../services/pushNotificationsService'));

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
    AsyncStorage.getItem.mockResolvedValue(null);
    AsyncStorage.setItem.mockResolvedValue(undefined);
    secureAuthStorage.clearSession.mockResolvedValue(undefined);
    // Simulate a still-valid stored session: the regression this guards against
    // is a code path that peeks at this and skips the force-Login behavior.
    secureAuthStorage.getUser.mockResolvedValue({ role: 'employee' });
    pushNotificationsService.registerForPushNotifications.mockResolvedValue({ granted: true, canAskAgain: true });
    NetInfo.addEventListener.mockReturnValue(jest.fn());
    AppState.addEventListener.mockReturnValue({ remove: jest.fn() });
  });

  // MainTabs only mounts once navigation actually moves to the "Main" route
  // (RootStack's initialRouteName is always "Login" on cold start — see the
  // regression guard test above). Drive that transition directly through the
  // same navigationRef the real app uses after a successful login.
  async function renderMainTabs() {
    const utils = await renderNavigator();
    await utils.findByText('LOGIN_SCREEN_STUB');
    await act(async () => navigationRef.navigate('Main'));
    return utils;
  }

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

  test('shows the push consent dialog once for an employee who has not seen it yet', async () => {
    AsyncStorage.getItem.mockResolvedValue(null);
    secureAuthStorage.getUser.mockResolvedValue({ role: 'employee' });

    const { findByText } = await renderMainTabs();

    expect(await findByText('🔔 Notifiche')).toBeTruthy();
  });

  test('does not show the push consent dialog for a manager', async () => {
    secureAuthStorage.getUser.mockResolvedValue({ role: 'manager' });

    const { queryByText } = await renderMainTabs();
    await act(async () => await Promise.resolve());

    expect(queryByText('🔔 Notifiche')).toBeNull();
  });

  test('does not show the dialog again once the flag is already set', async () => {
    AsyncStorage.getItem.mockResolvedValue('true');
    secureAuthStorage.getUser.mockResolvedValue({ role: 'employee' });

    const { queryByText } = await renderMainTabs();
    await act(async () => await Promise.resolve());

    expect(queryByText('🔔 Notifiche')).toBeNull();
  });

  test('does not crash and still persists the "shown" flag if pushNotificationsService unexpectedly rejects (defense in depth)', async () => {
    AsyncStorage.getItem.mockResolvedValue(null);
    secureAuthStorage.getUser.mockResolvedValue({ role: 'employee' });
    pushNotificationsService.registerForPushNotifications.mockRejectedValue(new Error('boom'));

    const { findByText } = await renderMainTabs();

    const acceptButton = await findByText('Attiva');
    fireEvent.press(acceptButton);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.PUSH_CONSENT_DIALOG_SHOWN, 'true')
    );
  });
});
