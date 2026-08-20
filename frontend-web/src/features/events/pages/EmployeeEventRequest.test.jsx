import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { EmployeeEventRequest } from './EmployeeEventRequest';

vi.mock('../hooks/useEvents', () => ({
  useEvents: () => ({
    createRequest: vi.fn(async () => ({ id: 'evt-1' })),
    getMyRequests: vi.fn(async () => []),
    loading: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

const renderWithRouter = (component) => render(<BrowserRouter>{component}</BrowserRouter>);

describe('EmployeeEventRequest', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('should render the page title', () => {
    renderWithRouter(<EmployeeEventRequest />);
    expect(screen.getByText(/Richiedi Evento\/Training/i)).toBeTruthy();
  });

  it('should render the description field', () => {
    renderWithRouter(<EmployeeEventRequest />);
    expect(screen.getByLabelText(/Descrizione evento/i)).toBeTruthy();
  });
});
