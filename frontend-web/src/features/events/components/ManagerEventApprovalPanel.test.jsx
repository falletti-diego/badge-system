import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ManagerEventApprovalPanel } from './ManagerEventApprovalPanel';
import * as authService from '../../../services/authService';

vi.mock('../../../services/authService', () => ({
  default: { getUser: vi.fn() },
}));

vi.mock('../hooks/useEvents', () => ({
  useEvents: () => ({
    getPendingRequests: vi.fn(async () => []),
    approveRequest: vi.fn(async () => ({})),
    rejectRequest: vi.fn(async () => ({})),
    loading: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

const renderWithRouter = (component) => render(<BrowserRouter>{component}</BrowserRouter>);

describe('ManagerEventApprovalPanel', () => {
  beforeEach(() => {
    authService.default.getUser.mockReturnValue({ id: 'mgr-456', name: 'Carlo Verdi', role: 'manager' });
    vi.clearAllMocks();
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('should render the panel title', () => {
    renderWithRouter(<ManagerEventApprovalPanel />);
    expect(screen.getByText(/Richieste Eventi\/Training in Sospeso/i)).toBeTruthy();
  });

  it('should render card component', () => {
    const { container } = renderWithRouter(<ManagerEventApprovalPanel />);
    expect(container.querySelector('.MuiCard-root')).toBeTruthy();
  });
});
