import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { NavBar } from '../NavBar';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { name: 'Maria Rossi', role: 'employee', email: 'maria@torino.it' },
    loading: false,
  }),
}));

vi.mock('../../services/authService', () => ({
  default: { logout: vi.fn().mockResolvedValue(undefined) },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderNavBar = (props = {}) =>
  render(
    <BrowserRouter>
      <NavBar title="Badge System" {...props} />
    </BrowserRouter>
  );

describe('NavBar', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders title', () => {
    renderNavBar({ title: 'Badge System' });
    expect(screen.getByText('Badge System')).toBeInTheDocument();
  });

  it('renders avatar with initials MR for Maria Rossi', () => {
    renderNavBar();
    expect(screen.getByText('MR')).toBeInTheDocument();
  });

  it('renders children as nav actions', () => {
    renderNavBar({
      title: 'Test',
      children: <button>← Dashboard</button>,
    });
    expect(screen.getByText('← Dashboard')).toBeInTheDocument();
  });

  it('opens dropdown on avatar click', () => {
    renderNavBar();
    fireEvent.click(screen.getByText('MR'));
    expect(screen.getByText('Maria Rossi')).toBeInTheDocument();
    expect(screen.getByText('employee')).toBeInTheDocument();
  });

  it('navigates to /change-password with voluntary state on "Cambia password"', async () => {
    renderNavBar();
    fireEvent.click(screen.getByText('MR'));
    fireEvent.click(screen.getByText(/Cambia password/i));
    expect(mockNavigate).toHaveBeenCalledWith('/change-password', {
      state: { voluntary: true },
    });
  });

  it('calls logout and navigates to /login on "Esci"', async () => {
    const authService = (await import('../../services/authService')).default;
    renderNavBar();
    fireEvent.click(screen.getByText('MR'));
    fireEvent.click(screen.getByText(/Esci/i));
    await waitFor(() => {
      expect(authService.logout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('does not render Logout button (removed from navbar)', () => {
    renderNavBar();
    expect(screen.queryByText('Logout')).not.toBeInTheDocument();
  });
});
