import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AcceptInvitePage from '../pages/AcceptInvitePage';
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
  default: { setSession: vi.fn() },
}));

function renderPage(token = 'valid-raw-token') {
  return render(
    <MemoryRouter initialEntries={[`/accetta-invito?token=${token}`]}>
      <AcceptInvitePage />
    </MemoryRouter>
  );
}

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  test('renders the form asking for name and password', () => {
    renderPage();
    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /imposta password/i })).toBeInTheDocument();
  });

  test('submitting calls POST /onboarding/invite/:token/accept with the token from the query string', async () => {
    apiClient.post.mockResolvedValue({
      data: { data: { token: 'jwt', refresh_token: 'rt', user: { role: 'admin' } } },
    });
    renderPage('token-from-url');

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Mario Admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Passw0rd!2026' } });
    fireEvent.click(screen.getByRole('button', { name: /imposta password/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/onboarding/invite/token-from-url/accept',
      { name: 'Mario Admin', password: 'Passw0rd!2026' }
    ));
  });

  test('on success, sets the session and redirects to the onboarding wizard', async () => {
    const session = { token: 'jwt', refresh_token: 'rt', user: { role: 'admin' } };
    apiClient.post.mockResolvedValue({ data: { data: session } });
    renderPage();

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Mario Admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Passw0rd!2026' } });
    fireEvent.click(screen.getByRole('button', { name: /imposta password/i }));

    await waitFor(() => expect(authService.setSession).toHaveBeenCalledWith(session));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/onboarding');
  });

  test('shows a clear error message when the invite is invalid/expired, no redirect, no session set', async () => {
    apiClient.post.mockRejectedValue({
      response: { status: 404, data: { message: 'Invito non valido o scaduto' } },
    });
    renderPage();

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Mario Admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Passw0rd!2026' } });
    fireEvent.click(screen.getByRole('button', { name: /imposta password/i }));

    await waitFor(() => expect(screen.getByText(/invito non valido o scaduto/i)).toBeInTheDocument());
    expect(authService.setSession).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('shows a validation error if password is submitted empty, does not call the API', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Mario Admin' } });
    fireEvent.click(screen.getByRole('button', { name: /imposta password/i }));

    await waitFor(() => expect(screen.getByText(/password.*obbligatoria/i)).toBeInTheDocument());
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
