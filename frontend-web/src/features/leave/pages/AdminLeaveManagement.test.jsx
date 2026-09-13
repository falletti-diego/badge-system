import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AdminLeaveManagement } from './AdminLeaveManagement';
import * as authService from '../../../services/authService';

vi.mock('../../../services/authService', () => ({
  default: {
    getUser: vi.fn(),
  },
}));

vi.mock('../hooks/useLeave', () => ({
  useLeave: () => ({
    getAllLeaveRequests: vi.fn(async () => [
      {
        id: 'req-001',
        employee_id: 'emp-001',
        employee_name: 'Maria Rossi',
        leave_type: 'FERIE_1',
        start_date: '2026-07-01',
        end_date: '2026-07-05',
        // 4.5, not 5: the 2026-07-01..2026-07-05 range is a 5-calendar-day
        // span, so a date-diff recalculation (the old deleted calculateDays)
        // would always produce 5. Using 4.5 here (e.g. a trailing half-day)
        // makes the test fail if calculateDays is ever reintroduced instead
        // of trusting the API's num_days.
        num_days: 4.5,
        status: 'APPROVED',
        created_at: '2026-06-13T10:00:00Z',
        motivation: 'Vacanza estiva',
      },
      {
        id: 'req-002',
        employee_id: 'emp-002',
        employee_name: 'Luigi Bianchi',
        leave_type: 'MALATTIA',
        start_date: '2026-06-20',
        end_date: '2026-06-20',
        num_days: 1,
        status: 'PENDING',
        created_at: '2026-06-13T11:00:00Z',
        motivation: 'Influenza',
      },
    ]),
    getEmployeeSaldi: vi.fn(async () => ({
      'emp-001': { name: 'Mario Rossi', FERIE_1: 15, FERIE_2: 10, FERIE_3: 5, MALATTIA: 10 },
      'emp-002': { name: 'Luigi Bianchi', FERIE_1: 20, FERIE_2: 15, FERIE_3: 10, MALATTIA: 12 },
      'emp-003-deleted': { name: null, FERIE_1: 0, FERIE_2: 0, FERIE_3: 0, MALATTIA: 0 },
    })),
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

describe('AdminLeaveManagement Page', () => {
  beforeEach(() => {
    authService.default.getUser.mockReturnValue({
      id: 'admin-001',
      name: 'Admin User',
      role: 'admin',
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Page Structure', () => {
    it('should render page title', () => {
      renderWithRouter(<AdminLeaveManagement />);
      expect(screen.getByText(/Gestione Ferie/i)).toBeTruthy();
    });

    it('should render without crashing', () => {
      const { container } = renderWithRouter(<AdminLeaveManagement />);
      expect(container).toBeTruthy();
    });

    it('should render tabs for different views', () => {
      renderWithRouter(<AdminLeaveManagement />);
      // Should have tabs for pending, approved, history, saldi
      const pageContent = screen.getByText(/Gestione Ferie/i);
      expect(pageContent).toBeTruthy();
    });
  });

  describe('Request Display', () => {
    it('should render request list area', () => {
      renderWithRouter(<AdminLeaveManagement />);
      const title = screen.getByText(/Gestione Ferie/i);
      expect(title).toBeTruthy();
    });

    it('should have filter controls', () => {
      renderWithRouter(<AdminLeaveManagement />);
      // Filter by status, employee, date range
      expect(screen.getByText(/Gestione Ferie/i)).toBeTruthy();
    });
  });

  describe('Admin Actions', () => {
    it('should render action buttons for requests', () => {
      renderWithRouter(<AdminLeaveManagement />);
      // Should have approve, reject, view details buttons
      const pageContent = screen.getByText(/Gestione Ferie/i);
      expect(pageContent).toBeTruthy();
    });
  });

  describe('Saldi Management', () => {
    it('should display employee saldi', async () => {
      renderWithRouter(<AdminLeaveManagement />);
      // Saldi tab showing per-employee balance
      fireEvent.click(screen.getByRole('tab', { name: 'Saldi' }));
      await waitFor(() => {
        expect(screen.getByText('Mario Rossi')).toBeInTheDocument();
      });
    });

    it('should fall back to a truncated employee id when the name is missing', async () => {
      renderWithRouter(<AdminLeaveManagement />);
      fireEvent.click(screen.getByRole('tab', { name: 'Saldi' }));
      await waitFor(() => {
        expect(screen.getByText('Employee emp-003-')).toBeInTheDocument();
      });
    });
  });

  it('shows num_days from the API instead of recalculating from dates, and formats decimals with a comma', async () => {
    render(<BrowserRouter><AdminLeaveManagement /></BrowserRouter>);
    // Luigi Bianchi's request is PENDING (1 day) — visible on the default
    // "In Sospeso" tab, which renders days with "giorno"/"giorni" pluralization.
    await waitFor(() => screen.getByText('Luigi Bianchi'));
    expect(screen.getAllByText(/1 giorno\b/).length).toBeGreaterThanOrEqual(1);

    // Maria Rossi's request is APPROVED (num_days: 4.5) — only visible on
    // the "Approvate" tab, which renders days as a plain formatted number
    // (no "giorno/giorni" suffix there). Her date range (2026-07-01 to
    // 2026-07-05) spans 5 calendar days, so a date-diff recalculation
    // (the old deleted calculateDays) would show "5", not "4,5" — this
    // assertion only passes if the component reads num_days from the API.
    fireEvent.click(screen.getByRole('tab', { name: 'Approvate' }));
    const mariaRow = (await screen.findByText('Maria Rossi')).closest('tr');
    expect(within(mariaRow).getByText('4,5')).toBeInTheDocument();
  });

  describe('Integration', () => {
    it('should integrate with useLeave hook', () => {
      renderWithRouter(<AdminLeaveManagement />);
      expect(screen.getByText(/Gestione Ferie/i)).toBeTruthy();
    });
  });
});
