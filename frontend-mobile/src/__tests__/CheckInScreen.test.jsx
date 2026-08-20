import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { fireEvent } from '@testing-library/react-native';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../services/authService', () => ({
  getUser: jest.fn(),
}));

jest.mock('../services/offlineQueue', () => ({
  getQueue: jest.fn(),
  subscribe: jest.fn(),
}));

const LocalAuthentication = require('expo-local-authentication');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const authService = require('../services/authService').default || require('../services/authService');
const { getQueue, subscribe } = require('../services/offlineQueue');

const CheckInScreen = require('../screens/checkin/CheckInScreen').default;

async function renderScreen(navigationOverrides = {}) {
  const navigation = { navigate: jest.fn(), ...navigationOverrides };
  const utils = await render(<CheckInScreen navigation={navigation} />);
  return { ...utils, navigation };
}

describe('CheckInScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService.getUser.mockResolvedValue({ name: 'Maria Rossi', employee_id: 'emp-1' });
    getQueue.mockResolvedValue([]);
    subscribe.mockReturnValue(() => {});
  });

  test('when Face ID is unavailable (no hardware), tapping check-in navigates to QRScanner with faceidVerified: false', async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(false);
    AsyncStorage.getItem.mockResolvedValue(null);

    const { getByText, navigation } = await renderScreen();

    await waitFor(() => expect(LocalAuthentication.hasHardwareAsync).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(getByText('Scannerizza QR Code'));
    });

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('QRScanner', { faceidVerified: false }));
  });

  test('when Face ID is available but disabled by the user in Impostazioni, tapping check-in navigates to QRScanner with faceidVerified: false', async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
    AsyncStorage.getItem.mockResolvedValue('false');

    const { getByText, navigation } = await renderScreen();

    await waitFor(() => expect(LocalAuthentication.hasHardwareAsync).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(getByText('Scannerizza QR Code'));
    });

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('QRScanner', { faceidVerified: false }));
  });

  test('when Face ID is available and enabled, tapping check-in navigates to FaceID without extra params', async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
    AsyncStorage.getItem.mockResolvedValue(null);

    const { getByText, navigation } = await renderScreen();

    await waitFor(() => expect(LocalAuthentication.hasHardwareAsync).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(getByText('Scannerizza QR Code'));
    });

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('FaceID'));
  });

  test('employee sees the Eventi/Training button, and tapping it navigates to the Eventi tab', async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(false);
    AsyncStorage.getItem.mockResolvedValue(null);
    authService.getUser.mockResolvedValue({ name: 'Maria Rossi', employee_id: 'emp-1', role: 'employee' });

    const { getByText, navigation } = await renderScreen();

    await waitFor(() => expect(getByText('Eventi/Training')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('Eventi/Training'));
    });

    expect(navigation.navigate).toHaveBeenCalledWith('Eventi');
  });

  test('manager does NOT see the Eventi/Training button (no request screen for managers)', async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(false);
    AsyncStorage.getItem.mockResolvedValue(null);
    authService.getUser.mockResolvedValue({ name: 'Pino Bianchi', employee_id: 'mgr-1', role: 'manager' });

    const { queryByText } = await renderScreen();

    await waitFor(() => expect(authService.getUser).toHaveBeenCalled());

    expect(queryByText('Eventi/Training')).toBeNull();
  });
});
