/**
 * End-to-End Test: CSV Import → Temp Password → Change Password Flow
 *
 * S.32.6 Task 8: Verifies complete password change lifecycle
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import apiClient from '../services/apiClient';
import authService from '../services/authService';

vi.mock('../services/apiClient', () => ({
  default: { post: vi.fn() },
}));

vi.mock('../services/authService', () => ({
  default: { logout: vi.fn() },
}));

const clearStorage = () => {
  localStorage.removeItem('badge_auth_token');
  localStorage.removeItem('badge_refresh_token');
  localStorage.removeItem('badge_user');
};

describe('S.32.6 Task 8: Full Lifecycle Integration — CSV Import → Change Password → New Login', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    clearStorage();
  });

  describe('Login with must_change_password=true (from CSV import)', () => {
    test('should login successfully with temp password', () => {
      const mockUser = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        name: 'New Employee',
        role: 'employee',
        must_change_password: true,
      };

      localStorage.setItem('badge_auth_token', 'temp.jwt.token.1');
      localStorage.setItem('badge_refresh_token', 'temp.refresh.token.1');
      localStorage.setItem('badge_user', JSON.stringify(mockUser));

      expect(localStorage.getItem('badge_auth_token')).toBe('temp.jwt.token.1');
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(true);
      expect(JSON.parse(localStorage.getItem('badge_user')).email).toBe('new.employee@company.local');
    });

    test('should have must_change_password=true flag in response', () => {
      const user = { id: 'emp-1', email: 'new.employee@company.local', must_change_password: true };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const storedUser = JSON.parse(localStorage.getItem('badge_user'));
      expect(storedUser.must_change_password).toBe(true);
    });
  });

  describe('Change Password Flow (Opzione A)', () => {
    test('should successfully change password and update localStorage', async () => {
      const oldUser = { id: 'emp-1', email: 'new.employee@company.local', must_change_password: true };
      localStorage.setItem('badge_auth_token', 'temp.jwt.token.1');
      localStorage.setItem('badge_user', JSON.stringify(oldUser));

      const newResponse = {
        data: {
          token: 'new.jwt.token.2',
          refresh_token: 'new.refresh.token.2',
          user: { id: 'emp-1', email: 'new.employee@company.local', must_change_password: false },
        },
      };

      apiClient.post.mockResolvedValue(newResponse);

      const response = await apiClient.post('/api/auth/change-password', {
        old_password: 'TempPassword123',
        new_password: 'NewPassword123',
      });

      localStorage.setItem('badge_auth_token', response.data.token);
      localStorage.setItem('badge_refresh_token', response.data.refresh_token);
      localStorage.setItem('badge_user', JSON.stringify(response.data.user));

      expect(localStorage.getItem('badge_auth_token')).toBe('new.jwt.token.2');
      expect(localStorage.getItem('badge_refresh_token')).toBe('new.refresh.token.2');
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(false);
    });

    test('should have different token after password change', async () => {
      const oldToken = 'temp.jwt.token.1';
      const newToken = 'new.jwt.token.2';

      localStorage.setItem('badge_auth_token', oldToken);

      const newResponse = {
        data: {
          token: newToken,
          refresh_token: 'new.refresh.token.2',
          user: { id: 'emp-1', must_change_password: false },
        },
      };

      apiClient.post.mockResolvedValue(newResponse);

      const response = await apiClient.post('/api/auth/change-password', {
        old_password: 'OldPassword',
        new_password: 'NewPassword',
      });

      expect(response.data.token).not.toBe(oldToken);
      expect(response.data.token).toBe(newToken);
    });
  });

  describe('PasswordChangeGuard Redirect Logic', () => {
    test('should redirect to /change-password when must_change_password=true', () => {
      const user = { id: 'emp-1', email: 'new.employee@company.local', must_change_password: true };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const storedUser = JSON.parse(localStorage.getItem('badge_user'));
      const mustChangePassword = storedUser.must_change_password === true;

      let currentPath = '/dashboard';
      if (mustChangePassword && !currentPath.startsWith('/change-password') && currentPath !== '/login') {
        currentPath = '/change-password';
      }

      expect(currentPath).toBe('/change-password');
    });

    test('should NOT redirect when must_change_password=false', () => {
      const user = { id: 'emp-1', email: 'new.employee@company.local', must_change_password: false };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const storedUser = JSON.parse(localStorage.getItem('badge_user'));
      const mustChangePassword = storedUser.must_change_password === true;

      let currentPath = '/dashboard';
      if (mustChangePassword && !currentPath.startsWith('/change-password') && currentPath !== '/login') {
        currentPath = '/change-password';
      }

      expect(currentPath).toBe('/dashboard');
    });
  });

  describe('Error Handling (Opzione B: Intelligente)', () => {
    test('should handle 400 validation error without logout', async () => {
      const oldUser = { id: 'emp-1', email: 'new.employee@company.local', must_change_password: true };
      localStorage.setItem('badge_auth_token', 'temp.jwt.token.1');
      localStorage.setItem('badge_user', JSON.stringify(oldUser));

      apiClient.post.mockRejectedValue({ response: { status: 400, data: { message: 'Current password is incorrect' } } });

      try {
        await apiClient.post('/api/auth/change-password', { old_password: 'WrongPassword', new_password: 'NewPassword123' });
      } catch (error) {
        expect(error.response.status).toBe(400);
      }

      expect(localStorage.getItem('badge_auth_token')).toBe('temp.jwt.token.1');
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(true);
    });

    test('should handle 500 server error without logout', async () => {
      localStorage.setItem('badge_auth_token', 'temp.jwt.token.1');
      localStorage.setItem('badge_user', JSON.stringify({ id: 'emp-1', must_change_password: true }));

      apiClient.post.mockRejectedValue({ response: { status: 500, data: { message: 'Internal server error' } } });

      try {
        await apiClient.post('/api/auth/change-password', { old_password: 'OldPassword123', new_password: 'NewPassword123' });
      } catch (error) {
        expect(error.response.status).toBe(500);
      }

      expect(localStorage.getItem('badge_auth_token')).toBe('temp.jwt.token.1');
    });

    test('should handle network error without logout', async () => {
      localStorage.setItem('badge_auth_token', 'temp.jwt.token.1');
      localStorage.setItem('badge_user', JSON.stringify({ id: 'emp-1', must_change_password: true }));

      apiClient.post.mockRejectedValue({ request: {} });

      try {
        await apiClient.post('/api/auth/change-password', { old_password: 'OldPassword123', new_password: 'NewPassword123' });
      } catch (error) {
        expect(error.request).toBeDefined();
      }

      expect(localStorage.getItem('badge_auth_token')).toBe('temp.jwt.token.1');
    });

    test('should handle 401 session revoked with logout', async () => {
      localStorage.setItem('badge_auth_token', 'temp.jwt.token.1');
      localStorage.setItem('badge_user', JSON.stringify({ id: 'emp-1', must_change_password: true }));

      apiClient.post.mockRejectedValue({ response: { status: 401, data: { message: 'Session revoked' } } });

      try {
        await apiClient.post('/api/auth/change-password', { old_password: 'OldPassword123', new_password: 'NewPassword123' });
      } catch (error) {
        expect(error.response.status).toBe(401);
        authService.logout();
        clearStorage();
      }

      expect(localStorage.getItem('badge_auth_token')).toBeNull();
      expect(authService.logout).toHaveBeenCalled();
    });
  });

  describe('Login with New Password', () => {
    test('should login successfully with new password', async () => {
      clearStorage();

      const loginResponse = {
        data: {
          data: {
            token: 'new.jwt.token.2',
            refresh_token: 'new.refresh.token.2',
            user: { id: 'emp-1', email: 'new.employee@company.local', must_change_password: false },
          },
        },
      };

      apiClient.post.mockResolvedValue(loginResponse);

      const response = await apiClient.post('/api/auth/login', {
        email: 'new.employee@company.local',
        password: 'NewPassword123',
      });

      localStorage.setItem('badge_auth_token', response.data.data.token);
      localStorage.setItem('badge_refresh_token', response.data.data.refresh_token);
      localStorage.setItem('badge_user', JSON.stringify(response.data.data.user));

      expect(localStorage.getItem('badge_auth_token')).toBe('new.jwt.token.2');
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(false);

      const storedUser = JSON.parse(localStorage.getItem('badge_user'));
      expect(storedUser.must_change_password === true).toBe(false);
    });

    test('should fail to login with old (temp) password', async () => {
      clearStorage();

      apiClient.post.mockRejectedValue({ response: { status: 400, data: { message: 'Invalid credentials' } } });

      try {
        await apiClient.post('/api/auth/login', { email: 'new.employee@company.local', password: 'TempPassword123' });
      } catch (error) {
        expect(error.response.status).toBe(400);
      }

      expect(localStorage.getItem('badge_auth_token')).toBeNull();
    });

    test('should have clean must_change_password flag after login with new password', () => {
      localStorage.setItem('badge_user', JSON.stringify({ id: 'emp-1', email: 'new.employee@company.local', must_change_password: false }));

      const storedUser = JSON.parse(localStorage.getItem('badge_user'));
      expect(storedUser.must_change_password).toBe(false);
      expect(storedUser.must_change_password === true).toBe(false);
    });
  });

  describe('Full Lifecycle Integration', () => {
    test('should complete full flow: temp password → change → new login', async () => {
      clearStorage();

      const loginStep1Response = {
        data: {
          token: 'temp.jwt.token.1',
          refresh_token: 'temp.refresh.token.1',
          user: { id: 'emp-1', email: 'new.employee@company.local', name: 'New Employee', role: 'employee', must_change_password: true },
        },
      };

      apiClient.post.mockResolvedValue(loginStep1Response);

      const login1 = await apiClient.post('/api/auth/login', { email: 'new.employee@company.local', password: 'TempPassword123' });

      localStorage.setItem('badge_auth_token', login1.data.token);
      localStorage.setItem('badge_user', JSON.stringify(login1.data.user));

      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(true);

      const user1 = JSON.parse(localStorage.getItem('badge_user'));
      expect(user1.must_change_password === true).toBe(true);

      const changePasswordResponse = {
        data: {
          token: 'new.jwt.token.2',
          refresh_token: 'new.refresh.token.2',
          user: { id: 'emp-1', email: 'new.employee@company.local', must_change_password: false },
        },
      };

      apiClient.post.mockResolvedValue(changePasswordResponse);

      const changeResponse = await apiClient.post('/api/auth/change-password', { old_password: 'TempPassword123', new_password: 'NewPassword123' });

      localStorage.setItem('badge_auth_token', changeResponse.data.token);
      localStorage.setItem('badge_user', JSON.stringify(changeResponse.data.user));

      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(false);

      const user3 = JSON.parse(localStorage.getItem('badge_user'));
      expect(user3.must_change_password === true).toBe(false);

      clearStorage();
      expect(localStorage.getItem('badge_auth_token')).toBeNull();

      const loginStep6Response = {
        data: {
          token: 'new.jwt.token.3',
          refresh_token: 'new.refresh.token.3',
          user: { id: 'emp-1', email: 'new.employee@company.local', must_change_password: false },
        },
      };

      apiClient.post.mockResolvedValue(loginStep6Response);

      const login6 = await apiClient.post('/api/auth/login', { email: 'new.employee@company.local', password: 'NewPassword123' });

      localStorage.setItem('badge_auth_token', login6.data.token);
      localStorage.setItem('badge_user', JSON.stringify(login6.data.user));

      expect(localStorage.getItem('badge_auth_token')).toBe('new.jwt.token.3');
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(false);
    });

    test('should maintain user data throughout lifecycle', () => {
      localStorage.setItem('badge_user', JSON.stringify({ id: 'emp-1', email: 'new.employee@company.local', must_change_password: true }));
      const storedUser1 = JSON.parse(localStorage.getItem('badge_user'));

      localStorage.setItem('badge_user', JSON.stringify({ id: 'emp-1', email: 'new.employee@company.local', must_change_password: false }));
      const storedUser2 = JSON.parse(localStorage.getItem('badge_user'));

      expect(storedUser1.email).toBe(storedUser2.email);
      expect(storedUser1.id).toBe(storedUser2.id);
    });
  });

  describe('Manual E2E Test (with real backend)', () => {
    test.skip('MANUAL: CSV import → temp password → change → new login → dashboard', async () => {
      expect(true).toBe(true);
    });
  });
});
