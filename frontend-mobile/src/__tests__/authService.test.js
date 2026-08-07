jest.mock('../services/apiClient', () => ({ post: jest.fn() }));
jest.mock('../services/secureAuthStorage', () => ({
  getToken: jest.fn(),
  getRefreshToken: jest.fn(),
  getUser: jest.fn(),
  setSession: jest.fn(),
  setTokenPair: jest.fn(),
  clearSession: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ multiRemove: jest.fn() }));

const { interopDefault } = require('./helpers/rntl');
const apiClient = interopDefault(require('../services/apiClient'));
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { STORAGE_KEYS } = require('../config/endpoints');
const authService = interopDefault(require('../services/authService'));

describe('authService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('login persiste la sessione via secureAuthStorage.setSession e ritorna token+user', async () => {
    apiClient.post.mockResolvedValue({
      data: { data: { token: 'access-1', refresh_token: 'refresh-1', user: { id: 'u1', role: 'employee' } } },
    });

    const result = await authService.login('user@example.com', 'secret123');

    expect(secureAuthStorage.setSession).toHaveBeenCalledWith({
      token: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'u1', role: 'employee' },
    });
    expect(result).toEqual({ token: 'access-1', user: { id: 'u1', role: 'employee' } });
  });

  test('login include client_id nel body quando fornito', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { token: 't', user: {} } } });

    await authService.login('user@example.com', 'secret123', 'client-42');

    expect(apiClient.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ client_id: 'client-42' }));
  });

  test('logout ripulisce la sessione sicura e le cache UI, anche se la chiamata API di logout fallisce', async () => {
    apiClient.post.mockRejectedValue(new Error('network down'));
    secureAuthStorage.clearSession.mockResolvedValue(undefined);
    AsyncStorage.multiRemove.mockResolvedValue(undefined);

    await authService.logout();

    expect(secureAuthStorage.clearSession).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([STORAGE_KEYS.CACHE_SHIFTS, STORAGE_KEYS.CACHE_PRESENCES]);
  });

  test('refreshAccessToken persiste solo il nuovo access token via setTokenPair', async () => {
    secureAuthStorage.getRefreshToken.mockResolvedValue('refresh-1');
    apiClient.post.mockResolvedValue({ data: { data: { token: 'access-2' } } });

    const token = await authService.refreshAccessToken();

    expect(secureAuthStorage.setTokenPair).toHaveBeenCalledWith({ token: 'access-2' });
    expect(token).toBe('access-2');
  });

  test('refreshAccessToken lancia senza chiamare l\'API se non c\'è un refresh token salvato', async () => {
    secureAuthStorage.getRefreshToken.mockResolvedValue(null);

    await expect(authService.refreshAccessToken()).rejects.toThrow('No refresh token');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  test('isAuthenticated riflette se secureAuthStorage.getToken() risolve un token', async () => {
    secureAuthStorage.getToken.mockResolvedValue('access-1');
    await expect(authService.isAuthenticated()).resolves.toBe(true);

    secureAuthStorage.getToken.mockResolvedValue(null);
    await expect(authService.isAuthenticated()).resolves.toBe(false);
  });
});
