import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE, ENDPOINTS, TIMING, STORAGE_KEYS } from '../config/endpoints';
import { navigateTo } from '../utils/navigationRef';

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: TIMING.API_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Queue-based 401 interceptor: refresh access token once, retry original request.
// If refresh fails, clear storage and redirect to Login.
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config;

    if (status === 401 && !originalRequest._retried && originalRequest.url !== ENDPOINTS.AUTH_REFRESH) {
      if (isRefreshing) {
        // Queue concurrent 401s — they all retry once the refresh resolves
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retried = true;
      isRefreshing = true;

      try {
        // Lazy import to avoid circular dependency at module load time
        const authService = (await import('./authService')).default;
        const newToken = await authService.refreshAccessToken();
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        await AsyncStorage.multiRemove([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.REFRESH_TOKEN, STORAGE_KEYS.USER_DATA]);
        navigateTo('Login');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
