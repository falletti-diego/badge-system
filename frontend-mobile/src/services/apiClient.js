import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE, TIMING } from '../config/endpoints';

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: TIMING.API_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('badge_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove(['badge_auth_token', 'badge_user']);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
