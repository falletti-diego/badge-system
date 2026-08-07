import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../config/endpoints';

const { AUTH_TOKEN, REFRESH_TOKEN, USER_DATA } = STORAGE_KEYS;

export class SecureStorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SecureStorageError';
    this.cause = cause;
  }
}

async function setItem(key, value) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (err) {
    throw new SecureStorageError(`Impossibile salvare "${key}" in modo sicuro.`, err);
  }
}

async function getItem(key) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    throw new SecureStorageError(`Impossibile leggere "${key}" dallo storage sicuro.`, err);
  }
}

async function deleteItem(key) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (err) {
    throw new SecureStorageError(`Impossibile rimuovere "${key}" dallo storage sicuro.`, err);
  }
}

const secureAuthStorage = {
  async getToken() {
    return getItem(AUTH_TOKEN);
  },

  async getRefreshToken() {
    return getItem(REFRESH_TOKEN);
  },

  async getUser() {
    const raw = await getItem(USER_DATA);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Failed to parse user data from secure storage:', err);
      await deleteItem(USER_DATA);
      return null;
    }
  },

  async setSession({ token, refreshToken, user }) {
    const writes = [setItem(AUTH_TOKEN, token), setItem(USER_DATA, JSON.stringify(user))];
    if (refreshToken) writes.push(setItem(REFRESH_TOKEN, refreshToken));
    await Promise.all(writes);
  },

  async setTokenPair({ token, refreshToken }) {
    const writes = [setItem(AUTH_TOKEN, token)];
    if (refreshToken) writes.push(setItem(REFRESH_TOKEN, refreshToken));
    await Promise.all(writes);
  },

  async clearSession() {
    await Promise.all([deleteItem(AUTH_TOKEN), deleteItem(REFRESH_TOKEN), deleteItem(USER_DATA)]);
  },
};

export default secureAuthStorage;
