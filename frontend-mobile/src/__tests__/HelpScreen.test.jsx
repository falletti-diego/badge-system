import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('../services/authService', () => ({ getUser: jest.fn() }));

const { interopDefault } = require('./helpers/rntl');
const authService = interopDefault(require('../services/authService'));
const HelpScreen = interopDefault(require('../screens/settings/HelpScreen'));

describe('HelpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('un employee vede le FAQ "employee" e "all", non "staff"', async () => {
    authService.getUser.mockResolvedValue({ role: 'employee' });
    const { getByText, queryByText } = await render(<HelpScreen />);

    await waitFor(() => {
      expect(getByText('Perché non riesco a timbrare (check-in rifiutato)?')).toBeTruthy();
    });
    expect(getByText('Come vengono protetti i dati dei dipendenti?')).toBeTruthy();
    expect(queryByText('Come posso aggiungere un nuovo dipendente?')).toBeNull();
  });

  test('un manager vede le FAQ "staff", non quelle "employee"-only', async () => {
    authService.getUser.mockResolvedValue({ role: 'manager' });
    const { getByText, queryByText } = await render(<HelpScreen />);

    await waitFor(() => {
      expect(getByText('Come posso aggiungere un nuovo dipendente?')).toBeTruthy();
    });
    expect(queryByText('Perché non riesco a timbrare (check-in rifiutato)?')).toBeNull();
  });

  test('se authService.getUser() rigetta, mostra solo le FAQ "all" invece di crashare', async () => {
    authService.getUser.mockRejectedValue(new Error('secure storage unavailable'));
    const { getByText, queryByText } = await render(<HelpScreen />);

    await waitFor(() => {
      expect(getByText('Come vengono protetti i dati dei dipendenti?')).toBeTruthy();
    });
    expect(queryByText('Come posso aggiungere un nuovo dipendente?')).toBeNull();
    expect(queryByText('Perché non riesco a timbrare (check-in rifiutato)?')).toBeNull();
  });

  test('toccare una domanda espande la risposta', async () => {
    authService.getUser.mockResolvedValue({ role: 'employee' });
    const { getByText, queryByText } = await render(<HelpScreen />);

    await waitFor(() => {
      expect(getByText('Come attivo o disattivo il Face ID per il check-in?')).toBeTruthy();
    });
    expect(queryByText(/interruttore/)).toBeNull();

    await act(async () => {
      fireEvent.press(getByText('Come attivo o disattivo il Face ID per il check-in?'));
    });
    expect(getByText(/interruttore/)).toBeTruthy();
  });
});
