import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import authService from '../services/authService';

vi.mock('../services/authService', () => ({
  default: { login: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

function submit(email = 'admin@company.com', password = 'Passw0rd!2026') {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('LoginPage — post-login redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  test('redirects to /dashboard for an admin whose client already has sites', async () => {
    authService.login.mockResolvedValue({
      data: { token: 'jwt', refresh_token: 'rt', user: { role: 'admin', has_sites: true } },
    });
    renderPage();
    submit();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'));
  });

  test('redirects to /admin/onboarding for an admin whose client has no sites yet', async () => {
    authService.login.mockResolvedValue({
      data: { token: 'jwt', refresh_token: 'rt', user: { role: 'admin', has_sites: false } },
    });
    renderPage();
    submit();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin/onboarding'));
  });

  test('redirects to /dashboard for a manager (has_sites not applicable)', async () => {
    authService.login.mockResolvedValue({
      data: { token: 'jwt', refresh_token: 'rt', user: { role: 'manager' } },
    });
    renderPage();
    submit();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'));
  });

  test('redirects to /dashboard for an employee (has_sites not applicable)', async () => {
    authService.login.mockResolvedValue({
      data: { token: 'jwt', refresh_token: 'rt', user: { role: 'employee' } },
    });
    renderPage();
    submit();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'));
  });

  test('shows an error and does not navigate when login fails', async () => {
    authService.login.mockRejectedValue({
      response: { data: { message: 'Email or password is incorrect' } },
    });
    renderPage();
    submit();

    await waitFor(() => expect(screen.getByText(/email or password is incorrect/i)).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
