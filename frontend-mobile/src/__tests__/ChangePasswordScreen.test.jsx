import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('../services/apiClient', () => ({ post: jest.fn() }));
jest.mock('../services/secureAuthStorage', () => {
  class SecureStorageError extends Error {}
  return { setTokenPair: jest.fn(), SecureStorageError };
});

const { interopDefault } = require('./helpers/rntl');
const apiClient = interopDefault(require('../services/apiClient'));
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));
const { SecureStorageError } = secureAuthStorage;

const ChangePasswordScreen = interopDefault(require('../screens/settings/ChangePasswordScreen'));

async function renderScreen(navigationOverrides = {}) {
  const navigation = { goBack: jest.fn(), ...navigationOverrides };
  const utils = await render(<ChangePasswordScreen navigation={navigation} />);
  return { ...utils, navigation };
}

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

describe('ChangePasswordScreen', () => {
  beforeAll(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('un cambio riuscito persiste la nuova coppia di token via secureAuthStorage.setTokenPair', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { token: 'new-access', refresh_token: 'new-refresh' } } });
    secureAuthStorage.setTokenPair.mockResolvedValue(undefined);
    const { getByPlaceholderText, getAllByPlaceholderText, getByText } = await renderScreen();

    const [oldPasswordInput, confirmPasswordInput] = getAllByPlaceholderText('••••••••');
    const newPasswordInput = getByPlaceholderText('Almeno 8 caratteri');

    await type(oldPasswordInput, 'oldpass1');
    await type(newPasswordInput, 'newpass1');
    await type(confirmPasswordInput, 'newpass1');
    await press(getByText('Aggiorna password'));

    expect(secureAuthStorage.setTokenPair).toHaveBeenCalledWith({ token: 'new-access', refreshToken: 'new-refresh' });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Password aggiornata',
      'La tua password è stata cambiata con successo.',
      expect.any(Array)
    );
  });

  test('se il salvataggio sicuro fallisce dopo un cambio password riuscito, mostra un messaggio dedicato', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { token: 'new-access', refresh_token: 'new-refresh' } } });
    secureAuthStorage.setTokenPair.mockRejectedValue(new SecureStorageError('disk full'));
    const { getByPlaceholderText, getAllByPlaceholderText, getByText, findByText } = await renderScreen();

    const [oldPasswordInput, confirmPasswordInput] = getAllByPlaceholderText('••••••••');
    const newPasswordInput = getByPlaceholderText('Almeno 8 caratteri');

    await type(oldPasswordInput, 'oldpass1');
    await type(newPasswordInput, 'newpass1');
    await type(confirmPasswordInput, 'newpass1');
    await press(getByText('Aggiorna password'));

    await findByText('Password cambiata, ma non è stato possibile salvare la nuova sessione. Effettua di nuovo il login.');
    expect(Alert.alert).not.toHaveBeenCalledWith('Password aggiornata', expect.anything(), expect.anything());
  });
});
