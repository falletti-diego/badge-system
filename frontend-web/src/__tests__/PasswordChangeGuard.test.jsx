import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PasswordChangeGuard } from '../App';

/**
 * Tests the REAL PasswordChangeGuard component from App.jsx (exported for
 * testability — see the code-review finding on commit ec9db24: the previous
 * version of this file hand-copied the guard's conditional logic into local
 * variables instead of exercising the actual component, so it would keep
 * passing even if the real guard were broken).
 *
 * The guard reads `localStorage['badge_must_change_password'] === 'true'`
 * (a plain string flag, not JSON) and, when true, redirects away from any
 * path except /change-password, /login, and /prova-demo (the public
 * self-service demo landing page — see Task 7 code review).
 */

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderGuardAt(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <PasswordChangeGuard>
        <div data-testid="guarded-child">child content</div>
      </PasswordChangeGuard>
    </MemoryRouter>
  );
}

describe('PasswordChangeGuard (real component)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('badge_must_change_password');
  });

  describe('Redirect when must_change_password=true', () => {
    test('redirects to /change-password when on /dashboard', () => {
      localStorage.setItem('badge_must_change_password', 'true');
      renderGuardAt('/dashboard');
      expect(mockNavigate).toHaveBeenCalledWith('/change-password', { replace: true });
    });

    test('redirects to /change-password when on /planning', () => {
      localStorage.setItem('badge_must_change_password', 'true');
      renderGuardAt('/planning');
      expect(mockNavigate).toHaveBeenCalledWith('/change-password', { replace: true });
    });

    test('redirects to /change-password when on /admin', () => {
      localStorage.setItem('badge_must_change_password', 'true');
      renderGuardAt('/admin');
      expect(mockNavigate).toHaveBeenCalledWith('/change-password', { replace: true });
    });

    test('redirects to /change-password when on /corrections', () => {
      localStorage.setItem('badge_must_change_password', 'true');
      renderGuardAt('/corrections');
      expect(mockNavigate).toHaveBeenCalledWith('/change-password', { replace: true });
    });
  });

  describe('Allow access to exempt paths even when must_change_password=true', () => {
    test('does NOT redirect when on /change-password', () => {
      localStorage.setItem('badge_must_change_password', 'true');
      renderGuardAt('/change-password');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('does NOT redirect when on /login', () => {
      localStorage.setItem('badge_must_change_password', 'true');
      renderGuardAt('/login');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // Regression test for the code-review finding on commit ec9db24: the
    // public demo landing page must stay reachable even for a visitor whose
    // browser has a stale must_change_password flag from an earlier,
    // unrelated real session.
    test('does NOT redirect when on /prova-demo', () => {
      localStorage.setItem('badge_must_change_password', 'true');
      renderGuardAt('/prova-demo');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // Regression test for Task 8: /demo-expired must also stay reachable
    // without ProtectedRoute even with a stale must_change_password flag,
    // same reasoning as /prova-demo above.
    test('does NOT redirect when on /demo-expired', () => {
      localStorage.setItem('badge_must_change_password', 'true');
      renderGuardAt('/demo-expired');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('No redirect when must_change_password is false or absent', () => {
    test('does NOT redirect when flag is explicitly "false"', () => {
      localStorage.setItem('badge_must_change_password', 'false');
      renderGuardAt('/dashboard');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('does NOT redirect when flag is absent from localStorage', () => {
      renderGuardAt('/dashboard');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('does NOT redirect on /planning when flag is absent', () => {
      renderGuardAt('/planning');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Renders children regardless of guard state', () => {
    test('renders children when redirecting (guard does not block rendering)', () => {
      localStorage.setItem('badge_must_change_password', 'true');
      renderGuardAt('/dashboard');
      expect(screen.getByTestId('guarded-child')).toBeInTheDocument();
    });

    test('renders children when not redirecting', () => {
      renderGuardAt('/dashboard');
      expect(screen.getByTestId('guarded-child')).toBeInTheDocument();
    });
  });
});
