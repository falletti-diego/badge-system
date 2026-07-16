import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import TryDemoPage from '../pages/TryDemoPage';
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

describe('TryDemoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  test('should render hero claim, email field, CTA and GDPR micro-copy', () => {
    render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    expect(screen.getByText(/vedi le presenze del tuo negozio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/la tua email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entra nella demo/i })).toBeInTheDocument();
    expect(screen.getByText(/niente spam/i)).toBeInTheDocument();
  });

  test('should render the "Cosa vedrai" section with 3 screenshot placeholders', () => {
    render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    expect(screen.getByText(/cosa vedrai/i)).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Grafici Trend')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  test('should block submit and show inline error on invalid email', async () => {
    render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    fireEvent.change(screen.getByLabelText(/la tua email/i), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: /entra nella demo/i }));

    await waitFor(() => {
      expect(screen.getByText(/formato email non valido/i)).toBeInTheDocument();
    });

    expect(apiClient.post).not.toHaveBeenCalled();
  });

  test('should block submit and show inline error on empty email', async () => {
    render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    fireEvent.click(screen.getByRole('button', { name: /entra nella demo/i }));

    await waitFor(() => {
      expect(screen.getByText(/inserisci la tua email/i)).toBeInTheDocument();
    });

    expect(apiClient.post).not.toHaveBeenCalled();
  });

  test('on successful new-tenant response, calls /demo/start, stores session, and navigates to /dashboard', async () => {
    const mockResponse = {
      data: {
        data: {
          token: 'demo.jwt.token',
          refresh_token: 'demo.refresh.token',
          user: { id: 'user-1', email: 'prospect@example.com', role: 'admin' },
          resumed: false,
        },
      },
    };
    apiClient.post.mockResolvedValue(mockResponse);

    render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    fireEvent.change(screen.getByLabelText(/la tua email/i), { target: { value: 'prospect@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /entra nella demo/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/demo/start', { email: 'prospect@example.com' });
    });

    await waitFor(() => {
      // resetDemoTour: true — code-review Fix 2: POST /demo/start always
      // establishes a new-or-resumed demo session, so the tour's
      // "seen" flag must reset here (unlike DemoBanner's switch-role calls).
      expect(authService.setSession).toHaveBeenCalledWith(
        {
          token: 'demo.jwt.token',
          refresh_token: 'demo.refresh.token',
          user: { id: 'user-1', email: 'prospect@example.com', role: 'admin' },
        },
        { resetDemoTour: true }
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  test('on resumed:true response, shows "Bentornato" message instead of navigating immediately', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const mockResponse = {
      data: {
        data: {
          token: 'demo.jwt.token',
          refresh_token: 'demo.refresh.token',
          user: { id: 'user-1', email: 'prospect@example.com', role: 'admin' },
          resumed: true,
        },
      },
    };
    apiClient.post.mockResolvedValue(mockResponse);

    render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    fireEvent.change(screen.getByLabelText(/la tua email/i), { target: { value: 'prospect@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /entra nella demo/i }));

    await vi.waitFor(() => {
      expect(screen.getByText(/bentornato/i)).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');

    vi.useRealTimers();
  });

  test('shows inline error (no redirect) when the active-demo cap is reached', async () => {
    apiClient.post.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'TOO_MANY_ACTIVE_DEMOS',
          message: 'Troppe demo attive al momento, riprova più tardi o contattaci',
          statusCode: 409,
        },
      },
    });

    render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    fireEvent.change(screen.getByLabelText(/la tua email/i), { target: { value: 'prospect@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /entra nella demo/i }));

    await waitFor(() => {
      expect(screen.getByText(/troppe demo attive/i)).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(authService.setSession).not.toHaveBeenCalled();
  });

  test('shows inline error (no redirect) when rate-limited', async () => {
    apiClient.post.mockRejectedValue({
      response: {
        status: 429,
        data: {
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many demo requests, please retry after 3600 seconds',
          statusCode: 429,
          retryAfter: 3600,
        },
      },
    });

    render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    fireEvent.change(screen.getByLabelText(/la tua email/i), { target: { value: 'prospect@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /entra nella demo/i }));

    await waitFor(() => {
      expect(screen.getByText(/troppi tentativi/i)).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('shows inline error when the email is already a real customer account', async () => {
    apiClient.post.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'EMAIL_ALREADY_REGISTERED',
          message: 'Questo indirizzo è già registrato — contattaci se hai bisogno di aiuto',
          statusCode: 409,
        },
      },
    });

    render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    fireEvent.change(screen.getByLabelText(/la tua email/i), { target: { value: 'customer@realcompany.com' } });
    fireEvent.click(screen.getByRole('button', { name: /entra nella demo/i }));

    await waitFor(() => {
      expect(screen.getByText(/già registrato/i)).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('shows a generic inline error on network failure', async () => {
    apiClient.post.mockRejectedValue({ request: {} });

    render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    fireEvent.change(screen.getByLabelText(/la tua email/i), { target: { value: 'prospect@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /entra nella demo/i }));

    await waitFor(() => {
      expect(screen.getByText(/errore di rete/i)).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Regression test for code-review Fix 3: a real HTTP response with a
  // minimal/unexpected body (axios still sets err.request truthy in this
  // case) must NOT be misreported as "Errore di rete" — it should fall
  // through to the generic fallback message instead.
  test('shows the generic fallback (not "Errore di rete") when the response body has no message/details/known error code', async () => {
    apiClient.post.mockRejectedValue({
      request: {},
      response: {
        status: 404,
        data: { error: 'Not Found', path: '/api/v1/demo/start' },
      },
    });

    render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    fireEvent.change(screen.getByLabelText(/la tua email/i), { target: { value: 'prospect@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /entra nella demo/i }));

    await waitFor(() => {
      expect(screen.getByText(/qualcosa è andato storto/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/errore di rete/i)).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Regression test for code-review Fix 2: the resumed-branch setTimeout
  // must be cleared on unmount so a visitor who navigates away within the
  // confirmation window is never force-navigated later by a stale timer.
  test('clears the pending resumed-redirect timer on unmount (no late navigate call)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    apiClient.post.mockResolvedValue({
      data: {
        data: {
          token: 'demo.jwt.token',
          refresh_token: 'demo.refresh.token',
          user: { id: 'user-1', email: 'prospect@example.com', role: 'admin' },
          resumed: true,
        },
      },
    });

    const { unmount } = render(
      <Router>
        <TryDemoPage />
      </Router>
    );

    fireEvent.change(screen.getByLabelText(/la tua email/i), { target: { value: 'prospect@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /entra nella demo/i }));

    await vi.waitFor(() => {
      expect(screen.getByText(/bentornato/i)).toBeInTheDocument();
    });

    // Navigate away before the 1200ms confirmation window elapses.
    unmount();

    await vi.runAllTimersAsync();

    expect(mockNavigate).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
