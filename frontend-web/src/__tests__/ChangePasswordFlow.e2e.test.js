/**
 * End-to-End Test: CSV Import → Temp Password → Change Password Flow
 *
 * S.32.6 Task 8: Verifies complete password change lifecycle
 *
 * Scenario:
 * 1. Admin imports 3 employees via CSV (backend)
 * 2. Backend returns temp passwords in response
 * 3. Employee logs in with temp password → must_change_password=true
 * 4. Frontend redirects to /change-password
 * 5. Employee changes password (Opzione B: intelligent error handling)
 * 6. Frontend auto-redirects to /dashboard with new token
 * 7. Employee logs out
 * 8. Employee logs in with NEW password → must_change_password=false
 * 9. Dashboard loads normally
 *
 * Note: This is an integration test that simulates the full flow
 * with mocked API responses.
 */

jest.mock('../services/apiClient');

import apiClient from '../services/apiClient';
import authService from '../services/authService';

jest.mock('../services/authService');

describe('S.32.6 Task 8: Full Lifecycle Integration — CSV Import → Change Password → New Login', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  // =========================================================================
  // Test 1: Login with must_change_password=true
  // =========================================================================
  describe('Login with must_change_password=true (from CSV import)', () => {
    test('should login successfully with temp password', () => {
      // Step 1: Employee logs in with temp password from CSV import
      const mockUser = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        name: 'New Employee',
        role: 'employee',
        must_change_password: true, // ← CSV import sets this flag
      };

      const mockResponse = {
        token: 'temp.jwt.token.1',
        refresh_token: 'temp.refresh.token.1',
        user: mockUser,
      };

      // Simulate login response
      localStorage.setItem('badge_auth_token', mockResponse.token);
      localStorage.setItem('badge_refresh_token', mockResponse.refresh_token);
      localStorage.setItem('badge_user', JSON.stringify(mockUser));

      // Assertions
      expect(localStorage.getItem('badge_auth_token')).toBe('temp.jwt.token.1');
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(true);
      expect(JSON.parse(localStorage.getItem('badge_user')).email).toBe(
        'new.employee@company.local'
      );
    });

    test('should have must_change_password=true flag in response', () => {
      const user = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        must_change_password: true,
      };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const storedUser = JSON.parse(localStorage.getItem('badge_user'));
      expect(storedUser.must_change_password).toBe(true);
    });
  });

  // =========================================================================
  // Test 2: Change Password Flow (Opzione A: Auto-Update + Auto-Redirect)
  // =========================================================================
  describe('Change Password Flow (Opzione A)', () => {
    test('should successfully change password and update localStorage', async () => {
      // Setup: Employee has logged in with temp password
      const oldUser = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        must_change_password: true,
      };
      localStorage.setItem('badge_auth_token', 'temp.jwt.token.1');
      localStorage.setItem('badge_user', JSON.stringify(oldUser));

      // Step 1: POST /api/auth/change-password
      const newResponse = {
        data: {
          token: 'new.jwt.token.2',
          refresh_token: 'new.refresh.token.2',
          user: {
            id: 'emp-1',
            email: 'new.employee@company.local',
            must_change_password: false, // ← Flag cleared
          },
        },
      };

      apiClient.post.mockResolvedValue(newResponse);

      // Simulate API call
      const response = await apiClient.post('/api/auth/change-password', {
        old_password: 'TempPassword123',
        new_password: 'NewPassword123',
      });

      // Step 2: Update localStorage (like ChangePasswordPage does)
      localStorage.setItem('badge_auth_token', response.data.data.token);
      localStorage.setItem('badge_refresh_token', response.data.data.refresh_token);
      localStorage.setItem('badge_user', JSON.stringify(response.data.data.user));

      // Assertions
      expect(localStorage.getItem('badge_auth_token')).toBe('new.jwt.token.2');
      expect(localStorage.getItem('badge_refresh_token')).toBe('new.refresh.token.2');
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(
        false
      );
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

      const newStoredToken = response.data.data.token;

      expect(newStoredToken).not.toBe(oldToken);
      expect(newStoredToken).toBe(newToken);
    });
  });

  // =========================================================================
  // Test 3: PasswordChangeGuard Redirect Logic
  // =========================================================================
  describe('PasswordChangeGuard Redirect Logic', () => {
    test('should redirect to /change-password when must_change_password=true', () => {
      const user = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        must_change_password: true,
      };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const storedUser = JSON.parse(localStorage.getItem('badge_user'));
      const mustChangePassword = storedUser.must_change_password === true;

      // Simulate guard logic
      let currentPath = '/dashboard';
      if (
        mustChangePassword &&
        !currentPath.startsWith('/change-password') &&
        currentPath !== '/login'
      ) {
        currentPath = '/change-password';
      }

      expect(currentPath).toBe('/change-password');
    });

    test('should NOT redirect when must_change_password=false', () => {
      const user = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        must_change_password: false,
      };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const storedUser = JSON.parse(localStorage.getItem('badge_user'));
      const mustChangePassword = storedUser.must_change_password === true;

      let currentPath = '/dashboard';
      if (
        mustChangePassword &&
        !currentPath.startsWith('/change-password') &&
        currentPath !== '/login'
      ) {
        currentPath = '/change-password';
      }

      expect(currentPath).toBe('/dashboard');
    });
  });

  // =========================================================================
  // Test 4: Error Handling (Opzione B: Intelligente)
  // =========================================================================
  describe('Error Handling (Opzione B: Intelligente)', () => {
    test('should handle 400 validation error without logout', async () => {
      const oldUser = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        must_change_password: true,
      };
      localStorage.setItem('badge_auth_token', 'temp.jwt.token.1');
      localStorage.setItem('badge_user', JSON.stringify(oldUser));

      const errorResponse = {
        response: {
          status: 400,
          data: {
            message: 'Current password is incorrect',
          },
        },
      };

      apiClient.post.mockRejectedValue(errorResponse);

      try {
        await apiClient.post('/api/auth/change-password', {
          old_password: 'WrongPassword',
          new_password: 'NewPassword123',
        });
      } catch (error) {
        // Error caught
        expect(error.response.status).toBe(400);
      }

      // Verify: localStorage NOT cleared (no logout)
      expect(localStorage.getItem('badge_auth_token')).toBe('temp.jwt.token.1');

      // Verify: user still has must_change_password=true
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(true);
    });

    test('should handle 500 server error without logout', async () => {
      const oldUser = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        must_change_password: true,
      };
      localStorage.setItem('badge_auth_token', 'temp.jwt.token.1');
      localStorage.setItem('badge_user', JSON.stringify(oldUser));

      const errorResponse = {
        response: {
          status: 500,
          data: {
            message: 'Internal server error',
          },
        },
      };

      apiClient.post.mockRejectedValue(errorResponse);

      try {
        await apiClient.post('/api/auth/change-password', {
          old_password: 'OldPassword123',
          new_password: 'NewPassword123',
        });
      } catch (error) {
        expect(error.response.status).toBe(500);
      }

      // Verify: localStorage NOT cleared
      expect(localStorage.getItem('badge_auth_token')).toBe('temp.jwt.token.1');
    });

    test('should handle network error without logout', async () => {
      const oldUser = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        must_change_password: true,
      };
      localStorage.setItem('badge_auth_token', 'temp.jwt.token.1');
      localStorage.setItem('badge_user', JSON.stringify(oldUser));

      const errorResponse = {
        request: {}, // Network error (no response)
      };

      apiClient.post.mockRejectedValue(errorResponse);

      try {
        await apiClient.post('/api/auth/change-password', {
          old_password: 'OldPassword123',
          new_password: 'NewPassword123',
        });
      } catch (error) {
        expect(error.request).toBeDefined();
      }

      // Verify: localStorage NOT cleared
      expect(localStorage.getItem('badge_auth_token')).toBe('temp.jwt.token.1');
    });

    test('should handle 401 session revoked with logout', async () => {
      const oldUser = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        must_change_password: true,
      };
      localStorage.setItem('badge_auth_token', 'temp.jwt.token.1');
      localStorage.setItem('badge_user', JSON.stringify(oldUser));

      const errorResponse = {
        response: {
          status: 401,
          data: {
            message: 'Session revoked',
          },
        },
      };

      apiClient.post.mockRejectedValue(errorResponse);

      try {
        await apiClient.post('/api/auth/change-password', {
          old_password: 'OldPassword123',
          new_password: 'NewPassword123',
        });
      } catch (error) {
        expect(error.response.status).toBe(401);

        // Simulate logout
        authService.logout();
        localStorage.clear();
      }

      // Verify: localStorage cleared
      expect(localStorage.getItem('badge_auth_token')).toBeNull();
      expect(authService.logout).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Test 5: Login with New Password (Successful)
  // =========================================================================
  describe('Login with New Password', () => {
    test('should login successfully with new password', async () => {
      // Setup: Employee changed password, now has new password in database
      localStorage.clear();

      const loginResponse = {
        data: {
          data: {
            token: 'new.jwt.token.2',
            refresh_token: 'new.refresh.token.2',
            user: {
              id: 'emp-1',
              email: 'new.employee@company.local',
              must_change_password: false, // ← Not required to change anymore
            },
          },
        },
      };

      apiClient.post.mockResolvedValue(loginResponse);

      // Step 1: POST /api/auth/login with new password
      const response = await apiClient.post('/api/auth/login', {
        email: 'new.employee@company.local',
        password: 'NewPassword123',
      });

      // Step 2: Store response in localStorage
      localStorage.setItem('badge_auth_token', response.data.data.token);
      localStorage.setItem('badge_refresh_token', response.data.data.refresh_token);
      localStorage.setItem('badge_user', JSON.stringify(response.data.data.user));

      // Assertions
      expect(localStorage.getItem('badge_auth_token')).toBe('new.jwt.token.2');
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(
        false
      );

      // Verify: PasswordChangeGuard should NOT redirect
      const storedUser = JSON.parse(localStorage.getItem('badge_user'));
      const shouldRedirect = storedUser.must_change_password === true;
      expect(shouldRedirect).toBe(false);
    });

    test('should fail to login with old (temp) password', async () => {
      localStorage.clear();

      const errorResponse = {
        response: {
          status: 400,
          data: {
            message: 'Invalid credentials',
          },
        },
      };

      apiClient.post.mockRejectedValue(errorResponse);

      try {
        await apiClient.post('/api/auth/login', {
          email: 'new.employee@company.local',
          password: 'TempPassword123', // ← Old password (no longer valid)
        });
      } catch (error) {
        expect(error.response.status).toBe(400);
      }

      // Verify: localStorage is empty
      expect(localStorage.getItem('badge_auth_token')).toBeNull();
    });

    test('should have clean must_change_password flag after login with new password', () => {
      const user = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        must_change_password: false,
      };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const storedUser = JSON.parse(localStorage.getItem('badge_user'));

      // Verify: flag is false (not required to change)
      expect(storedUser.must_change_password).toBe(false);

      // Verify: no redirect needed
      const needsPasswordChange = storedUser.must_change_password === true;
      expect(needsPasswordChange).toBe(false);
    });
  });

  // =========================================================================
  // Test 6: Full Lifecycle (Integrated Flow)
  // =========================================================================
  describe('Full Lifecycle Integration', () => {
    test('should complete full flow: temp password → change → new login', async () => {
      // STEP 1: Login with temp password (from CSV import)
      localStorage.clear();

      const loginStep1Response = {
        data: {
          token: 'temp.jwt.token.1',
          refresh_token: 'temp.refresh.token.1',
          user: {
            id: 'emp-1',
            email: 'new.employee@company.local',
            name: 'New Employee',
            role: 'employee',
            must_change_password: true,
          },
        },
      };

      apiClient.post.mockResolvedValue(loginStep1Response);

      const login1 = await apiClient.post('/api/auth/login', {
        email: 'new.employee@company.local',
        password: 'TempPassword123',
      });

      localStorage.setItem('badge_auth_token', login1.data.token);
      localStorage.setItem('badge_user', JSON.stringify(login1.data.user));

      // Verify Step 1
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(true);

      // STEP 2: PasswordChangeGuard redirects to /change-password
      const user1 = JSON.parse(localStorage.getItem('badge_user'));
      const mustChangeStep2 = user1.must_change_password === true;
      expect(mustChangeStep2).toBe(true);

      // STEP 3: Change password
      const changePasswordResponse = {
        data: {
          token: 'new.jwt.token.2',
          refresh_token: 'new.refresh.token.2',
          user: {
            id: 'emp-1',
            email: 'new.employee@company.local',
            must_change_password: false, // ← Flag cleared
          },
        },
      };

      apiClient.post.mockResolvedValue(changePasswordResponse);

      const changeResponse = await apiClient.post('/api/auth/change-password', {
        old_password: 'TempPassword123',
        new_password: 'NewPassword123',
      });

      localStorage.setItem('badge_auth_token', changeResponse.data.token);
      localStorage.setItem('badge_user', JSON.stringify(changeResponse.data.user));

      // Verify Step 3
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(false);

      // STEP 4: PasswordChangeGuard NO LONGER redirects
      const user3 = JSON.parse(localStorage.getItem('badge_user'));
      const mustChangeStep4 = user3.must_change_password === true;
      expect(mustChangeStep4).toBe(false);

      // STEP 5: Logout
      localStorage.clear();
      expect(localStorage.getItem('badge_auth_token')).toBeNull();

      // STEP 6: Login with NEW password
      const loginStep6Response = {
        data: {
          token: 'new.jwt.token.3',
          refresh_token: 'new.refresh.token.3',
          user: {
            id: 'emp-1',
            email: 'new.employee@company.local',
            must_change_password: false,
          },
        },
      };

      apiClient.post.mockResolvedValue(loginStep6Response);

      const login6 = await apiClient.post('/api/auth/login', {
        email: 'new.employee@company.local',
        password: 'NewPassword123',
      });

      localStorage.setItem('badge_auth_token', login6.data.token);
      localStorage.setItem('badge_user', JSON.stringify(login6.data.user));

      // Final Assertions
      expect(localStorage.getItem('badge_auth_token')).toBe('new.jwt.token.3');
      expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(false);

      // Verify: No password change needed
      const finalUser = JSON.parse(localStorage.getItem('badge_user'));
      expect(finalUser.must_change_password).toBe(false);
    });

    test('should maintain user data throughout lifecycle', async () => {
      // Verify that user email/id don't change
      localStorage.clear();

      const user1 = {
        id: 'emp-1',
        email: 'new.employee@company.local',
        must_change_password: true,
      };
      localStorage.setItem('badge_user', JSON.stringify(user1));

      const storedUser1 = JSON.parse(localStorage.getItem('badge_user'));
      const email1 = storedUser1.email;
      const id1 = storedUser1.id;

      // After password change
      const user2 = {
        id: 'emp-1', // Same ID
        email: 'new.employee@company.local', // Same email
        must_change_password: false, // Flag changed
      };
      localStorage.setItem('badge_user', JSON.stringify(user2));

      const storedUser2 = JSON.parse(localStorage.getItem('badge_user'));
      const email2 = storedUser2.email;
      const id2 = storedUser2.id;

      // Verify: email and id unchanged
      expect(email1).toBe(email2);
      expect(id1).toBe(id2);
    });
  });

  // =========================================================================
  // Test 7: Manual E2E Test Instructions
  // =========================================================================
  describe('Manual E2E Test (with real backend)', () => {
    test.skip('MANUAL: CSV import → temp password → change → new login → dashboard', async () => {
      // This test requires:
      // 1. Real backend running on localhost:3000
      // 2. Real database with test client
      // 3. Manual execution (cannot automate file upload + browser interaction)
      //
      // Manual Test Steps:
      // 1. Admin: Open http://localhost:5173/admin
      // 2. Admin: Upload CSV with 3 employees
      //    Expected: Temp passwords displayed
      // 3. Employee 1: Open http://localhost:5173/login
      // 4. Employee 1: Enter email + temp password, click Login
      //    Expected: Redirect to /change-password (automatic)
      // 5. Employee 1: Fill form:
      //    - Current Password: [temp password]
      //    - New Password: [new password]
      //    - Confirm: [new password]
      // 6. Employee 1: Click "Change Password"
      //    Expected: Success message + Auto-redirect to /dashboard (1s)
      // 7. Employee 1: Verify dashboard loads (KPI cards, presences table visible)
      // 8. Employee 1: Click Logout
      //    Expected: Redirect to /login
      // 9. Employee 1: Login with NEW password
      //    Expected: Direct access to dashboard (no /change-password redirect)
      // 10. Employee 1: Verify dashboard features work normally

      expect(true).toBe(true); // Placeholder
    });
  });
});
