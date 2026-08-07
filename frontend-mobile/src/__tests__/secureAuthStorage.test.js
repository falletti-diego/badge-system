jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    setItemAsync: jest.fn((key, value) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((key) => Promise.resolve(store.has(key) ? store.get(key) : null)),
    deleteItemAsync: jest.fn((key) => {
      store.delete(key);
      return Promise.resolve();
    }),
    __clear: () => store.clear(),
  };
});

const { interopDefault } = require('./helpers/rntl');
const SecureStore = require('expo-secure-store');
const { STORAGE_KEYS } = require('../config/endpoints');
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));
const { SecureStorageError } = require('../services/secureAuthStorage');

describe('secureAuthStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SecureStore.__clear();
  });

  it('setSession scrive token, refresh token e user; getToken/getRefreshToken/getUser li rileggono correttamente', async () => {
    await secureAuthStorage.setSession({
      token: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'u1', email: 'a@b.com', role: 'employee' },
    });

    await expect(secureAuthStorage.getToken()).resolves.toBe('access-1');
    await expect(secureAuthStorage.getRefreshToken()).resolves.toBe('refresh-1');
    await expect(secureAuthStorage.getUser()).resolves.toEqual({ id: 'u1', email: 'a@b.com', role: 'employee' });
  });

  it('setSession senza refreshToken non scrive la chiave REFRESH_TOKEN', async () => {
    await secureAuthStorage.setSession({ token: 'access-1', user: { id: 'u1' } });

    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(STORAGE_KEYS.REFRESH_TOKEN, expect.anything());
    await expect(secureAuthStorage.getRefreshToken()).resolves.toBeNull();
  });

  it('setTokenPair aggiorna access e refresh token senza toccare user', async () => {
    await secureAuthStorage.setSession({ token: 'old-access', refreshToken: 'old-refresh', user: { id: 'u1' } });
    await secureAuthStorage.setTokenPair({ token: 'new-access', refreshToken: 'new-refresh' });

    await expect(secureAuthStorage.getToken()).resolves.toBe('new-access');
    await expect(secureAuthStorage.getRefreshToken()).resolves.toBe('new-refresh');
    await expect(secureAuthStorage.getUser()).resolves.toEqual({ id: 'u1' });
  });

  it('setTokenPair senza refreshToken aggiorna solo il token', async () => {
    await secureAuthStorage.setSession({ token: 'old-access', refreshToken: 'old-refresh', user: { id: 'u1' } });
    await secureAuthStorage.setTokenPair({ token: 'new-access' });

    await expect(secureAuthStorage.getToken()).resolves.toBe('new-access');
    await expect(secureAuthStorage.getRefreshToken()).resolves.toBe('old-refresh');
  });

  it('clearSession rimuove token, refresh token e user', async () => {
    await secureAuthStorage.setSession({ token: 'a', refreshToken: 'r', user: { id: 'u1' } });
    await secureAuthStorage.clearSession();

    await expect(secureAuthStorage.getToken()).resolves.toBeNull();
    await expect(secureAuthStorage.getRefreshToken()).resolves.toBeNull();
    await expect(secureAuthStorage.getUser()).resolves.toBeNull();
  });

  it('getUser ritorna null e ripulisce la chiave se il JSON salvato è corrotto', async () => {
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, '{not-json');

    await expect(secureAuthStorage.getUser()).resolves.toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.USER_DATA);
  });

  it('lancia SecureStorageError se SecureStore.setItemAsync fallisce', async () => {
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error('disk full'));

    await expect(secureAuthStorage.setSession({ token: 'a', user: { id: 'u1' } }))
      .rejects.toBeInstanceOf(SecureStorageError);
  });

  it('lancia SecureStorageError se SecureStore.getItemAsync fallisce', async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('keystore unavailable'));

    await expect(secureAuthStorage.getToken()).rejects.toBeInstanceOf(SecureStorageError);
  });

  it('lancia SecureStorageError se SecureStore.deleteItemAsync fallisce', async () => {
    SecureStore.deleteItemAsync.mockRejectedValueOnce(new Error('keystore locked'));

    await expect(secureAuthStorage.clearSession()).rejects.toBeInstanceOf(SecureStorageError);
  });
});
