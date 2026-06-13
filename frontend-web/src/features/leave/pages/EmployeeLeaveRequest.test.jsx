import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { EmployeeLeaveRequest } from './EmployeeLeaveRequest';
import * as authService from '../../../services/authService';

// Mock auth service
vi.mock('../../../services/authService', () => ({
  default: {
    getUser: vi.fn(),
    logout: vi.fn(),
  },
}));

// Mock useLeave hook
vi.mock('../hooks/useLeave', () => ({
  useLeave: () => ({
    createRequest: vi.fn(async () => ({
      id: 'req-123',
      status: 'PENDING',
      leave_type: 'FERIE_1',
      start_date: '2026-07-01',
      end_date: '2026-07-05',
    })),
    getMyRequests: vi.fn(async () => [
      {
        id: 'req-1',
        leave_type: 'FERIE_1',
        start_date: '2026-07-01',
        end_date: '2026-07-05',
        status: 'APPROVED',
        created_at: '2026-06-13T10:00:00Z',
        num_days: 5,
      },
    ]),
    loading: false,
    error: null,
    clearError: vi.fn(),
    resetForm: vi.fn(),
  }),
}));

const renderWithRouter = (component) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('EmployeeLeaveRequest Page', () => {
  beforeEach(() => {
    authService.default.getUser.mockReturnValue({
      id: 'emp-123',
      name: 'Mario Rossi',
      role: 'employee',
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render the page with heading', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(screen.getByText(/Richiedi Ferie/i)).toBeInTheDocument();
    });

    it('should render form section with all fields', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(screen.getByLabelText(/Tipo di Feria/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Note \(opzionale\)/i)).toBeInTheDocument();
    });

    it('should render LeaveCalendar component', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(screen.getByText(/Lun|Mar|Mer|Gio/i)).toBeInTheDocument();
    });

    it('should render action buttons', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(screen.getByRole('button', { name: /Richiedi/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Annulla/i })).toBeInTheDocument();
    });

    it('should render requests history section', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(screen.getByText(/Le Tue Richieste/i)).toBeInTheDocument();
    });

    it('should render requests table with headers', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(screen.getByText(/Tipo Feria/i)).toBeInTheDocument();
      expect(screen.getByText(/Data Inizio/i)).toBeInTheDocument();
      expect(screen.getByText(/Data Fine/i)).toBeInTheDocument();
      expect(screen.getByText(/Giorni/i)).toBeInTheDocument();
      expect(screen.getByText(/Status/i)).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should submit form with valid data', async () => {
      const user = userEvent.setup();

      renderWithRouter(<EmployeeLeaveRequest />);

      const leaveTypeSelect = screen.getByLabelText(/Tipo di Feria/i);
      await user.click(leaveTypeSelect);
      const option = screen.getByText('Ferie 1');
      await user.click(option);

      // Select dates in calendar
      const dayButtons = screen.getAllByRole('button');
      const day15 = dayButtons.find((btn) => btn.textContent === '15');
      const day20 = dayButtons.find((btn) => btn.textContent === '20');

      await user.click(day15);
      await user.click(day20);

      // Add motivation
      const motivationField = screen.getByLabelText(/Note/i);
      await user.type(motivationField, 'Vacanza al mare');

      // Submit
      const submitButton = screen.getByRole('button', { name: /Richiedi/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Richiesta di ferie inviata/i)).toBeInTheDocument();
      });
    });

    it('should disable submit button when leave_type not selected', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      const submitButton = screen.getByRole('button', { name: /Richiedi/i });
      expect(submitButton).toBeDisabled();
    });

    it('should disable submit button when date range not selected', async () => {
      const user = userEvent.setup();

      renderWithRouter(<EmployeeLeaveRequest />);

      const leaveTypeSelect = screen.getByLabelText(/Tipo di Feria/i);
      await user.click(leaveTypeSelect);
      const option = screen.getByText('Ferie 1');
      await user.click(option);

      const submitButton = screen.getByRole('button', { name: /Richiedi/i });
      expect(submitButton).toBeDisabled();
    });

    it('should reset form after successful submit', async () => {
      const user = userEvent.setup();

      renderWithRouter(<EmployeeLeaveRequest />);

      const leaveTypeSelect = screen.getByLabelText(/Tipo di Feria/i);
      await user.click(leaveTypeSelect);
      const option = screen.getByText('Ferie 1');
      await user.click(option);

      const dayButtons = screen.getAllByRole('button');
      const day15 = dayButtons.find((btn) => btn.textContent === '15');
      const day20 = dayButtons.find((btn) => btn.textContent === '20');

      await user.click(day15);
      await user.click(day20);

      const submitButton = screen.getByRole('button', { name: /Richiedi/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/Tipo di Feria/i)).toHaveValue('');
      });
    });
  });

  describe('Cancel Button', () => {
    it('should clear form when cancel button is clicked', async () => {
      const user = userEvent.setup();

      renderWithRouter(<EmployeeLeaveRequest />);

      const leaveTypeSelect = screen.getByLabelText(/Tipo di Feria/i);
      await user.click(leaveTypeSelect);
      const option = screen.getByText('Ferie 1');
      await user.click(option);

      expect(leaveTypeSelect).toHaveValue('FERIE_1');

      const cancelButton = screen.getByRole('button', { name: /Annulla/i });
      await user.click(cancelButton);

      expect(leaveTypeSelect).toHaveValue('');
    });
  });

  describe('Requests History', () => {
    it('should display user requests in table', async () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      await waitFor(() => {
        expect(screen.getByText('Ferie 1')).toBeInTheDocument();
        expect(screen.getByText('APPROVED')).toBeInTheDocument();
      });
    });

    it('should show status badge with correct color', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      const statusChip = screen.getByText('APPROVED');
      expect(statusChip).toHaveClass('MuiChip-colorSuccess');
    });

    it('should display empty state when no requests', async () => {
      vi.mock('../hooks/useLeave', () => ({
        useLeave: () => ({
          getMyRequests: vi.fn(async () => []),
          createRequest: vi.fn(),
          loading: false,
          error: null,
          clearError: vi.fn(),
          resetForm: vi.fn(),
        }),
      }));

      renderWithRouter(<EmployeeLeaveRequest />);

      // This will depend on implementation - could be a message or just empty table
      // Placeholder for now
    });
  });

  describe('Error Handling', () => {
    it('should show error snackbar on API failure', async () => {
      vi.mock('../hooks/useLeave', () => ({
        useLeave: () => ({
          createRequest: vi.fn(async () => {
            throw new Error('Server error');
          }),
          getMyRequests: vi.fn(),
          loading: false,
          error: 'Failed to create leave request',
          clearError: vi.fn(),
          resetForm: vi.fn(),
        }),
      }));

      renderWithRouter(<EmployeeLeaveRequest />);

      // Placeholder - implementation will show error snackbar
    });

    it('should allow closing error snackbar', async () => {
      const user = userEvent.setup();

      renderWithRouter(<EmployeeLeaveRequest />);

      // Placeholder - find close button on error snackbar
    });
  });

  describe('Sorting & Filtering', () => {
    it('should sort requests by date descending by default', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      const rows = screen.getAllByRole('row');
      // Most recent request should be first
      expect(rows[1]).toHaveTextContent('Ferie 1');
    });
  });

  describe('Pagination', () => {
    it('should show pagination if more than 10 requests', () => {
      // Placeholder - mock 15+ requests
    });

    it('should load next page when pagination button clicked', async () => {
      // Placeholder
    });
  });
});
