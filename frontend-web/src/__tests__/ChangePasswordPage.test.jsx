import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import ChangePasswordPage from '../pages/ChangePasswordPage';
import apiClient from '../services/apiClient';
import authService from '../services/authService';

vi.mock('../services/apiClient', () => ({
  default: { post: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../services/authService', () => ({
  default: { logout: vi.fn() },
}));

const clearStorage = () => {
  localStorage.removeItem('badge_auth_token');
  localStorage.removeItem('badge_refresh_token');
  localStorage.removeItem('badge_user');
};

describe('ChangePasswordPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    clearStorage();
  });

  // =========================================================================
  // Test 1: Rendering
  // =========================================================================
  describe('Rendering', () => {
    test('should render all form fields', () => {
      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });

    test('should render with all fields empty initially', () => {
      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      expect(screen.getByLabelText(/current password/i)).toHaveValue('');
      expect(screen.getByLabelText(/^new password/i)).toHaveValue('');
      expect(screen.getByLabelText(/confirm new password/i)).toHaveValue('');
    });
  });

  // =========================================================================
  // Test 2: Client-Side Validation
  // =========================================================================
  describe('Client-Side Validation', () => {
    test('should show error when old password is empty', async () => {
      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        expect(screen.getByText(/current password is required/i)).toBeInTheDocument();
      });
    });

    test('should show error when new password is empty', async () => {
      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        expect(screen.getByText(/new password is required/i)).toBeInTheDocument();
      });
    });

    test('should show error when new password is too short', async () => {
      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPassword123' } });
      fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'Short' } });
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        // Use exact validation message to avoid matching the static Requirements box
        expect(screen.getByText(/Password must be at least 8 characters/i)).toBeInTheDocument();
      });
    });

    test('should show error when passwords do not match', async () => {
      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPassword123' } });
      fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'DifferentPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
    });

    test('should show error when new password equals old password', async () => {
      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'SamePassword123' } });
      fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'SamePassword123' } });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'SamePassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        expect(screen.getByText(/new password must be different from current password/i)).toBeInTheDocument();
      });
    });

    test('should clear field error when user starts typing', async () => {
      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      const oldPasswordField = screen.getByLabelText(/current password/i);

      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        expect(screen.getByText(/current password is required/i)).toBeInTheDocument();
      });

      fireEvent.change(oldPasswordField, { target: { value: 'Password' } });

      await waitFor(() => {
        expect(screen.queryByText(/current password is required/i)).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Test 3: Success Flow
  // Component calls authService.logout() + navigates to /login after 2s
  // =========================================================================
  describe('Success Flow', () => {
    test('should submit form, call API, show success message and logout', async () => {
      // Component does: response.data.data.{token, refresh_token, user}
      const mockResponse = {
        data: {
          data: {
            token: 'new.jwt.token',
            refresh_token: 'new.refresh.token',
            user: { id: 'user-123', email: 'user@company.local', must_change_password: false },
          },
        },
      };

      apiClient.post.mockResolvedValue(mockResponse);

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPassword123' } });
      fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/auth/change-password', {
          old_password: 'OldPassword123',
          new_password: 'NewPassword123',
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/password changed successfully/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(authService.logout).toHaveBeenCalled();
      });
    });

    test('should redirect to /login after 2 seconds on success', async () => {
      const mockResponse = {
        data: {
          data: {
            token: 'new.jwt.token',
            refresh_token: 'new.refresh.token',
            user: { id: 'user-123', email: 'user@company.local', must_change_password: false },
          },
        },
      };

      apiClient.post.mockResolvedValue(mockResponse);

      vi.useFakeTimers();

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPassword123' } });
      fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await vi.runAllTimersAsync();

      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });

      vi.useRealTimers();
    });
  });

  // =========================================================================
  // Test 4: Error Handling
  // =========================================================================
  describe('Error Handling', () => {
    test('should handle 400 validation error and allow retry', async () => {
      apiClient.post.mockRejectedValue({
        response: { status: 400, data: { message: 'Current password is incorrect' } },
      });

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'WrongPassword' } });
      fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        expect(screen.getByText(/current password is incorrect/i)).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('should handle 500 server error and allow retry', async () => {
      apiClient.post.mockRejectedValue({
        response: { status: 500, data: { message: 'Internal server error' } },
      });

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPassword123' } });
      fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalledWith('/login', { replace: true });
    });

    test('should handle network error and allow retry', async () => {
      apiClient.post.mockRejectedValue({ request: {} });

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPassword123' } });
      fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });

    test('should handle 401 session revoked and logout', async () => {
      apiClient.post.mockRejectedValue({
        response: { status: 401, data: { message: 'Session revoked' } },
      });

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPassword123' } });
      fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(authService.logout).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
      });
    });
  });

  // =========================================================================
  // Test 5: Loading State
  // =========================================================================
  describe('Loading State', () => {
    test('should show loading text while submitting', async () => {
      apiClient.post.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPassword123' } });
      fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPassword123' } });

      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      await waitFor(() => {
        expect(screen.getByText(/changing password/i)).toBeInTheDocument();
      });
    });

    test('should disable submit button while submitting', async () => {
      apiClient.post.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPassword123' } });
      fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPassword123' } });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPassword123' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(submitButton).toHaveAttribute('disabled');
      });
    });
  });
});
