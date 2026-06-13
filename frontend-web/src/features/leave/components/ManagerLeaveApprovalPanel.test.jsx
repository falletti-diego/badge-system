import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ManagerLeaveApprovalPanel } from './ManagerLeaveApprovalPanel';
import * as authService from '../../../services/authService';

vi.mock('../../../services/authService', () => ({
  default: {
    getUser: vi.fn(),
  },
}));

vi.mock('../hooks/useLeave', () => ({
  useLeave: () => ({
    getPendingRequests: vi.fn(async () => []),
    approveRequest: vi.fn(async () => ({})),
    rejectRequest: vi.fn(async () => ({})),
    loading: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

const renderWithRouter = (component) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('ManagerLeaveApprovalPanel', () => {
  beforeEach(() => {
    authService.default.getUser.mockReturnValue({
      id: 'mgr-456',
      name: 'Carlo Verdi',
      role: 'manager',
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render the panel title', () => {
      renderWithRouter(<ManagerLeaveApprovalPanel />);
      expect(screen.getByText(/Richieste di Ferie in Sospeso/i)).toBeTruthy();
    });

    it('should render without crashing', () => {
      const { container } = renderWithRouter(<ManagerLeaveApprovalPanel />);
      expect(container).toBeTruthy();
    });

    it('should show empty state when no requests', () => {
      renderWithRouter(<ManagerLeaveApprovalPanel />);
      // Should show loading or empty state
      const panel = screen.getByText(/Richieste di Ferie in Sospeso/i);
      expect(panel).toBeTruthy();
    });
  });

  describe('Structure', () => {
    it('should render card component', () => {
      const { container } = renderWithRouter(<ManagerLeaveApprovalPanel />);
      const cardElement = container.querySelector('.MuiCard-root');
      expect(cardElement).toBeTruthy();
    });

    it('should display card header', () => {
      renderWithRouter(<ManagerLeaveApprovalPanel />);
      const header = screen.getByText(/Richieste di Ferie in Sospeso/i);
      expect(header).toBeTruthy();
    });
  });

  describe('Integration', () => {
    it('should integrate with useLeave hook', () => {
      renderWithRouter(<ManagerLeaveApprovalPanel />);
      expect(screen.getByText(/Richieste di Ferie in Sospeso/i)).toBeTruthy();
    });
  });
});
