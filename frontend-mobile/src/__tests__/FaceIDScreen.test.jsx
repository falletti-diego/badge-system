import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC: 2 },
}));

jest.mock('../services/authService', () => ({
  getUser: jest.fn(),
}));

const LocalAuthentication = require('expo-local-authentication');
const authService = require('../services/authService').default || require('../services/authService');

const FaceIDScreen = require('../screens/checkin/FaceIDScreen').default;

async function renderScreen(navigationOverrides = {}) {
  const navigation = { replace: jest.fn(), reset: jest.fn(), ...navigationOverrides };
  const utils = await render(<FaceIDScreen navigation={navigation} />);
  return { ...utils, navigation };
}

describe('FaceIDScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService.getUser.mockResolvedValue({ name: 'Maria Rossi', role: 'employee' });
    LocalAuthentication.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC);
    LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });
  });

  test('regression guard: device with SecurityLevel.NONE (no biometric, no PIN/pattern/password) shows a distinct blocked message, not the generic retry loop', async () => {
    LocalAuthentication.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);

    const { findByText, queryByText } = await renderScreen();

    await findByText('Il tuo dispositivo non ha nessun blocco schermo configurato. Contatta il tuo responsabile.');
    expect(queryByText('Riprova')).toBeNull();
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });

  test('device with SecurityLevel.SECRET (PIN/pattern/password, no biometric) still calls authenticateAsync as today', async () => {
    LocalAuthentication.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);

    const { navigation } = await renderScreen();

    await waitFor(() => expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('QRScanner'));
  });

  test('device with SecurityLevel.BIOMETRIC still calls authenticateAsync as today', async () => {
    const { navigation } = await renderScreen();

    await waitFor(() => expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('QRScanner'));
  });
});
