import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('../services/authService', () => ({
  login: jest.fn(),
}));

jest.mock('../services/offlineQueue', () => ({
  flushQueue: jest.fn(),
}));

const authService = require('../services/authService').default || require('../services/authService');
const { flushQueue } = require('../services/offlineQueue');

const LoginScreen = require('../screens/auth/LoginScreen').default;

// `render()` resolves as a Promise in this environment (React 19 concurrent
// root under jest-expo) — it must be awaited before its query functions
// (getByText, etc.) are usable, or they'll be undefined.
async function renderScreen(navigationOverrides = {}) {
  const navigation = { navigate: jest.fn(), ...navigationOverrides };
  const utils = await render(<LoginScreen navigation={navigation} />);
  return { ...utils, navigation };
}

// Every fireEvent call must be individually wrapped in an async act() here.
// Leaving even one bare (unwrapped) triggers "overlapping act() calls" and,
// worse, silently corrupts the underlying fiber tree for the *next* test's
// render() call (its queries fail to find elements that are plainly in the
// rendered tree) — this is a jest-expo/React-19-concurrent-root quirk, not a
// query mistake. waitFor() alone does not paper over it; explicit act() does.
async function type(input, value) {
  await act(async () => {
    fireEvent.changeText(input, value);
  });
}

async function press(button) {
  await act(async () => {
    fireEvent.press(button);
  });
}

describe('LoginScreen', () => {
  beforeAll(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('both fields empty shows an alert and never calls authService.login', async () => {
    const { getByText } = await renderScreen();

    await press(getByText('Accedi'));

    expect(Alert.alert).toHaveBeenCalledWith('Errore', 'Inserisci email e password');
    expect(authService.login).not.toHaveBeenCalled();
  });

  test('whitespace-only password shows an alert and never calls authService.login', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();

    await type(getByPlaceholderText('Email'), 'user@example.com');
    await type(getByPlaceholderText('Password'), '   ');
    await press(getByText('Accedi'));

    expect(Alert.alert).toHaveBeenCalledWith('Errore', 'Inserisci email e password');
    expect(authService.login).not.toHaveBeenCalled();
  });

  test('successful login trims the email, flushes the offline queue, then navigates to Main', async () => {
    authService.login.mockResolvedValue({ token: 'abc' });
    const { getByPlaceholderText, getByText, navigation } = await renderScreen();

    await type(getByPlaceholderText('Email'), '  user@example.com  ');
    await type(getByPlaceholderText('Password'), 'secret123');
    await press(getByText('Accedi'));

    expect(authService.login).toHaveBeenCalledWith('user@example.com', 'secret123');
    expect(flushQueue).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('Main');
  });

  test('failed login shows "Accesso negato" with the server message and resets loading', async () => {
    const err = new Error('Invalid credentials');
    err.response = { data: { message: 'Email o password non corretti' } };
    authService.login.mockRejectedValue(err);
    const { getByPlaceholderText, getByText } = await renderScreen();

    await type(getByPlaceholderText('Email'), 'user@example.com');
    await type(getByPlaceholderText('Password'), 'wrongpass');
    await press(getByText('Accedi'));

    expect(Alert.alert).toHaveBeenCalledWith('Accesso negato', 'Email o password non corretti');

    // loading reset to false: button label ("Accedi") is back instead of the spinner.
    expect(getByText('Accedi')).toBeTruthy();
  });
});
