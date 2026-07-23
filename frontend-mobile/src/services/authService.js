import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';
import { ENDPOINTS, STORAGE_KEYS } from '../config/endpoints';

const { AUTH_TOKEN: TOKEN_KEY, REFRESH_TOKEN: REFRESH_KEY, USER_DATA: USER_KEY } = STORAGE_KEYS;

const authService = {
  async login(email, password, clientId = null) {
    const body = { email, password };
    // Include client_id when available to prevent cross-tenant email collision
    // (required once a second client is onboarded with an overlapping employee email)
    if (clientId) body.client_id = clientId;
    const response = await apiClient.post(ENDPOINTS.AUTH_LOGIN, body);
    const { token, refresh_token, user } = response.data.data;
    const pairs = [[TOKEN_KEY, token], [USER_KEY, JSON.stringify(user)]];
    if (refresh_token) pairs.push([REFRESH_KEY, refresh_token]);
    await AsyncStorage.multiSet(pairs);
    return { token, user };
  },

  async logout() {
    try {
      await apiClient.post(ENDPOINTS.AUTH_LOGOUT, {});
    } catch {
      // best-effort
    }
    // Clear read-only UI caches too — retail devices are often shared between employees,
    // and a stale cache would otherwise show the previous employee's shifts/presences to
    // whoever logs in next (offline mode, Task B5). The pending check-in queue is
    // deliberately NOT cleared here: those check-ins belong to the employee who created
    // them and must still sync even after they've logged out on this device.
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, USER_KEY, STORAGE_KEYS.CACHE_SHIFTS, STORAGE_KEYS.CACHE_PRESENCES]);
  },

  async getToken() {
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  async getRefreshToken() {
    return AsyncStorage.getItem(REFRESH_KEY);
  },

  async refreshAccessToken() {
    const refresh_token = await this.getRefreshToken();
    if (!refresh_token) throw new Error('No refresh token');
    const response = await apiClient.post(ENDPOINTS.AUTH_REFRESH, { refresh_token });
    const { token } = response.data.data;
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return token;
  },

  async getUser() {
    try {
      const raw = await AsyncStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('Failed to parse user data from AsyncStorage:', err);
      await AsyncStorage.removeItem(USER_KEY);
      return null;
    }
  },

  async isAuthenticated() {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    return !!token;
  },
};

export default authService;
