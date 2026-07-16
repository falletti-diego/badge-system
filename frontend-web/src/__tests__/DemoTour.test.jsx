import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DemoTour from '../components/DemoTour';
import authService from '../services/authService';

vi.mock('../services/authService', () => ({
  default: { isDemo: vi.fn() },
}));

const TOUR_SEEN_KEY = 'badge_demo_tour_seen';

// Renders the 4 target ids DemoTour anchors to, mirroring what
// DashboardPage.jsx / FilterBar.jsx provide in the real app.
function renderWithTargets(children) {
  return render(
    <>
      <div id="demo-tour-kpi-cards">kpi</div>
      <div id="demo-tour-trend">trend</div>
      <div id="demo-tour-export">export</div>
      <div id="demo-tour-site-filter">site</div>
      {children}
    </>
  );
}

describe('DemoTour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(TOUR_SEEN_KEY);
  });

  test('does not render when the session is not a demo', () => {
    authService.isDemo.mockReturnValue(false);
    const { container } = renderWithTargets(<DemoTour />);
    // Only the 4 target divs should be present, no tour popper content.
    expect(screen.queryByTestId('demo-tour-step')).not.toBeInTheDocument();
  });

  test('does not render when the tour was already seen this session', () => {
    authService.isDemo.mockReturnValue(true);
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
    renderWithTargets(<DemoTour />);
    expect(screen.queryByTestId('demo-tour-step')).not.toBeInTheDocument();
  });

  test('shows the first step for a fresh demo session and sets the seen-flag on skip', async () => {
    authService.isDemo.mockReturnValue(true);
    renderWithTargets(<DemoTour />);

    await waitFor(() => {
      expect(screen.getByTestId('demo-tour-step')).toBeInTheDocument();
    });
    expect(screen.getByText(/presenze in tempo reale/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /salta/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('demo-tour-step')).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('true');
  });

  test('advancing through all steps via "Avanti" ends the tour and sets the seen-flag', async () => {
    authService.isDemo.mockReturnValue(true);
    renderWithTargets(<DemoTour />);

    await waitFor(() => expect(screen.getByTestId('demo-tour-step')).toBeInTheDocument());

    // Click "Avanti" (or "Fine" on the last step) until the tour is gone.
    for (let i = 0; i < 5; i += 1) {
      const btn = screen.queryByRole('button', { name: /avanti|fine/i });
      if (!btn) break;
      fireEvent.click(btn);
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => {});
    }

    await waitFor(() => {
      expect(screen.queryByTestId('demo-tour-step')).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('true');
  });
});
