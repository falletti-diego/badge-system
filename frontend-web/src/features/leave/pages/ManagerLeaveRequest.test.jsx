import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ManagerLeaveRequest } from './ManagerLeaveRequest';
import * as authService from '../../../services/authService';

vi.mock('../../../services/authService', () => ({
  default: {
    getUser: vi.fn(),
    logout: vi.fn(),
  },
}));

const mockGetMyBalance = vi.fn(async () => [
  { leave_type: 'FERIE_1', year: 2026, total_days: 20, used_days: 8, remaining_days: 12 },
]);

vi.mock('../hooks/useLeave', () => ({
  useLeave: () => ({
    createRequest: vi.fn(async () => ({})),
    getMyRequests: vi.fn(async () => []),
    getMyBalance: mockGetMyBalance,
    loading: false,
    error: null,
    clearError: vi.fn(),
    resetForm: vi.fn(),
  }),
}));

const renderWithRouter = (component) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('ManagerLeaveRequest Page', () => {
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

  it('should render component without crashing', () => {
    const { container } = renderWithRouter(<ManagerLeaveRequest />);
    expect(container).toBeTruthy();
  });

  it('should have manager-specific heading', () => {
    renderWithRouter(<ManagerLeaveRequest />);
    expect(screen.getByText(/Richiedi Ferie - Manager/i)).toBeTruthy();
  });

  it('should render form fields', () => {
    renderWithRouter(<ManagerLeaveRequest />);
    // Check that form elements exist
    const formControlElements = screen.getAllByRole('combobox', { hidden: true });
    expect(formControlElements.length).toBeGreaterThan(0);
  });

  it('should render calendar section', () => {
    renderWithRouter(<ManagerLeaveRequest />);
    expect(screen.getByText(/Seleziona Date/i)).toBeTruthy();
  });

  it('should render action buttons', () => {
    renderWithRouter(<ManagerLeaveRequest />);
    const submitBtn = screen.getByRole('button', { name: /Richiedi/i });
    const cancelBtn = screen.getByRole('button', { name: /Annulla/i });
    expect(submitBtn).toBeTruthy();
    expect(cancelBtn).toBeTruthy();
  });

  it('should disable submit button initially', () => {
    renderWithRouter(<ManagerLeaveRequest />);
    const submitBtn = screen.getByRole('button', { name: /Richiedi/i });
    expect(submitBtn.disabled).toBe(true);
  });

  it('should render leave balance chips with remaining days per type', async () => {
    renderWithRouter(<ManagerLeaveRequest />);

    await waitFor(() => {
      expect(screen.getByText('Ferie 1: 12 gg disponibili')).toBeInTheDocument();
    });
    // Ferie 2/3 have no matching row in the mocked balance response — must default to 0.
    expect(screen.getByText('Ferie 2: 0 gg disponibili')).toBeInTheDocument();
    expect(screen.getByText('Ferie 3: 0 gg disponibili')).toBeInTheDocument();
  });
});
