import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
}));

const mockPost = jest.fn();
jest.mock('../services/apiClient', () => ({ post: (...args) => mockPost(...args) }));

import pushNotificationsService from '../services/pushNotificationsService';

describe('pushNotificationsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not request permission or fetch a token when already denied permanently', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });

    const result = await pushNotificationsService.registerForPushNotifications();

    expect(result).toEqual({ granted: false, canAskAgain: false });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission, gets a token, and posts it to the backend when granted', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[xxxx]' });
    mockPost.mockResolvedValue({ data: { success: true } });

    const result = await pushNotificationsService.registerForPushNotifications();

    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'test-project-id' });
    expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
      token: 'ExponentPushToken[xxxx]',
      platform: expect.stringMatching(/^(ios|android)$/),
    });
    expect(result).toEqual({ granted: true, canAskAgain: true });
  });

  it('does not throw when the backend registration call fails (best-effort)', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[xxxx]' });
    mockPost.mockRejectedValue(new Error('network down'));

    await expect(pushNotificationsService.registerForPushNotifications()).resolves.toEqual({ granted: true, canAskAgain: true });
  });

  it('reports permission denial without throwing, when the user declines the system prompt', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });

    const result = await pushNotificationsService.registerForPushNotifications();

    expect(result).toEqual({ granted: false, canAskAgain: true });
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('does not throw and still reports granted:true when getExpoPushTokenAsync itself rejects (e.g. no network, missing EAS project id)', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    Notifications.getExpoPushTokenAsync.mockRejectedValue(new Error('Network request failed'));

    await expect(pushNotificationsService.registerForPushNotifications()).resolves.toEqual({ granted: true, canAskAgain: true });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('does not throw when setNotificationChannelAsync itself rejects on Android', async () => {
    const RN = require('react-native');
    RN.Platform.OS = 'android';
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    Notifications.setNotificationChannelAsync.mockRejectedValue(new Error('channel error'));

    await expect(pushNotificationsService.registerForPushNotifications()).resolves.toEqual({ granted: true, canAskAgain: true });
    RN.Platform.OS = 'ios'; // restore default for other tests in this file
  });

  it('does not attempt to create an Android notification channel on iOS', async () => {
    const RN = require('react-native');
    RN.Platform.OS = 'ios';
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[xxxx]' });
    mockPost.mockResolvedValue({ data: { success: true } });

    await pushNotificationsService.registerForPushNotifications();

    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});
