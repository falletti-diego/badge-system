import apiClient from './apiClient';
import logger from '../utils/logger';

const TOKEN_KEY = 'badge_auth_token';
const REFRESH_TOKEN_KEY = 'badge_refresh_token';
const USER_KEY = 'badge_user';
const EMPLOYEE_ID_KEY = 'badge_employee_id';
const SITE_ID_KEY = 'badge_site_id';
const MUST_CHANGE_PASSWORD_KEY = 'badge_must_change_password';
const IS_DEMO_KEY = 'badge_is_demo';
const DEMO_EXPIRES_AT_KEY = 'badge_demo_expires_at';

// Exported (not just module-local) so DemoTour.jsx reads/writes the exact
// same key rather than duplicating the string literal — see setSession's
// `resetDemoTour` option below (code-review Fix 2).
export const DEMO_TOUR_SEEN_KEY = 'badge_demo_tour_seen';

/**
 * Authentication Service
 * Handles login, logout, token management
 */
const authService = {
  /**
   * Persist a login-shaped session `{ token, refresh_token, user }` to
   * localStorage. Shared by login() and by any other flow that receives the
   * same envelope from the backend (e.g. POST /demo/start, POST
   * /demo/switch-role) — single source of truth so token/user storage never
   * has to be duplicated (see CLAUDE.md "Pattern 4: DRY Violation").
   *
   * `must_change_password` is optional: login-specific flows pass it,
   * other callers (like the self-service demo) can simply omit it and the
   * flag is cleared as if it were false.
   *
   * `is_demo`/`demo_expires_at` are optional too — only the demo endpoints
   * (POST /demo/start, POST /demo/switch-role) send them, as top-level
   * siblings of `user` (see routes/demo.js). A real login never sends
   * these, so omitting them here clears any stale demo flag left over from
   * an earlier demo session in the same browser.
   *
   * `options.resetDemoTour` (code-review Fix 2): pass `true` only from a
   * call site that establishes a genuinely NEW-OR-RESUMED demo tenant —
   * i.e. TryDemoPage.jsx's POST /demo/start handler, for both the
   * new-tenant and resumed-tenant cases. Without this, DemoTour.jsx's
   * "shown once per demo session" flag (badge_demo_tour_seen) is scoped to
   * the browser forever, so a second, unrelated demo (different prospect,
   * different tenant) on the same browser would never see the tour.
   * DemoBanner.jsx's POST /demo/switch-role call must NOT pass this — a
   * role switch is the same ongoing demo session viewing a different role,
   * not a new session, so the tour must stay "seen" across it.
   *
   * @param {{ token: string, refresh_token?: string, user: object, must_change_password?: boolean, is_demo?: boolean, demo_expires_at?: string }} session
   * @param {{ resetDemoTour?: boolean }} [options]
   */
  setSession({ token, refresh_token, user, must_change_password, is_demo, demo_expires_at }, { resetDemoTour = false } = {}) {
    localStorage.setItem(TOKEN_KEY, token);
    if (refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    // Store must_change_password flag (for forced password change flow)
    if (must_change_password) {
      localStorage.setItem(MUST_CHANGE_PASSWORD_KEY, 'true');
    } else {
      localStorage.removeItem(MUST_CHANGE_PASSWORD_KEY);
    }

    // Store demo-session flags (used by DemoBanner/DemoTour — isDemo() /
    // getDemoDaysRemaining() below)
    if (is_demo) {
      localStorage.setItem(IS_DEMO_KEY, 'true');
    } else {
      localStorage.removeItem(IS_DEMO_KEY);
    }
    if (demo_expires_at) {
      localStorage.setItem(DEMO_EXPIRES_AT_KEY, demo_expires_at);
    } else {
      localStorage.removeItem(DEMO_EXPIRES_AT_KEY);
    }

    // See options.resetDemoTour doc above — only a new-or-resumed demo
    // session (TryDemoPage's POST /demo/start) resets this; a role switch
    // (DemoBanner's POST /demo/switch-role) never passes it.
    if (resetDemoTour) {
      localStorage.removeItem(DEMO_TOUR_SEEN_KEY);
    }

    // Store employee_id if present (for employee role users)
    if (user.employee_id) {
      localStorage.setItem(EMPLOYEE_ID_KEY, user.employee_id);
    } else {
      localStorage.removeItem(EMPLOYEE_ID_KEY);
    }

    // Store site_id if present (for manager role users assigned to specific store)
    if (user.site_id) {
      localStorage.setItem(SITE_ID_KEY, user.site_id);
    } else {
      localStorage.removeItem(SITE_ID_KEY);
    }
  },

  /**
   * Login with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise} Response with token and user data
   */
  async login(email, password) {
    logger.debug('authService', 'login called', { email });
    try {
      logger.debug('authService', 'calling apiClient.post /api/auth/login');
      const response = await apiClient.post('/api/v1/auth/login', {
        email,
        password,
      });

      logger.debug('authService', 'apiClient.post response received', { status: response.status });

      if (response.data.data && response.data.data.token) {
        const { token, refresh_token, user, must_change_password } = response.data.data;
        logger.debug('authService', 'storing tokens in localStorage', { userId: user.id, role: user.role });

        this.setSession({ token, refresh_token, user, must_change_password });

        logger.info('authService', 'login successful', { email, role: user.role, mustChangePassword: must_change_password });
      }

      return response.data;
    } catch (error) {
      logger.error('authService', 'login error', error);
      throw error;
    }
  },

  /**
   * Logout user
   * Clears token and user data from localStorage
   * Optionally calls backend logout endpoint for audit logging
   */
  async logout() {
    const token = this.getToken();

    // Optional: Call backend logout endpoint for audit logging
    if (token) {
      try {
        await apiClient.post('/api/v1/auth/logout', {});
      } catch (error) {
        console.warn('Logout endpoint call failed:', error);
        // Continue with local cleanup even if endpoint fails
      }
    }

    // Clear localStorage
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EMPLOYEE_ID_KEY);
    localStorage.removeItem(SITE_ID_KEY);
    localStorage.removeItem(MUST_CHANGE_PASSWORD_KEY);
    localStorage.removeItem(IS_DEMO_KEY);
    localStorage.removeItem(DEMO_EXPIRES_AT_KEY);
  },

  /**
   * Get stored token from localStorage
   * @returns {string|null} JWT token or null if not found
   */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  /**
   * Get stored user data from localStorage
   * @returns {object|null} User object or null if not found
   */
  getUser() {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  },

  getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  /**
   * Use the refresh token to get a new access token (called by apiClient interceptor).
   * Returns the new access token string, or throws if refresh fails.
   *
   * Cross-tab safety: if another browser tab already refreshed while this call
   * was in-flight, the refresh_token in localStorage will have changed. In that
   * case we skip the network call and return the token the other tab stored.
   */
  async refreshAccessToken() {
    const refresh_token = this.getRefreshToken();
    if (!refresh_token) throw new Error('No refresh token');

    // Cross-tab lock: a tab writing 'badge_refreshing' blocks other tabs for 4s
    const LOCK_KEY = 'badge_refreshing';
    const LOCK_TTL_MS = 4000;
    const existing = localStorage.getItem(LOCK_KEY);
    if (existing && Date.now() - parseInt(existing, 10) < LOCK_TTL_MS) {
      // Another tab is refreshing — wait briefly, then return whatever token it stored
      await new Promise((r) => setTimeout(r, 600));
      const raced = localStorage.getItem(TOKEN_KEY);
      if (raced) return raced;
    }

    localStorage.setItem(LOCK_KEY, String(Date.now()));
    try {
      // If the refresh_token changed while we waited, another tab already refreshed
      if (localStorage.getItem(REFRESH_TOKEN_KEY) !== refresh_token) {
        const raced = localStorage.getItem(TOKEN_KEY);
        if (raced) return raced;
      }

      const response = await apiClient.post('/api/v1/auth/refresh', { refresh_token });
      const { token, refresh_token: new_refresh } = response.data.data;
      localStorage.setItem(TOKEN_KEY, token);
      if (new_refresh) localStorage.setItem(REFRESH_TOKEN_KEY, new_refresh);
      return token;
    } finally {
      localStorage.removeItem(LOCK_KEY);
    }
  },

  /**
   * Check if user is authenticated
   * @returns {boolean} True if token exists
   */
  isAuthenticated() {
    return !!this.getToken();
  },

  /**
   * Get employee ID from localStorage (for employee role users)
   * @returns {string|null} Employee ID or null if not found
   */
  getEmployeeId() {
    return localStorage.getItem(EMPLOYEE_ID_KEY);
  },

  /**
   * Get site ID from localStorage (for manager role users assigned to store)
   * @returns {string|null} Site ID or null if not found
   */
  getSiteId() {
    return localStorage.getItem(SITE_ID_KEY);
  },

  /**
   * Get user role from localStorage
   * @returns {string|null} User role (admin, manager, employee) or null if not found
   */
  getUserRole() {
    const user = this.getUser();
    return user?.role || null;
  },

  /**
   * Check if user is an employee
   * @returns {boolean} True if user role is 'employee'
   */
  isEmployee() {
    return this.getUserRole() === 'employee';
  },

  /**
   * Check if the current session is a self-service demo session (Task 8).
   * @returns {boolean} True if the stored session came from POST /demo/start
   *   or POST /demo/switch-role (see setSession's is_demo param).
   */
  isDemo() {
    return localStorage.getItem(IS_DEMO_KEY) === 'true';
  },

  /**
   * Days remaining before the current demo session's trial expires
   * (Task 8). Returns null when there is no demo session (either not a
   * demo at all, or no expiry was ever stored).
   * @returns {number|null} Whole days remaining, floored at 0, or null.
   */
  getDemoDaysRemaining() {
    if (!this.isDemo()) return null;
    const expiresAtRaw = localStorage.getItem(DEMO_EXPIRES_AT_KEY);
    if (!expiresAtRaw) return null;
    const expiresAt = new Date(expiresAtRaw).getTime();
    if (Number.isNaN(expiresAt)) return null;
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000));
  },

};
// Interceptors are handled by apiClient — no setup needed here

export default authService;
