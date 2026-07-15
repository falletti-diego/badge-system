import { describe, test, expect, beforeEach, vi } from 'vitest';
import authService from '../authService';
import apiClient from '../apiClient';

vi.mock('../apiClient', () => ({
  default: { post: vi.fn() },
}));

const clearStorage = () => {
  localStorage.removeItem('badge_auth_token');
  localStorage.removeItem('badge_refresh_token');
  localStorage.removeItem('badge_user');
  localStorage.removeItem('badge_employee_id');
  localStorage.removeItem('badge_site_id');
  localStorage.removeItem('badge_must_change_password');
};

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStorage();
  });

  describe('setSession', () => {
    test('stores token, refresh_token and user in localStorage', () => {
      authService.setSession({
        token: 'tok-1',
        refresh_token: 'refresh-1',
        user: { id: 'u1', email: 'a@b.com', role: 'admin' },
      });

      expect(localStorage.getItem('badge_auth_token')).toBe('tok-1');
      expect(localStorage.getItem('badge_refresh_token')).toBe('refresh-1');
      expect(JSON.parse(localStorage.getItem('badge_user'))).toEqual({ id: 'u1', email: 'a@b.com', role: 'admin' });
    });

    test('stores employee_id and site_id when present on user', () => {
      authService.setSession({
        token: 'tok-1',
        user: { id: 'u1', employee_id: 'emp-1', site_id: 'site-1' },
      });

      expect(localStorage.getItem('badge_employee_id')).toBe('emp-1');
      expect(localStorage.getItem('badge_site_id')).toBe('site-1');
    });

    test('does not set employee_id/site_id keys when absent from user', () => {
      authService.setSession({ token: 'tok-1', user: { id: 'u1' } });

      expect(localStorage.getItem('badge_employee_id')).toBeNull();
      expect(localStorage.getItem('badge_site_id')).toBeNull();
    });

    test('sets must_change_password flag when true', () => {
      authService.setSession({ token: 'tok-1', user: { id: 'u1' }, must_change_password: true });
      expect(localStorage.getItem('badge_must_change_password')).toBe('true');
    });

    test('clears must_change_password flag when falsy or omitted', () => {
      localStorage.setItem('badge_must_change_password', 'true');
      authService.setSession({ token: 'tok-1', user: { id: 'u1' } });
      expect(localStorage.getItem('badge_must_change_password')).toBeNull();
    });

    test('does not persist refresh_token when absent', () => {
      authService.setSession({ token: 'tok-1', user: { id: 'u1' } });
      expect(localStorage.getItem('badge_refresh_token')).toBeNull();
    });
  });

  describe('login (regression — must keep working after setSession refactor)', () => {
    test('stores session data returned by POST /auth/login', async () => {
      apiClient.post.mockResolvedValue({
        data: {
          data: {
            token: 'login-tok',
            refresh_token: 'login-refresh',
            user: { id: 'u2', email: 'admin@company.it', role: 'admin', employee_id: 'emp-2', site_id: 'site-2' },
            must_change_password: false,
          },
        },
      });

      const result = await authService.login('admin@company.it', 'Password123');

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/login', {
        email: 'admin@company.it',
        password: 'Password123',
      });
      expect(localStorage.getItem('badge_auth_token')).toBe('login-tok');
      expect(localStorage.getItem('badge_refresh_token')).toBe('login-refresh');
      expect(JSON.parse(localStorage.getItem('badge_user')).id).toBe('u2');
      expect(localStorage.getItem('badge_employee_id')).toBe('emp-2');
      expect(localStorage.getItem('badge_site_id')).toBe('site-2');
      expect(localStorage.getItem('badge_must_change_password')).toBeNull();
      expect(result).toEqual({
        data: {
          token: 'login-tok',
          refresh_token: 'login-refresh',
          user: { id: 'u2', email: 'admin@company.it', role: 'admin', employee_id: 'emp-2', site_id: 'site-2' },
          must_change_password: false,
        },
      });
    });

    test('sets must_change_password flag when backend requires a password change', async () => {
      apiClient.post.mockResolvedValue({
        data: {
          data: {
            token: 'login-tok',
            refresh_token: 'login-refresh',
            user: { id: 'u3', email: 'newuser@company.it', role: 'employee' },
            must_change_password: true,
          },
        },
      });

      await authService.login('newuser@company.it', 'TempPass123');

      expect(localStorage.getItem('badge_must_change_password')).toBe('true');
    });

    test('propagates errors from the API without storing anything', async () => {
      apiClient.post.mockRejectedValue({ response: { status: 401, data: { message: 'Invalid credentials' } } });

      await expect(authService.login('bad@company.it', 'wrong')).rejects.toBeTruthy();
      expect(localStorage.getItem('badge_auth_token')).toBeNull();
    });
  });
});
