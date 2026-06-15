/**
 * Authentication Integration Tests
 * Tests the complete auth flow: login, token generation, token refresh
 * These tests require the backend to be running on http://localhost:3000
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

/**
 * Helper: Make HTTP requests without external dependencies
 */
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// These tests hit a real backend on http://localhost:3000 and cannot run in the
// unit/CI suite (no live server). Skipped by default; run locally against a
// running backend with `RUN_INTEGRATION=1 npm test`.
const describeIntegration = process.env.RUN_INTEGRATION ? describe : describe.skip;

describeIntegration('Authentication Integration Tests', () => {
  describe('POST /api/v1/auth/login', () => {
    it('should return 400 for missing email', async () => {
      const response = await makeRequest('POST', '/api/v1/auth/login', {
        password: 'pippo01',
      });

      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
    });

    it('should return 400 for missing password', async () => {
      const response = await makeRequest('POST', '/api/v1/auth/login', {
        email: 'pippo@badge.local',
      });

      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
    });

    it('should return 400 for invalid email format', async () => {
      const response = await makeRequest('POST', '/api/v1/auth/login', {
        email: 'not-an-email',
        password: 'pippo01',
      });

      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
    });

    it('should return 401 for incorrect credentials', async () => {
      const response = await makeRequest('POST', '/api/v1/auth/login', {
        email: 'pippo@badge.local',
        password: 'wrong-password',
      });

      expect(response.status).toBe(401);
      expect(response.data.error).toBe('INVALID_CREDENTIALS');
    });

    it('should return 200 with token for valid credentials', async () => {
      const response = await makeRequest('POST', '/api/v1/auth/login', {
        email: 'pippo@badge.local',
        password: 'pippo01',
      });

      expect(response.status).toBe(200);
      expect(response.data.data).toBeDefined();
      expect(response.data.data.token).toBeDefined();
      expect(response.data.data.refresh_token).toBeDefined();
      expect(response.data.data.user).toBeDefined();
    });

    it('should return correct user data for admin account', async () => {
      const response = await makeRequest('POST', '/api/v1/auth/login', {
        email: 'pippo@badge.local',
        password: 'pippo01',
      });

      expect(response.status).toBe(200);
      const { user } = response.data.data;
      expect(user.id).toBe('user-mvp-pippo');
      expect(user.name).toBe('Pippo');
      expect(user.role).toBe('admin');
      expect(user.email).toBe('pippo@badge.local');
    });

    it('should return correct user data for manager account', async () => {
      const response = await makeRequest('POST', '/api/v1/auth/login', {
        email: 'pino@badge.local',
        password: 'pino01',
      });

      expect(response.status).toBe(200);
      const { user } = response.data.data;
      expect(user.id).toBe('user-mvp-pino');
      expect(user.name).toBe('Pino');
      expect(user.role).toBe('manager');
      expect(user.site_id).toBeDefined();
    });

    it('should return correct user data for employee account', async () => {
      const response = await makeRequest('POST', '/api/v1/auth/login', {
        email: 'maria@badge.local',
        password: 'maria01',
      });

      expect(response.status).toBe(200);
      const { user } = response.data.data;
      expect(user.id).toBe('user-mvp-maria');
      expect(user.name).toBe('Maria');
      expect(user.role).toBe('employee');
      expect(user.employee_id).toBeDefined();
    });

    it('should generate valid JWT token', async () => {
      const response = await makeRequest('POST', '/api/v1/auth/login', {
        email: 'pippo@badge.local',
        password: 'pippo01',
      });

      const token = response.data.data.token;
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // JWT has 3 parts separated by dots
      const parts = token.split('.');
      expect(parts.length).toBe(3);

      // Decode header and verify algorithm
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      expect(header.alg).toBe('RS256');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should return 200 for logout', async () => {
      // First login
      const loginResponse = await makeRequest('POST', '/api/v1/auth/login', {
        email: 'pippo@badge.local',
        password: 'pippo01',
      });

      const token = loginResponse.data.data.token;

      // Then logout
      const logoutResponse = await makeRequest('POST', '/api/v1/auth/logout', {});

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.data.message).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should return 400 for missing refresh_token', async () => {
      const response = await makeRequest('POST', '/api/v1/auth/refresh', {});

      expect(response.status).toBe(400);
      expect(response.data.error).toBe('MISSING_REFRESH_TOKEN');
    });

    it('should return 401 for invalid refresh_token', async () => {
      const response = await makeRequest('POST', '/api/v1/auth/refresh', {
        refresh_token: 'invalid-token',
      });

      expect(response.status).toBe(401);
      expect(response.data.error).toBeDefined();
    });

    it('should return new access token for valid refresh_token', async () => {
      // First login to get refresh token
      const loginResponse = await makeRequest('POST', '/api/v1/auth/login', {
        email: 'pippo@badge.local',
        password: 'pippo01',
      });

      const refreshToken = loginResponse.data.data.refresh_token;

      // Refresh the token
      const refreshResponse = await makeRequest('POST', '/api/v1/auth/refresh', {
        refresh_token: refreshToken,
      });

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.data.data.token).toBeDefined();
      expect(refreshResponse.data.data.refresh_token).toBeDefined();

      // New token should be different from old token
      expect(refreshResponse.data.data.token).not.toBe(loginResponse.data.data.token);
    });
  });

  describe('Auth Flow End-to-End', () => {
    it('should complete full auth flow: login -> use token -> refresh -> use new token', async () => {
      // Step 1: Login
      const loginResponse = await makeRequest('POST', '/api/v1/auth/login', {
        email: 'pippo@badge.local',
        password: 'pippo01',
      });

      expect(loginResponse.status).toBe(200);
      const { token, refresh_token, user } = loginResponse.data.data;
      expect(token).toBeDefined();
      expect(refresh_token).toBeDefined();
      expect(user.id).toBe('user-mvp-pippo');

      // Step 2: Verify we can extract claims from token
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );
      expect(payload.user_id).toBe('user-mvp-pippo');
      expect(payload.email).toBe('pippo@badge.local');
      expect(payload.role).toBe('admin');

      // Step 3: Refresh the token
      const refreshResponse = await makeRequest('POST', '/api/v1/auth/refresh', {
        refresh_token,
      });

      expect(refreshResponse.status).toBe(200);
      const newToken = refreshResponse.data.data.token;
      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(token);

      // Step 4: Verify new token is valid
      const newPayload = JSON.parse(
        Buffer.from(newToken.split('.')[1], 'base64').toString()
      );
      expect(newPayload.user_id).toBe('user-mvp-pippo');
      expect(newPayload.role).toBe('admin');
    });
  });
});
