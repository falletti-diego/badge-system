import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ManagerLeaveRequest } from './ManagerLeaveRequest';
import * as authService from '../../../services/authService';

vi.mock('../../../services/authService', () => ({
  default: {
    getUser: vi.fn(),
    logout: vi.fn(),
  },
}));

const mockCreateRequest = vi.fn(async () => ({}));

const mockGetMyRequests = vi.fn(async () => [
  {
    id: 'req-1',
    leave_type: 'FERIE_1',
    start_date: '2026-07-01',
    end_date: '2026-07-05',
    status: 'APPROVED',
    created_at: '2026-06-13T10:00:00Z',
    num_days: 5,
  },
]);

const mockGetMyBalance = vi.fn(async () => [
  { leave_type: 'FERIE_1', year: 2026, total_days: 20, used_days: 8, remaining_days: 12 },
]);

vi.mock('../hooks/useLeave', () => ({
  useLeave: () => ({
    createRequest: mockCreateRequest,
    getMyRequests: mockGetMyRequests,
    getMyBalance: mockGetMyBalance,
    loading: false,
    error: null,
    clearError: vi.fn(),
    resetForm: vi.fn(),
  }),
}));

// Mock LeaveCalendar so form submission tests can trigger onDateChange directly
vi.mock('../components/LeaveCalendar', () => ({
  LeaveCalendar: ({ onDateChange }) => (
    <div data-testid="mock-calendar">
      <button
        type="button"
        onClick={() => onDateChange({ startDate: '2026-07-15', endDate: '2026-07-20' })}
      >
        Seleziona date
      </button>
      <button
        type="button"
        onClick={() => onDateChange({ startDate: '2026-07-15', endDate: '2026-07-15' })}
      >
        Seleziona singolo giorno
      </button>
    </div>
  ),
}));

const renderWithRouter = (component) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

// Helper: get the leave type combobox (always the first combobox rendered)
const getLeaveTypeSelect = () => screen.getAllByRole('combobox')[0];

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
    // Exact, case-sensitive match: the mock LeaveCalendar also renders a
    // "Seleziona date" button (lowercase d), which a case-insensitive regex
    // would also match.
    expect(screen.getByText('Seleziona Date')).toBeTruthy();
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

  it('should render a negative leave balance in red, not the default neutral color', async () => {
    mockGetMyBalance.mockResolvedValueOnce([
      { leave_type: 'FERIE_1', year: 2026, total_days: 5, used_days: 8, remaining_days: -3 },
      { leave_type: 'FERIE_2', year: 2026, total_days: 10, used_days: 10, remaining_days: 0 },
    ]);
    renderWithRouter(<ManagerLeaveRequest />);

    const negativeChip = await screen.findByText('Ferie 1: -3 gg disponibili');
    expect(negativeChip.closest('.MuiChip-root')).toHaveClass('MuiChip-colorError');

    const zeroChip = screen.getByText('Ferie 2: 0 gg disponibili');
    expect(zeroChip.closest('.MuiChip-root')).not.toHaveClass('MuiChip-colorError');
  });

  describe('Half-day toggle', () => {
    it('shows the half-day toggle only when start and end date are the same day', async () => {
      renderWithRouter(<ManagerLeaveRequest />);
      await waitFor(() => screen.getByText('Seleziona date'));

      fireEvent.click(screen.getByText('Seleziona date'));
      expect(screen.queryByLabelText(/mezza giornata/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Seleziona singolo giorno'));
      expect(screen.getByLabelText(/mezza giornata/i)).toBeInTheDocument();
    });

    it('sends half_day=true when the toggle is checked on a single-day request', async () => {
      renderWithRouter(<ManagerLeaveRequest />);
      await waitFor(() => screen.getByText('Seleziona date'));

      fireEvent.click(screen.getByText('Seleziona singolo giorno'));
      fireEvent.click(screen.getByLabelText(/mezza giornata/i));

      const leaveTypeSelect = getLeaveTypeSelect();
      fireEvent.mouseDown(leaveTypeSelect);
      fireEvent.click(await screen.findByRole('option', { name: 'Ferie 1' }));

      const submitButton = screen.getByRole('button', { name: /^Richiedi$/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateRequest).toHaveBeenCalledWith(
          'FERIE_1', '2026-07-15', '2026-07-15', '', true
        );
      });
    });
  });

  describe('Num days from API', () => {
    it('shows num_days from the API in the Giorni column instead of recalculating from dates', async () => {
      renderWithRouter(<ManagerLeaveRequest />);
      await waitFor(() => screen.getByText('Ferie 1'));
      // mockGetMyRequests row: start_date 2026-07-01, end_date 2026-07-05, num_days: 5
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });
});
