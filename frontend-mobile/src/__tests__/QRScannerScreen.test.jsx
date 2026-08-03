import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, act, waitFor, fireEvent } from '@testing-library/react-native';

// expo-camera: CameraView stub exposes the `onBarcodeScanned` prop it was last
// rendered with, so tests can invoke it directly (simulating a real scan event).
jest.mock('expo-camera', () => {
  let latestProps = null;
  return {
    CameraView: (props) => {
      latestProps = props;
      const RN = require('react-native');
      const ReactLib = require('react');
      return ReactLib.createElement(RN.View, { testID: 'camera-view' });
    },
    useCameraPermissions: jest.fn(),
    __getLatestCameraProps: () => latestProps,
    __resetLatestCameraProps: () => { latestProps = null; },
  };
});

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
}));

jest.mock('../services/apiClient', () => ({
  post: jest.fn(),
}));

jest.mock('../services/authService', () => ({
  getUser: jest.fn(),
}));

jest.mock('../services/offlineQueue', () => ({
  enqueueCheckin: jest.fn(),
}));

jest.mock('../utils/deviceTier', () => ({
  isLowEndDevice: jest.fn(() => false),
}));

const { useCameraPermissions, __getLatestCameraProps, __resetLatestCameraProps } = require('expo-camera');
const Crypto = require('expo-crypto');
const apiClient = require('../services/apiClient').default || require('../services/apiClient');
const authService = require('../services/authService').default || require('../services/authService');
const { enqueueCheckin } = require('../services/offlineQueue');
const { Animated } = require('react-native');
const { isLowEndDevice } = require('../utils/deviceTier');

const QRScannerScreen = require('../screens/checkin/QRScannerScreen').default;

// Helper: builds a valid `badge://checkin?...` QR payload string.
function buildQrString({ siteId = 'site-99', clientId = 'client-1' } = {}) {
  const params = [];
  if (siteId !== null) params.push(`site_id=${siteId}`);
  if (clientId !== null) params.push(`client_id=${clientId}`);
  return `badge://checkin?${params.join('&')}`;
}

// Helper: an axios-style network/timeout error — request was sent but no response
// was ever received (offline, or POST_TIMEOUT_OFFLINE_MS hit).
function makeNetworkError() {
  const err = new Error('Network Error');
  err.isAxiosError = true;
  return err;
}

// Helper: an axios-style application error — the server actually responded (4xx/5xx).
function makeResponseError(message) {
  const err = new Error(message);
  err.isAxiosError = true;
  err.response = { status: 400, data: { message } };
  return err;
}

async function renderScreen(navigationOverrides = {}, route = undefined) {
  const navigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn(), ...navigationOverrides };
  const utils = await render(<QRScannerScreen navigation={navigation} route={route} />);
  return { ...utils, navigation };
}

async function scan(qrString) {
  // React's scheduler can flush the CameraView child render on a later tick than the
  // synchronous `render()` call returns on — wait until it has actually mounted (and
  // captured the current `onBarcodeScanned` prop) before invoking it.
  await waitFor(() => expect(__getLatestCameraProps()).not.toBeNull());
  const props = __getLatestCameraProps();
  await act(async () => {
    await props.onBarcodeScanned({ data: qrString });
  });
}

describe('QRScannerScreen', () => {
  beforeAll(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetLatestCameraProps();
    useCameraPermissions.mockReturnValue([{ granted: true, canAskAgain: true }, jest.fn()]);
    Crypto.randomUUID.mockReturnValue('generated-uuid-1234');
    authService.getUser.mockResolvedValue({ employee_id: 'emp-1' });
  });

  test('regression guard: network error (no response) enqueues a payload with the correct site_id and navigates with the correct siteId, not undefined', async () => {
    // Under the old buggy pattern, `payload`/`siteId` were declared with const/let
    // inside the try{} block and read from the catch{} block below — a separate
    // lexical scope. That either threw a ReferenceError (crashing the handler before
    // enqueueCheckin/navigation.replace ever ran) or, if the bug were papered over,
    // could otherwise let a corrupted/undefined value leak into the queued payload
    // and the navigation params. This test pins both the payload contents and the
    // navigation params to the correct siteId so a regression cannot pass silently.
    apiClient.post.mockRejectedValue(makeNetworkError());
    enqueueCheckin.mockResolvedValue(undefined);
    const { navigation } = await renderScreen();

    await scan(buildQrString({ siteId: 'site-99', clientId: 'client-1' }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());

    expect(enqueueCheckin).toHaveBeenCalledTimes(1);
    const enqueuedPayload = enqueueCheckin.mock.calls[0][0];
    expect(enqueuedPayload).toBeDefined();
    expect(enqueuedPayload.site_id).toBe('site-99');
    expect(enqueuedPayload.employee_id).toBe('emp-1');
    expect(enqueuedPayload.client_id).toBe('client-1');

    expect(navigation.replace).toHaveBeenCalledWith('Success', { pending: true, siteId: 'site-99' });
  }, 15000); // CI's shared ubuntu-latest runners are slower than a local Mac and occasionally
  // exceed Jest's default 5000ms here (reproduced on 2 consecutive real CI runs, never
  // locally) — this test does no more work than its neighbors, just enough slower on a
  // throttled CI CPU to tip over the default. Bumped only for this test, not file-wide.

  test('QR missing site_id/client_id shows a validation error and never enqueues a check-in', async () => {
    const { navigation } = await renderScreen();

    await scan(buildQrString({ siteId: null, clientId: null }));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    expect(Alert.alert).toHaveBeenCalledWith(
      'Errore check-in',
      expect.stringContaining('QR incompleto'),
      expect.any(Array)
    );
    expect(enqueueCheckin).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  test('authService.getUser() resolving without employee_id shows a validation error and never enqueues a check-in', async () => {
    authService.getUser.mockResolvedValue({ name: 'Maria' }); // no employee_id
    await renderScreen();

    await scan(buildQrString());

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    expect(Alert.alert).toHaveBeenCalledWith(
      'Errore check-in',
      expect.stringContaining('Employee ID non trovato'),
      expect.any(Array)
    );
    expect(enqueueCheckin).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  test('a genuine application error (4xx with a server response) shows the server message and never enqueues a check-in', async () => {
    apiClient.post.mockRejectedValue(makeResponseError('Sede non assegnata a questo dipendente'));
    await renderScreen();

    await scan(buildQrString({ siteId: 'site-5', clientId: 'client-1' }));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    expect(Alert.alert).toHaveBeenCalledWith(
      'Errore check-in',
      'Sede non assegnata a questo dipendente',
      expect.any(Array)
    );
    expect(enqueueCheckin).not.toHaveBeenCalled();
  });

  test('happy path online: posts the check-in and navigates to Success without pending', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { id: 'checkin-1' } } });
    const { navigation } = await renderScreen();

    await scan(buildQrString({ siteId: 'site-42', clientId: 'client-1' }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [, postedPayload] = apiClient.post.mock.calls[0];
    expect(postedPayload.site_id).toBe('site-42');
    expect(postedPayload.employee_id).toBe('emp-1');

    expect(enqueueCheckin).not.toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('Success', {
      checkIn: { id: 'checkin-1' },
      siteId: 'site-42',
    });
  });

  test('when routed from FaceIDScreen with faceidVerified: true, the check-in payload includes faceid_verified: true', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { id: 'checkin-1' } } });
    await renderScreen({}, { params: { faceidVerified: true } });

    await scan(buildQrString({ siteId: 'site-42', clientId: 'client-1' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const [, postedPayload] = apiClient.post.mock.calls[0];
    expect(postedPayload.faceid_verified).toBe(true);
  });

  test('when routed without faceidVerified param (Face ID skipped), the check-in payload includes faceid_verified: false', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { id: 'checkin-1' } } });
    await renderScreen({}, { params: { faceidVerified: false } });

    await scan(buildQrString({ siteId: 'site-42', clientId: 'client-1' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const [, postedPayload] = apiClient.post.mock.calls[0];
    expect(postedPayload.faceid_verified).toBe(false);
  });

  test('permission permanently denied (canAskAgain: false) shows an "Apri Impostazioni" button that calls Linking.openSettings', async () => {
    useCameraPermissions.mockReturnValue([{ granted: false, canAskAgain: false }, jest.fn()]);
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockImplementation(() => {});

    const { getByText } = await renderScreen();

    const settingsButton = getByText('Apri Impostazioni');
    fireEvent.press(settingsButton);

    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
  });
});

describe('QRScannerScreen — low-end device animations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetLatestCameraProps();
    useCameraPermissions.mockReturnValue([{ granted: true, canAskAgain: true }, jest.fn()]);
    authService.getUser.mockResolvedValue({ employee_id: 'emp-1' });
  });

  it('starts only the scan-line loop on a low-end device, skipping the decorative status dot', async () => {
    isLowEndDevice.mockReturnValue(true);
    const loopSpy = jest.spyOn(Animated, 'loop');
    await renderScreen();

    // Oggi il componente avvia sempre 2 loop (scan-line + pallino). Su
    // low-end deve avviarne solo 1 (lo scan-line, funzionale).
    expect(loopSpy).toHaveBeenCalledTimes(1);
    loopSpy.mockRestore();
  });

  it('starts both loops (scan-line + decorative status dot) on a normal device', async () => {
    isLowEndDevice.mockReturnValue(false);
    const loopSpy = jest.spyOn(Animated, 'loop');
    await renderScreen();

    expect(loopSpy).toHaveBeenCalledTimes(2);
    loopSpy.mockRestore();
  });
});
