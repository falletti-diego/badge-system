import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import ChangePasswordPage from '../pages/ChangePasswordPage';
import apiClient from '../services/apiClient';

// Mock apiClient
jest.mock('../services/apiClient');

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock authService
jest.mock('../services/authService', () => ({
  logout: jest.fn(),
}));

describe('ChangePasswordPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
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

      // Verify heading
      expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();

      // Verify all input fields
      expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();

      // Verify submit button
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();

      // Verify info box
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

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

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

      const oldPasswordField = screen.getByLabelText(/current password/i);
      fireEvent.change(oldPasswordField, { target: { value: 'OldPassword123' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

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

      const oldPasswordField = screen.getByLabelText(/current password/i);
      const newPasswordField = screen.getByLabelText(/^new password/i);

      fireEvent.change(oldPasswordField, { target: { value: 'OldPassword123' } });
      fireEvent.change(newPasswordField, { target: { value: 'Short' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
      });
    });

    test('should show error when passwords do not match', async () => {
      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      const oldPasswordField = screen.getByLabelText(/current password/i);
      const newPasswordField = screen.getByLabelText(/^new password/i);
      const confirmPasswordField = screen.getByLabelText(/confirm new password/i);

      fireEvent.change(oldPasswordField, { target: { value: 'OldPassword123' } });
      fireEvent.change(newPasswordField, { target: { value: 'NewPassword123' } });
      fireEvent.change(confirmPasswordField, { target: { value: 'DifferentPassword123' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

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

      const oldPasswordField = screen.getByLabelText(/current password/i);
      const newPasswordField = screen.getByLabelText(/^new password/i);
      const confirmPasswordField = screen.getByLabelText(/confirm new password/i);

      fireEvent.change(oldPasswordField, { target: { value: 'SamePassword123' } });
      fireEvent.change(newPasswordField, { target: { value: 'SamePassword123' } });
      fireEvent.change(confirmPasswordField, { target: { value: 'SamePassword123' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/new password must be different from current password/i)
        ).toBeInTheDocument();
      });
    });

    test('should clear field error when user starts typing', async () => {
      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      const oldPasswordField = screen.getByLabelText(/current password/i);

      // Trigger error
      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/current password is required/i)).toBeInTheDocument();
      });

      // User types
      fireEvent.change(oldPasswordField, { target: { value: 'Password' } });

      // Error should be cleared
      await waitFor(() => {
        expect(screen.queryByText(/current password is required/i)).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Test 3: Success Flow (Opzione A)
  // =========================================================================
  describe('Success Flow (Opzione A: Auto-Redirect)', () => {
    test('should submit form and update localStorage', async () => {
      const mockResponse = {
        data: {
          token: 'new.jwt.token',
          refresh_token: 'new.refresh.token',
          user: {
            id: 'user-123',
            email: 'user@company.local',
            must_change_password: false,
          },
        },
      };

      apiClient.post.mockResolvedValue(mockResponse);

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      const oldPasswordField = screen.getByLabelText(/current password/i);
      const newPasswordField = screen.getByLabelText(/^new password/i);
      const confirmPasswordField = screen.getByLabelText(/confirm new password/i);

      fireEvent.change(oldPasswordField, { target: { value: 'OldPassword123' } });
      fireEvent.change(newPasswordField, { target: { value: 'NewPassword123' } });
      fireEvent.change(confirmPasswordField, { target: { value: 'NewPassword123' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

      // Verify API call
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/auth/change-password', {
          old_password: 'OldPassword123',
          new_password: 'NewPassword123',
        });
      });

      // Verify localStorage updated
      await waitFor(() => {
        expect(localStorage.getItem('badge_auth_token')).toBe('new.jwt.token');
        expect(localStorage.getItem('badge_refresh_token')).toBe('new.refresh.token');
        expect(JSON.parse(localStorage.getItem('badge_user')).must_change_password).toBe(
          false
        );
      });

      // Verify success message
      await waitFor(() => {
        expect(screen.getByText(/password changed successfully/i)).toBeInTheDocument();
      });

      // Verify redirect after 1 second
      jest.useFakeTimers();
      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
      });

      jest.useRealTimers();
    });
  });

  // =========================================================================
  // Test 4: Error Handling (Opzione B: Intelligente)
  // =========================================================================
  describe('Error Handling (Opzione B: Intelligente)', () => {
    test('should handle 400 validation error and allow retry', async () => {
      const errorResponse = {
        response: {
          status: 400,
          data: {
            message: 'Current password is incorrect',
          },
        },
      };

      apiClient.post.mockRejectedValue(errorResponse);

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      const oldPasswordField = screen.getByLabelText(/current password/i);
      const newPasswordField = screen.getByLabelText(/^new password/i);
      const confirmPasswordField = screen.getByLabelText(/confirm new password/i);

      fireEvent.change(oldPasswordField, { target: { value: 'WrongPassword' } });
      fireEvent.change(newPasswordField, { target: { value: 'NewPassword123' } });
      fireEvent.change(confirmPasswordField, { target: { value: 'NewPassword123' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

      // Verify error message
      await waitFor(() => {
        expect(screen.getByText(/current password is incorrect/i)).toBeInTheDocument();
      });

      // Verify NO logout (token still in localStorage)
      const userBefore = localStorage.getItem('badge_auth_token');

      // Verify button re-enabled for retry
      await waitFor(() => {
        expect(submitButton).not.toHaveAttribute('disabled');
      });

      // Verify NO redirect
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('should handle 500 server error and allow retry', async () => {
      const errorResponse = {
        response: {
          status: 500,
          data: {
            message: 'Internal server error',
          },
        },
      };

      apiClient.post.mockRejectedValue(errorResponse);

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      const oldPasswordField = screen.getByLabelText(/current password/i);
      const newPasswordField = screen.getByLabelText(/^new password/i);
      const confirmPasswordField = screen.getByLabelText(/confirm new password/i);

      fireEvent.change(oldPasswordField, { target: { value: 'OldPassword123' } });
      fireEvent.change(newPasswordField, { target: { value: 'NewPassword123' } });
      fireEvent.change(confirmPasswordField, { target: { value: 'NewPassword123' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

      // Verify error message mentions server
      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument();
      });

      // Verify button re-enabled
      await waitFor(() => {
        expect(submitButton).not.toHaveAttribute('disabled');
      });

      // Verify NO logout
      expect(mockNavigate).not.toHaveBeenCalledWith('/login', { replace: true });
    });

    test('should handle network error and allow retry', async () => {
      const errorResponse = {
        request: {}, // No response (network error)
      };

      apiClient.post.mockRejectedValue(errorResponse);

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      const oldPasswordField = screen.getByLabelText(/current password/i);
      const newPasswordField = screen.getByLabelText(/^new password/i);
      const confirmPasswordField = screen.getByLabelText(/confirm new password/i);

      fireEvent.change(oldPasswordField, { target: { value: 'OldPassword123' } });
      fireEvent.change(newPasswordField, { target: { value: 'NewPassword123' } });
      fireEvent.change(confirmPasswordField, { target: { value: 'NewPassword123' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

      // Verify error message mentions network
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      // Verify button re-enabled
      await waitFor(() => {
        expect(submitButton).not.toHaveAttribute('disabled');
      });
    });

    test('should handle 401 session revoked and logout', async () => {
      const authService = require('../services/authService').default;
      const errorResponse = {
        response: {
          status: 401,
          data: {
            message: 'Session revoked',
          },
        },
      };

      apiClient.post.mockRejectedValue(errorResponse);

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      const oldPasswordField = screen.getByLabelText(/current password/i);
      const newPasswordField = screen.getByLabelText(/^new password/i);
      const confirmPasswordField = screen.getByLabelText(/confirm new password/i);

      fireEvent.change(oldPasswordField, { target: { value: 'OldPassword123' } });
      fireEvent.change(newPasswordField, { target: { value: 'NewPassword123' } });
      fireEvent.change(confirmPasswordField, { target: { value: 'NewPassword123' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

      // Verify error message
      await waitFor(() => {
        expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
      });

      // Verify logout called
      await waitFor(() => {
        expect(authService.logout).toHaveBeenCalled();
      });

      // Verify redirect to login
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
      });
    });
  });

  // =========================================================================
  // Test 5: Loading State
  // =========================================================================
  describe('Loading State', () => {
    test('should disable button while submitting', async () => {
      apiClient.post.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      const oldPasswordField = screen.getByLabelText(/current password/i);
      const newPasswordField = screen.getByLabelText(/^new password/i);
      const confirmPasswordField = screen.getByLabelText(/confirm new password/i);

      fireEvent.change(oldPasswordField, { target: { value: 'OldPassword123' } });
      fireEvent.change(newPasswordField, { target: { value: 'NewPassword123' } });
      fireEvent.change(confirmPasswordField, { target: { value: 'NewPassword123' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

      // Button should show loading text
      await waitFor(() => {
        expect(screen.getByText(/changing password/i)).toBeInTheDocument();
      });

      // Button should be disabled
      expect(submitButton).toHaveAttribute('disabled');
    });

    test('should disable all form fields while submitting', async () => {
      apiClient.post.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      render(
        <Router>
          <ChangePasswordPage />
        </Router>
      );

      const oldPasswordField = screen.getByLabelText(/current password/i);
      const newPasswordField = screen.getByLabelText(/^new password/i);
      const confirmPasswordField = screen.getByLabelText(/confirm new password/i);

      fireEvent.change(oldPasswordField, { target: { value: 'OldPassword123' } });
      fireEvent.change(newPasswordField, { target: { value: 'NewPassword123' } });
      fireEvent.change(confirmPasswordField, { target: { value: 'NewPassword123' } });

      const submitButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(oldPasswordField).toHaveAttribute('disabled');
        expect(newPasswordField).toHaveAttribute('disabled');
        expect(confirmPasswordField).toHaveAttribute('disabled');
      });
    });
  });
});
