import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DemoBanner from '../components/DemoBanner';
import apiClient from '../services/apiClient';
import authService from '../services/authService';

vi.mock('../services/apiClient', () => ({
  default: { post: vi.fn() },
}));

vi.mock('../services/authService', () => ({
  default: {
    isDemo: vi.fn(),
    getDemoDaysRemaining: vi.fn(),
    setSession: vi.fn(),
  },
}));

describe('DemoBanner', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    delete window.location;
    window.location = { ...originalLocation, href: '/dashboard' };
  });

  test('renders nothing when the session is not a demo', () => {
    authService.isDemo.mockReturnValue(false);
    const { container } = render(<DemoBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows days remaining and the 3 role-switch buttons for a demo session', () => {
    authService.isDemo.mockReturnValue(true);
    authService.getDemoDaysRemaining.mockReturnValue(5);

    render(<DemoBanner />);

    expect(screen.getByTestId('demo-banner')).toBeInTheDocument();
    expect(screen.getByText(/5 giorni rimanenti/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guarda come admin/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guarda come manager/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guarda come dipendente/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /parliamo/i })).toBeInTheDocument();
  });

  test('uses singular "giorno rimanente" when 1 day is left', () => {
    authService.isDemo.mockReturnValue(true);
    authService.getDemoDaysRemaining.mockReturnValue(1);

    render(<DemoBanner />);

    expect(screen.getByText(/1 giorno rimanente/i)).toBeInTheDocument();
  });

  test('clicking a role button calls POST /demo/switch-role, persists the session and hard-reloads to /dashboard', async () => {
    authService.isDemo.mockReturnValue(true);
    authService.getDemoDaysRemaining.mockReturnValue(3);
    apiClient.post.mockResolvedValue({
      data: { data: { token: 'new-tok', refresh_token: 'new-refresh', user: { id: 'u-manager', role: 'manager' }, is_demo: true, demo_expires_at: '2099-01-01T00:00:00.000Z' } },
    });

    render(<DemoBanner />);
    fireEvent.click(screen.getByRole('button', { name: /guarda come manager/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/demo/switch-role', { role: 'manager' });
    });
    await waitFor(() => {
      expect(authService.setSession).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'new-tok', is_demo: true })
      );
    });
    await waitFor(() => {
      expect(window.location.href).toBe('/dashboard');
    });
  });

  test('shows an inline error and re-enables buttons when switch-role fails', async () => {
    authService.isDemo.mockReturnValue(true);
    authService.getDemoDaysRemaining.mockReturnValue(3);
    apiClient.post.mockRejectedValue({ response: { data: { message: 'Qualcosa è andato storto' } } });

    render(<DemoBanner />);
    fireEvent.click(screen.getByRole('button', { name: /guarda come admin/i }));

    await waitFor(() => {
      expect(screen.getByText(/qualcosa è andato storto/i)).toBeInTheDocument();
    });
    expect(authService.setSession).not.toHaveBeenCalled();
  });

  test('clicking "Parliamo" opens the contact modal', () => {
    authService.isDemo.mockReturnValue(true);
    authService.getDemoDaysRemaining.mockReturnValue(3);

    render(<DemoBanner />);
    fireEvent.click(screen.getByRole('button', { name: /parliamo/i }));

    // DemoContactModal renders a dialog with this title once open
    expect(screen.getByRole('heading', { name: /parliamo/i })).toBeInTheDocument();
  });
});
