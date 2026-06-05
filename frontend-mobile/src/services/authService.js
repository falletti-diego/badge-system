import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';

const TOKEN_KEY = 'badge_auth_token';
const USER_KEY = 'badge_user';

const authService = {
  async login(email, password) {
    const response = await apiClient.post('/api/auth/login', { email, password });
    const { token, user } = response.data.data;
    await AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [USER_KEY, JSON.stringify(user)],
    ]);
    return { token, user };
  },

  async logout() {
    try {
      await apiClient.post('/api/auth/logout', {});
    } catch {
      // best-effort
    }
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  },

  async getToken() {
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  async getUser() {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  async isAuthenticated() {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    return !!token;
  },
};

export default authService;
