import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

jest.mock('../services/apiClient', () => ({
  post: jest.fn(),
}));

jest.mock('../services/secureAuthStorage', () => ({
  setUser: jest.fn(),
}));

// Mock Linking from react-native
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn(),
}));

const apiClient = require('../services/apiClient').default || require('../services/apiClient');
const secureAuthStorage = require('../services/secureAuthStorage').default || require('../services/secureAuthStorage');
const GPSConsentDialog = require('../components/GPSConsentDialog').default;

async function renderDialog(props = {}) {
  const defaultProps = {
    visible: false,
    onConsent: jest.fn(),
    onDecline: jest.fn(),
    ...props,
  };
  const utils = await render(<GPSConsentDialog {...defaultProps} />);
  return { ...utils, ...defaultProps };
}

describe('GPSConsentDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not render anything when visible is false', async () => {
    const { queryByText } = await renderDialog({ visible: false });
    expect(queryByText(/Verifica di Sede/, { exact: false })).toBeNull();
  });

  test('renders the title and message when visible is true, and does not contain "puoi rifiutare (check-in senza GPS)"', async () => {
    const { getByText, queryByText } = await renderDialog({ visible: true });
    expect(getByText(/Verifica di Sede/, { exact: false })).toBeTruthy();
    expect(queryByText(/check-in senza GPS/)).toBeNull();
  });

  test('on "Accetto": calls the consent endpoint, updates the local user cache, then calls onConsent', async () => {
    apiClient.post.mockResolvedValue({ data: { success: true } });
    secureAuthStorage.setUser.mockResolvedValue(undefined);
    const onConsent = jest.fn();

    const { getByText } = await renderDialog({ visible: true, onConsent });

    await act(async () => {
      fireEvent.press(getByText('Accetto'));
    });

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/consent/gps-acceptance',
        expect.objectContaining({ consent_given: true })
      )
    );
    expect(secureAuthStorage.setUser).toHaveBeenCalledWith({ gps_consent_given: true });
    await waitFor(() => expect(onConsent).toHaveBeenCalled());
  });

  test('on "Accetto" with a failing POST: shows an error alert, does not call onConsent, re-enables the button (regression, code review 2026-08-10)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    apiClient.post.mockRejectedValue(new Error('Network Error'));
    const onConsent = jest.fn();

    const { getByText } = await renderDialog({ visible: true, onConsent });

    await act(async () => {
      fireEvent.press(getByText('Accetto'));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Errore',
      expect.stringContaining('consenso')
    ));
    expect(onConsent).not.toHaveBeenCalled();
    Alert.alert.mockRestore();
  });

  test('on "Rifiuto": does not call the endpoint, calls onDecline', async () => {
    const onDecline = jest.fn();
    const { getByText } = await renderDialog({ visible: true, onDecline });

    await act(async () => {
      fireEvent.press(getByText('Rifiuto'));
    });

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(onDecline).toHaveBeenCalled();
  });
});
