import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ManagerLeaveRequest } from './ManagerLeaveRequest';
import * as authService from '../../../services/authService';

vi.mock('../../../services/authService', () => ({
  default: {
    getUser: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('../hooks/useLeave', () => ({
  useLeave: () => ({
    createRequest: vi.fn(async () => ({})),
    getMyRequests: vi.fn(async () => []),
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
});
