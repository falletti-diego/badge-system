import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { EmployeeEventRequest } from './EmployeeEventRequest';

const mockCreateRequest = vi.fn(async () => ({ id: 'evt-1' }));
const mockGetMyRequests = vi.fn(async () => []);
const mockClearError = vi.fn();

vi.mock('../hooks/useEvents', () => ({
  useEvents: () => ({
    createRequest: mockCreateRequest,
    getMyRequests: mockGetMyRequests,
    loading: false,
    error: null,
    clearError: mockClearError,
  }),
}));

const renderWithRouter = (component) => render(<BrowserRouter>{component}</BrowserRouter>);

describe('EmployeeEventRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRequest.mockImplementation(async () => ({ id: 'evt-1' }));
    mockGetMyRequests.mockImplementation(async () => []);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('should render the page title', () => {
    renderWithRouter(<EmployeeEventRequest />);
    expect(screen.getByText(/Richiedi Evento\/Training/i)).toBeTruthy();
  });

  it('should render the description field', () => {
    renderWithRouter(<EmployeeEventRequest />);
    expect(screen.getByLabelText(/Descrizione evento/i)).toBeTruthy();
  });

  describe('Form Validation', () => {
    it('should disable the submit button by default and enable it once the form is valid', async () => {
      renderWithRouter(<EmployeeEventRequest />);

      const submitButton = screen.getByRole('button', { name: /Invia Richiesta/i });
      expect(submitButton).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/Data evento/i), { target: { value: '2026-08-10' } });
      fireEvent.change(screen.getByLabelText(/Ora inizio/i), { target: { value: '09:00' } });
      fireEvent.change(screen.getByLabelText(/Ora fine/i), { target: { value: '17:00' } });
      fireEvent.change(screen.getByLabelText(/Descrizione evento/i), {
        target: { value: 'Corso di formazione tecnica' },
      });

      await waitFor(() => expect(submitButton).not.toBeDisabled());
    });

    it('should keep the submit button disabled when end_time is not after start_time', async () => {
      renderWithRouter(<EmployeeEventRequest />);

      const submitButton = screen.getByRole('button', { name: /Invia Richiesta/i });

      fireEvent.change(screen.getByLabelText(/Data evento/i), { target: { value: '2026-08-10' } });
      fireEvent.change(screen.getByLabelText(/Ora inizio/i), { target: { value: '17:00' } });
      fireEvent.change(screen.getByLabelText(/Ora fine/i), { target: { value: '17:00' } });
      fireEvent.change(screen.getByLabelText(/Descrizione evento/i), {
        target: { value: 'Corso di formazione tecnica' },
      });

      expect(submitButton).toBeDisabled();
      expect(mockCreateRequest).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    it('should call createRequest with the right args, show a success message, and reset the form', async () => {
      renderWithRouter(<EmployeeEventRequest />);

      const dateField = screen.getByLabelText(/Data evento/i);
      const startField = screen.getByLabelText(/Ora inizio/i);
      const endField = screen.getByLabelText(/Ora fine/i);
      const descriptionField = screen.getByLabelText(/Descrizione evento/i);

      fireEvent.change(dateField, { target: { value: '2026-08-10' } });
      fireEvent.change(startField, { target: { value: '09:00' } });
      fireEvent.change(endField, { target: { value: '17:00' } });
      fireEvent.change(descriptionField, { target: { value: 'Corso di formazione tecnica' } });

      const submitButton = screen.getByRole('button', { name: /Invia Richiesta/i });
      await waitFor(() => expect(submitButton).not.toBeDisabled());
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateRequest).toHaveBeenCalledWith(
          '2026-08-10',
          '09:00',
          '17:00',
          'Corso di formazione tecnica'
        );
      });

      await waitFor(() => {
        expect(screen.getByText(/Richiesta evento\/training inviata con successo!/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(descriptionField.value).toBe('');
        expect(startField.value).toBe('08:00');
        expect(endField.value).toBe('18:00');
      });
    });
  });

  describe('Requests History', () => {
    it('should render rows with the correct status chip', async () => {
      mockGetMyRequests.mockImplementation(async () => [
        {
          id: 'req-1',
          event_date: '2026-08-10',
          start_time: '09:00:00',
          end_time: '17:00:00',
          description: 'Congresso di settore a Milano',
          status: 'PENDING',
        },
        {
          id: 'req-2',
          event_date: '2026-08-12',
          start_time: '10:00:00',
          end_time: '18:00:00',
          description: 'Corso di formazione tecnica',
          status: 'APPROVED',
        },
      ]);

      renderWithRouter(<EmployeeEventRequest />);

      await waitFor(() => {
        expect(screen.getByText('Congresso di settore a Milano')).toBeInTheDocument();
      });
      expect(screen.getByText('09:00 - 17:00')).toBeInTheDocument();
      expect(screen.getByText('Corso di formazione tecnica')).toBeInTheDocument();
      expect(screen.getByText('10:00 - 18:00')).toBeInTheDocument();

      const pendingChip = screen.getByText('PENDING');
      expect(pendingChip.closest('.MuiChip-root')).toHaveClass('MuiChip-colorWarning');

      const approvedChip = screen.getByText('APPROVED');
      expect(approvedChip.closest('.MuiChip-root')).toHaveClass('MuiChip-colorSuccess');
    });

    it('should render the empty state when there are no requests', async () => {
      mockGetMyRequests.mockImplementation(async () => []);

      renderWithRouter(<EmployeeEventRequest />);

      await waitFor(() => {
        expect(
          screen.getByText(/Non hai ancora inoltrato richieste di evento\/training/i)
        ).toBeInTheDocument();
      });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });
});
