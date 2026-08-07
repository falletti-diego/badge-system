import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';
import { ENDPOINTS, STORAGE_KEYS } from '../config/endpoints';
import secureAuthStorage from './secureAuthStorage';

const authService = {
  async login(email, password, clientId = null) {
    const body = { email, password };
    // Include client_id when available to prevent cross-tenant email collision
    // (required once a second client is onboarded with an overlapping employee email)
    if (clientId) body.client_id = clientId;
    const response = await apiClient.post(ENDPOINTS.AUTH_LOGIN, body);
    const { token, refresh_token, user } = response.data.data;
    await secureAuthStorage.setSession({ token, refreshToken: refresh_token, user });
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
    await Promise.all([
      secureAuthStorage.clearSession(),
      AsyncStorage.multiRemove([STORAGE_KEYS.CACHE_SHIFTS, STORAGE_KEYS.CACHE_PRESENCES]),
    ]);
  },

  async getToken() {
    return secureAuthStorage.getToken();
  },

  async getRefreshToken() {
    return secureAuthStorage.getRefreshToken();
  },

  async refreshAccessToken() {
    const refresh_token = await this.getRefreshToken();
    if (!refresh_token) throw new Error('No refresh token');
    const response = await apiClient.post(ENDPOINTS.AUTH_REFRESH, { refresh_token });
    const { token } = response.data.data;
    await secureAuthStorage.setTokenPair({ token });
    return token;
  },

  async getUser() {
    return secureAuthStorage.getUser();
  },

  async isAuthenticated() {
    const token = await secureAuthStorage.getToken();
    return !!token;
  },
};

export default authService;
