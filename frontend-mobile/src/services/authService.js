import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';
import { ENDPOINTS, STORAGE_KEYS } from '../config/endpoints';

const { AUTH_TOKEN: TOKEN_KEY, USER_DATA: USER_KEY } = STORAGE_KEYS;

const authService = {
  async login(email, password) {
    const response = await apiClient.post(ENDPOINTS.AUTH_LOGIN, { email, password });
    const { token, user } = response.data.data;
    await AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [USER_KEY, JSON.stringify(user)],
    ]);
    return { token, user };
  },

  async logout() {
    try {
      await apiClient.post(ENDPOINTS.AUTH_LOGOUT, {});
    } catch {
      // best-effort
    }
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  },

  async getToken() {
    return AsyncStorage.getItem(TOKEN_KEY);
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
