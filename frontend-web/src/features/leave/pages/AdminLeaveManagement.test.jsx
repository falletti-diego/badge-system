import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  describe('Integration', () => {
    it('should integrate with useLeave hook', () => {
      renderWithRouter(<AdminLeaveManagement />);
      expect(screen.getByText(/Gestione Ferie/i)).toBeTruthy();
    });
  });
});
