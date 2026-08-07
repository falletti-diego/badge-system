jest.mock('../services/secureAuthStorage', () => ({
  getToken: jest.fn(),
  clearSession: jest.fn(),
}));
jest.mock('../services/authService', () => ({
  refreshAccessToken: jest.fn(),
}));
jest.mock('../utils/navigationRef', () => ({ navigateTo: jest.fn() }));

const { interopDefault } = require('./helpers/rntl');
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));
const authService = interopDefault(require('../services/authService'));
const { navigateTo } = require('../utils/navigationRef');
const apiClient = interopDefault(require('../services/apiClient'));

function getRequestInterceptor() {
  return apiClient.interceptors.request.handlers[0].fulfilled;
}
function getResponseRejectedInterceptor() {
  return apiClient.interceptors.response.handlers[0].rejected;
}

describe('apiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    secureAuthStorage.clearSession.mockResolvedValue(undefined);
  });

  test('allega l\'header Authorization leggendo il token da secureAuthStorage.getToken()', async () => {
    secureAuthStorage.getToken.mockResolvedValue('token-abc');

    const config = await getRequestInterceptor()({ headers: {} });

    expect(config.headers.Authorization).toBe('Bearer token-abc');
  });

  test('non allega l\'header Authorization quando non c\'è alcun token salvato', async () => {
    secureAuthStorage.getToken.mockResolvedValue(null);

    const config = await getRequestInterceptor()({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });

  test('dopo un 401, se il refresh fallisce, ripulisce la sessione sicura e reindirizza a Login', async () => {
    authService.refreshAccessToken.mockRejectedValue(new Error('refresh failed'));
    const error = {
      response: { status: 401 },
      config: { url: '/api/v1/checkins', headers: {} },
    };

    await expect(getResponseRejectedInterceptor()(error)).rejects.toThrow('refresh failed');

    expect(secureAuthStorage.clearSession).toHaveBeenCalledTimes(1);
    expect(navigateTo).toHaveBeenCalledWith('Login');
  });
});
