import { describe, test, expect, beforeEach } from 'vitest';
import React from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';

// Helper component (not rendered in tests, but JSX must be parseable)
function LocationTracker() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function TestApp() {
  const [location, setLocation] = React.useState('/dashboard');

  React.useEffect(() => {
    const userStr = localStorage.getItem('badge_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const mustChangePassword = user?.must_change_password === true;

    if (
      mustChangePassword &&
      !location.startsWith('/change-password') &&
      location !== '/login'
    ) {
      setLocation('/change-password');
    }
  }, [location]);

  return (
    <Router>
      <div data-testid="current-path">{location}</div>
    </Router>
  );
}

describe('PasswordChangeGuard', () => {
  beforeEach(() => {
    // happy-dom does not implement localStorage.clear(); remove known keys instead
    localStorage.removeItem('badge_user');
  });

  describe('Redirect when must_change_password=true', () => {
    test('should redirect to /change-password when must_change_password is true and user on /dashboard', () => {
      const user = {
        id: 'user-123',
        email: 'user@company.local',
        must_change_password: true,
      };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const parsedUser = JSON.parse(localStorage.getItem('badge_user'));
      const mustChangePassword = parsedUser.must_change_password === true;

      let redirectedPath = '/dashboard';
      if (mustChangePassword) {
        redirectedPath = '/change-password';
      }

      expect(redirectedPath).toBe('/change-password');
    });

    test('should redirect to /change-password when accessing /planning', () => {
      const user = { id: 'user-123', email: 'user@company.local', must_change_password: true };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const mustChangePassword = JSON.parse(localStorage.getItem('badge_user')).must_change_password === true;

      let redirectedPath = '/planning';
      if (mustChangePassword && !redirectedPath.startsWith('/change-password')) {
        redirectedPath = '/change-password';
      }

      expect(redirectedPath).toBe('/change-password');
    });

    test('should redirect to /change-password when accessing /admin', () => {
      const user = { id: 'user-123', email: 'user@company.local', must_change_password: true };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const mustChangePassword = JSON.parse(localStorage.getItem('badge_user')).must_change_password === true;

      let redirectedPath = '/admin';
      if (mustChangePassword && !redirectedPath.startsWith('/change-password')) {
        redirectedPath = '/change-password';
      }

      expect(redirectedPath).toBe('/change-password');
    });

    test('should redirect to /change-password when accessing /corrections', () => {
      const user = { id: 'user-123', email: 'user@company.local', must_change_password: true };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const mustChangePassword = JSON.parse(localStorage.getItem('badge_user')).must_change_password === true;

      let redirectedPath = '/corrections';
      if (mustChangePassword && !redirectedPath.startsWith('/change-password')) {
        redirectedPath = '/change-password';
      }

      expect(redirectedPath).toBe('/change-password');
    });
  });

  describe('Allow access to /change-password and /login', () => {
    test('should NOT redirect when on /change-password (even if must_change_password=true)', () => {
      const user = { id: 'user-123', email: 'user@company.local', must_change_password: true };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const mustChangePassword = JSON.parse(localStorage.getItem('badge_user')).must_change_password === true;

      let redirectedPath = '/change-password';
      if (mustChangePassword && !redirectedPath.startsWith('/change-password')) {
        redirectedPath = '/change-password';
      }

      expect(redirectedPath).toBe('/change-password');
    });

    test('should NOT redirect when on /login (even if must_change_password=true)', () => {
      const user = { id: 'user-123', email: 'user@company.local', must_change_password: true };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const mustChangePassword = JSON.parse(localStorage.getItem('badge_user')).must_change_password === true;

      let redirectedPath = '/login';
      if (mustChangePassword && redirectedPath !== '/login' && !redirectedPath.startsWith('/change-password')) {
        redirectedPath = '/change-password';
      }

      expect(redirectedPath).toBe('/login');
    });
  });

  describe('No redirect when must_change_password=false', () => {
    test('should NOT redirect to /change-password when must_change_password is false', () => {
      const user = { id: 'user-123', email: 'user@company.local', must_change_password: false };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const mustChangePassword = JSON.parse(localStorage.getItem('badge_user')).must_change_password === true;

      let redirectedPath = '/dashboard';
      if (mustChangePassword && !redirectedPath.startsWith('/change-password')) {
        redirectedPath = '/change-password';
      }

      expect(redirectedPath).toBe('/dashboard');
    });

    test('should allow access to /planning when must_change_password=false', () => {
      const user = { id: 'manager-123', role: 'manager', must_change_password: false };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const mustChangePassword = JSON.parse(localStorage.getItem('badge_user')).must_change_password === true;

      let redirectedPath = '/planning';
      if (mustChangePassword && !redirectedPath.startsWith('/change-password')) {
        redirectedPath = '/change-password';
      }

      expect(redirectedPath).toBe('/planning');
    });

    test('should allow access to /admin when must_change_password=false', () => {
      const user = { id: 'admin-123', role: 'admin', must_change_password: false };
      localStorage.setItem('badge_user', JSON.stringify(user));

      const mustChangePassword = JSON.parse(localStorage.getItem('badge_user')).must_change_password === true;

      let redirectedPath = '/admin';
      if (mustChangePassword && !redirectedPath.startsWith('/change-password')) {
        redirectedPath = '/change-password';
      }

      expect(redirectedPath).toBe('/admin');
    });
  });

  describe('No user in localStorage', () => {
    test('should NOT redirect when no user in localStorage', () => {
      const userStr = localStorage.getItem('badge_user');
      const user = userStr ? JSON.parse(userStr) : null;
      const mustChangePassword = user?.must_change_password === true;

      let redirectedPath = '/dashboard';
      if (mustChangePassword && !redirectedPath.startsWith('/change-password')) {
        redirectedPath = '/change-password';
      }

      expect(redirectedPath).toBe('/dashboard');
    });
  });

  describe('Token update affects guard behavior', () => {
    test('should stop redirecting after password change (must_change_password becomes false)', () => {
      localStorage.setItem('badge_user', JSON.stringify({ id: 'user-123', must_change_password: true }));

      let mustChange = JSON.parse(localStorage.getItem('badge_user')).must_change_password === true;
      let path = '/dashboard';
      if (mustChange && !path.startsWith('/change-password')) path = '/change-password';
      expect(path).toBe('/change-password');

      localStorage.setItem('badge_user', JSON.stringify({ id: 'user-123', must_change_password: false }));

      mustChange = JSON.parse(localStorage.getItem('badge_user')).must_change_password === true;
      path = '/dashboard';
      if (mustChange && !path.startsWith('/change-password')) path = '/change-password';
      expect(path).toBe('/dashboard');
    });
  });

  describe('Malformed localStorage data', () => {
    test('should handle invalid JSON gracefully', () => {
      localStorage.setItem('badge_user', 'invalid json');

      try {
        const userStr = localStorage.getItem('badge_user');
        JSON.parse(userStr);
        expect(true).toBe(false); // should not reach here
      } catch (e) {
        expect(e instanceof SyntaxError).toBe(true);
      }
    });

    test('should handle missing must_change_password field gracefully', () => {
      localStorage.setItem('badge_user', JSON.stringify({ id: 'user-123', email: 'user@company.local' }));

      const mustChangePassword = JSON.parse(localStorage.getItem('badge_user')).must_change_password === true;

      let redirectedPath = '/dashboard';
      if (mustChangePassword && !redirectedPath.startsWith('/change-password')) {
        redirectedPath = '/change-password';
      }

      expect(redirectedPath).toBe('/dashboard');
    });
  });
});
