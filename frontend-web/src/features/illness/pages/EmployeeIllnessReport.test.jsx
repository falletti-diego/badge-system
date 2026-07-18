import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { EmployeeIllnessReport } from './EmployeeIllnessReport';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockReportIllness = vi.fn(async () => ({ id: 'ill-1' }));
vi.mock('../hooks/useIllness', () => ({
  useIllness: () => ({
    reportIllness: mockReportIllness,
    loading: false,
    error: null,
  }),
}));

const renderPage = () =>
  render(
    <BrowserRouter>
      <EmployeeIllnessReport />
    </BrowserRouter>
  );

describe('EmployeeIllnessReport — redirect timer cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT navigate to /dashboard if the component unmounts before the 2s redirect fires', async () => {
    const { unmount } = renderPage();
    const form = document.querySelector('form');
    fireEvent.submit(form);
    await waitFor(() => expect(mockReportIllness).toHaveBeenCalled());

    unmount();
    vi.advanceTimersByTime(3000);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('DOES navigate to /dashboard after 2s when the component stays mounted', async () => {
    renderPage();
    const form = document.querySelector('form');
    fireEvent.submit(form);
    await waitFor(() => expect(mockReportIllness).toHaveBeenCalled());

    vi.advanceTimersByTime(2500);

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
