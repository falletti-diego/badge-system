import React from 'react';
import { View, Text, Alert, Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

jest.mock('../services/authService', () => ({ getUser: jest.fn(), logout: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('../services/apiClient', () => ({ post: jest.fn() }));
jest.mock('../services/secureAuthStorage', () => ({ setUser: jest.fn() }));
// Default resolved value so describe blocks that don't touch push
// permissions (Guida, GPS consent) still render without throwing.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined', canAskAgain: true }),
}));
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn((title, message, buttons) => {
    const revokeButton = buttons?.find(b => b.text === 'Revoca');
    if (revokeButton?.onPress) revokeButton.onPress();
  }),
}));

const { interopDefault } = require('./helpers/rntl');
const authService = interopDefault(require('../services/authService'));
const AsyncStorage = interopDefault(require('@react-native-async-storage/async-storage'));
const apiClient = interopDefault(require('../services/apiClient'));
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));
const SettingsScreen = interopDefault(require('../screens/settings/SettingsScreen'));

const Stack = createNativeStackNavigator();

// SettingsScreen usa useFocusEffect internamente (richiede useNavigation() reale,
// non un mock semplice della prop `navigation`) — stesso vincolo già gestito in
// MyScheduleScreen.test.jsx: un vero NavigationContainer + Stack.Navigator con
// una schermata "Help" fittizia, così la navigazione reale è osservabile.
async function renderInNavigator() {
  const utils = await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Help">
          {() => (
            <View>
              <Text>Help screen</Text>
            </View>
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>,
  );
  return utils;
}

describe('SettingsScreen — Guida entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService.getUser.mockResolvedValue({ name: 'Test User', email: 'test@example.com', role: 'employee' });
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  test('naviga a Help quando si tocca "Guida"', async () => {
    const { getByText } = await renderInNavigator();

    await waitFor(() => expect(getByText('Test User')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('Guida'));
    });

    await waitFor(() => expect(getByText('Help screen')).toBeTruthy());
  });
});

describe('SettingsScreen — revoca consenso posizione', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  test('la riga NON è visibile se il dipendente non ha mai dato consenso GPS', async () => {
    authService.getUser.mockResolvedValue({ name: 'Test User', email: 'test@example.com', role: 'employee', gps_consent_given: false });
    const { queryByText } = await renderInNavigator();

    await waitFor(() => expect(queryByText('Test User')).toBeTruthy());
    expect(queryByText('Revoca consenso posizione')).toBeNull();
  });

  test('la riga è visibile se il consenso è stato dato', async () => {
    authService.getUser.mockResolvedValue({ name: 'Test User', email: 'test@example.com', role: 'employee', gps_consent_given: true });

    const { getByText } = await renderInNavigator();
    await waitFor(() => expect(getByText('Revoca consenso posizione')).toBeTruthy());
  });
});

describe('SettingsScreen — riga Notifiche', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService.getUser.mockResolvedValue({ name: 'Test User', email: 'test@example.com', role: 'employee' });
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  it('shows "Notifiche attive" with no action when permission is already granted', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    const { findByText, queryByText } = await renderInNavigator();

    expect(await findByText('Notifiche attive')).toBeTruthy();
    expect(queryByText('Apri Impostazioni')).toBeNull();
  });

  it('shows "Notifiche disattivate" with an "Apri Impostazioni" recovery button when permanently denied', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    const { findByText } = await renderInNavigator();

    expect(await findByText('Notifiche disattivate')).toBeTruthy();
    expect(await findByText('Apri Impostazioni')).toBeTruthy();
  });

  it('opens system settings when "Apri Impostazioni" is tapped', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockImplementation(() => {});
    const { findByText } = await renderInNavigator();

    fireEvent.press(await findByText('Apri Impostazioni'));

    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
  });
});
