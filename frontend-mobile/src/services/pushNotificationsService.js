/**
 * pushNotificationsService — thin wrapper around expo-notifications.
 *
 * Contract:
 * - registerForPushNotifications() should only be called AFTER the employee
 *   has accepted an explanatory in-app dialog (not on cold start).
 * - If permission is already permanently denied, never re-prompts (that
 *   wouldn't show a system dialog again anyway, but avoids a wasted call
 *   and a confusing code path).
 * - Everything after permission is granted (Android channel setup, token
 *   fetch, backend registration) is wrapped in ONE try/catch: the OS
 *   permission is already granted at that point, so this function must
 *   never reject for any later failure (network, missing EAS project id,
 *   channel setup) — an unhandled rejection here would propagate to the
 *   caller uncaught.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import apiClient from './apiClient';
import { ENDPOINTS } from '../config/endpoints';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Notifiche Badge System',
    importance: Notifications.AndroidImportance.MAX,
  });
}

/**
 * @returns {Promise<{ granted: boolean, canAskAgain: boolean }>}
 */
async function registerForPushNotifications() {
  const existing = await Notifications.getPermissionsAsync();

  let finalStatus = existing.status;
  let canAskAgain = existing.canAskAgain;

  if (existing.status !== 'granted' && existing.canAskAgain) {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
    canAskAgain = requested.canAskAgain;
  }

  if (finalStatus !== 'granted') {
    return { granted: false, canAskAgain };
  }

  try {
    await ensureAndroidChannel();

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await apiClient.post(ENDPOINTS.NOTIFICATIONS_PUSH_TOKEN, {
      token,
      platform: Platform.OS,
    });
  } catch (err) {
    // Best-effort — permission is already granted at the OS level; a
    // failure here (network, token fetch, channel setup) shouldn't block
    // anything. A future app open or Settings toggle can retry.
  }

  return { granted: true, canAskAgain };
}

export default { registerForPushNotifications };
