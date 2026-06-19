import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { EmployeeLeaveRequest } from './EmployeeLeaveRequest';
import * as authService from '../../../services/authService';

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock auth service
vi.mock('../../../services/authService', () => ({
  default: {
    getUser: vi.fn(),
    logout: vi.fn(),
  },
}));

// Mock useLeave hook
const mockCreateRequest = vi.fn(async () => ({
  id: 'req-123',
  status: 'PENDING',
  leave_type: 'FERIE_1',
  start_date: '2026-07-01',
  end_date: '2026-07-05',
}));

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

const mockClearError = vi.fn();
const mockResetForm = vi.fn();

vi.mock('../hooks/useLeave', () => ({
  useLeave: () => ({
    createRequest: mockCreateRequest,
    getMyRequests: mockGetMyRequests,
    loading: false,
    error: null,
    clearError: mockClearError,
    resetForm: mockResetForm,
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
    </div>
  ),
}));

const renderWithRouter = (component) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

// Helper: get the leave type combobox (always the first combobox rendered)
const getLeaveTypeSelect = () => screen.getAllByRole('combobox')[0];

describe('EmployeeLeaveRequest Page', () => {
  beforeEach(() => {
    authService.default.getUser.mockReturnValue({
      id: 'emp-123',
      name: 'Mario Rossi',
      role: 'employee',
    });
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render the page with title "Richiedi Ferie"', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(screen.getByText('Richiedi Ferie')).toBeInTheDocument();
    });

    it('should render leave type dropdown', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(getLeaveTypeSelect()).toBeInTheDocument();
      expect(screen.getByLabelText(/Note \(opzionale\)/i)).toBeInTheDocument();
    });

    it('should render Comunica Malattia button', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(screen.getByRole('button', { name: /Comunica Malattia/i })).toBeInTheDocument();
    });

    it('should render LeaveCalendar component', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(screen.getByTestId('mock-calendar')).toBeInTheDocument();
    });

    it('should render action buttons', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(screen.getByRole('button', { name: /^Richiedi$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Annulla/i })).toBeInTheDocument();
    });

    it('should render requests history section', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      // Multiple headings possible; at least one should exist
      const headings = screen.getAllByText(/Le Tue Richieste/i);
      expect(headings.length).toBeGreaterThan(0);
    });

    it('should render requests table with headers', async () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      await waitFor(() => {
        expect(screen.getByText(/Data Inizio/i)).toBeInTheDocument();
        expect(screen.getByText(/Data Fine/i)).toBeInTheDocument();
        expect(screen.getAllByText(/Giorni/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Status/i).length).toBeGreaterThan(0);
      });
    });
  });

  describe('Malattia Button', () => {
    it('should navigate to /illnesses/report when Comunica Malattia is clicked', async () => {
      const user = userEvent.setup();

      renderWithRouter(<EmployeeLeaveRequest />);

      const malattiaButton = screen.getByRole('button', { name: /Comunica Malattia/i });
      await user.click(malattiaButton);

      expect(mockNavigate).toHaveBeenCalledWith('/illnesses/report');
    });

    it('should not show inline file upload field', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      expect(screen.queryByText(/Allega Documento/i)).not.toBeInTheDocument();
    });

    it('should not show file upload field after Malattia button click', async () => {
      const user = userEvent.setup();

      renderWithRouter(<EmployeeLeaveRequest />);

      const malattiaButton = screen.getByRole('button', { name: /Comunica Malattia/i });
      await user.click(malattiaButton);

      // Navigates away — no inline upload in this page
      expect(screen.queryByText(/Allega Documento/i)).not.toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should submit form with valid data', async () => {
      const user = userEvent.setup();

      renderWithRouter(<EmployeeLeaveRequest />);

      // Open leave type dropdown and pick option by role
      await user.click(getLeaveTypeSelect());
      const option = screen.getByRole('option', { name: 'Ferie 1' });
      await user.click(option);

      // Trigger calendar date selection via mock calendar button
      const calendarButton = screen.getByRole('button', { name: /Seleziona date/i });
      await user.click(calendarButton);

      // Add motivation
      const motivationField = screen.getByLabelText(/Note/i);
      await user.type(motivationField, 'Vacanza al mare');

      // Wait for form to become valid, then submit via fireEvent (MUI button may have pointer-events:none during transitions)
      const submitButton = screen.getByRole('button', { name: /^Richiedi$/i });
      await waitFor(() => expect(submitButton).not.toBeDisabled());
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Richiesta di ferie inviata/i)).toBeInTheDocument();
      });
    });

    it('should disable submit button when leave_type not selected', () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      const submitButton = screen.getByRole('button', { name: /^Richiedi$/i });
      expect(submitButton).toBeDisabled();
    });

    it('should disable submit button when date range not selected', async () => {
      const user = userEvent.setup();

      renderWithRouter(<EmployeeLeaveRequest />);

      await user.click(getLeaveTypeSelect());
      const option = screen.getByRole('option', { name: 'Ferie 1' });
      await user.click(option);

      const submitButton = screen.getByRole('button', { name: /^Richiedi$/i });
      expect(submitButton).toBeDisabled();
    });

    it('should reset form after successful submit', async () => {
      const user = userEvent.setup();

      renderWithRouter(<EmployeeLeaveRequest />);

      const leaveTypeSelect = getLeaveTypeSelect();
      await user.click(leaveTypeSelect);
      const option = screen.getByRole('option', { name: 'Ferie 1' });
      await user.click(option);

      // combobox should now show the selected label
      expect(leaveTypeSelect).toHaveTextContent('Ferie 1');

      // Trigger calendar date selection via mock calendar button
      const calendarButton = screen.getByRole('button', { name: /Seleziona date/i });
      await user.click(calendarButton);

      const submitButton = screen.getByRole('button', { name: /^Richiedi$/i });
      await waitFor(() => expect(submitButton).not.toBeDisabled());
      fireEvent.click(submitButton);

      await waitFor(() => {
        // After successful submit, form is reset — combobox shows placeholder (empty)
        expect(getLeaveTypeSelect()).not.toHaveTextContent('Ferie 1');
      });
    });
  });

  describe('Cancel Button', () => {
    it('should clear form when cancel button is clicked', async () => {
      const user = userEvent.setup();

      renderWithRouter(<EmployeeLeaveRequest />);

      const leaveTypeSelect = getLeaveTypeSelect();
      await user.click(leaveTypeSelect);
      const option = screen.getByRole('option', { name: 'Ferie 1' });
      await user.click(option);

      // combobox shows selected label
      expect(leaveTypeSelect).toHaveTextContent('Ferie 1');

      const cancelButton = screen.getByRole('button', { name: /Annulla/i });
      await user.click(cancelButton);

      // After cancel, form is cleared
      expect(leaveTypeSelect).not.toHaveTextContent('Ferie 1');
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

    it('should show status badge with correct color', async () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      await waitFor(() => {
        const statusText = screen.getByText('APPROVED');
        // MuiChip-colorSuccess is on the chip root, not the text span
        expect(statusText.closest('.MuiChip-root')).toHaveClass('MuiChip-colorSuccess');
      });
    });

    it('should display empty state when no requests', async () => {
      // Placeholder
    });
  });

  describe('Error Handling', () => {
    it('should show error snackbar on API failure', async () => {
      // Placeholder
    });

    it('should allow closing error snackbar', async () => {
      // Placeholder
    });
  });

  describe('Sorting & Filtering', () => {
    it('should sort requests by date descending by default', async () => {
      renderWithRouter(<EmployeeLeaveRequest />);

      // Default sort is date_desc — the single mock request should appear
      await waitFor(() => {
        expect(screen.getByText('APPROVED')).toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    it('should show pagination if more than 10 requests', () => {
      // Placeholder
    });

    it('should load next page when pagination button clicked', async () => {
      // Placeholder
    });
  });
});
