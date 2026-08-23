import React from 'react';
import { Alert } from 'react-native';
import { render, act, waitFor } from '@testing-library/react-native';

jest.mock('../services/apiClient', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));

jest.mock('../services/authService', () => ({
  getUser: jest.fn(),
}));

import apiClient from '../services/apiClient';
import authService from '../services/authService';
import SmartWorkingScreen from '../screens/checkin/SmartWorkingScreen';

async function renderScreen(navigationOverrides = {}) {
  const navigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn(), ...navigationOverrides };
  const utils = await render(<SmartWorkingScreen navigation={navigation} />);
  return { ...utils, navigation };
}

describe('SmartWorkingScreen', () => {
  beforeAll(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authService.getUser.mockResolvedValue({ name: 'Maria Rossi', employee_id: 'emp-1' });
    apiClient.get.mockResolvedValue({ data: { data: [] } });
  });

  describe('event pre-check', () => {
    test('shows a loading spinner while the pre-check request is in flight, not the confirm button', async () => {
      let resolveGet;
      apiClient.get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));

      const { queryByText } = await renderScreen();

      expect(queryByText('Conferma Smart Working')).toBeNull();

      await act(async () => { resolveGet({ data: { data: [] } }); });
    });

    test('blocks the confirm flow and shows event details when a PENDING event exists for today', async () => {
      apiClient.get.mockResolvedValue({
        data: { data: [{ id: 'evt-1', status: 'PENDING', description: 'Corso di formazione', start_time: '08:00:00', end_time: '18:00:00' }] },
      });

      const { queryByText, findByText } = await renderScreen();

      await findByText(/Corso di formazione/);
      expect(queryByText('Conferma Smart Working')).toBeNull();
    });

    test('blocks the confirm flow when an APPROVED event exists for today', async () => {
      apiClient.get.mockResolvedValue({
        data: { data: [{ id: 'evt-1', status: 'APPROVED', description: 'Congresso a Torino', start_time: '08:00:00', end_time: '18:00:00' }] },
      });

      const { queryByText, findByText } = await renderScreen();

      await findByText(/Congresso a Torino/);
      expect(queryByText('Conferma Smart Working')).toBeNull();
    });

    test('does not block when the only event for today is REJECTED', async () => {
      apiClient.get.mockResolvedValue({
        data: { data: [{ id: 'evt-1', status: 'REJECTED', description: 'Corso', start_time: '08:00:00', end_time: '18:00:00' }] },
      });

      const { findByText } = await renderScreen();

      await findByText('Conferma Smart Working');
    });

    test('fail-open: shows the confirm button when the pre-check request fails (network error)', async () => {
      apiClient.get.mockRejectedValue(new Error('Network Error'));

      const { findByText } = await renderScreen();

      await findByText('Conferma Smart Working');
    });

    test('does not block when no event exists for today (no regression)', async () => {
      apiClient.get.mockResolvedValue({ data: { data: [] } });

      const { findByText } = await renderScreen();

      await findByText('Conferma Smart Working');
    });
  });
});
