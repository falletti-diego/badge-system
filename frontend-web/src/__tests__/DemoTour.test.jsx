import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DemoTour from '../components/DemoTour';
import authService from '../services/authService';

const TOUR_SEEN_KEY = 'badge_demo_tour_seen';

// DemoTour.jsx imports DEMO_TOUR_SEEN_KEY as a *named* export from
// authService.js (code-review Fix 2 — single source of truth for this key,
// shared with setSession's resetDemoTour option), so the mock must provide
// it alongside the default export, or DemoTour would read/write
// localStorage[undefined] instead of the real key.
vi.mock('../services/authService', () => ({
  default: { isDemo: vi.fn() },
  DEMO_TOUR_SEEN_KEY: 'badge_demo_tour_seen',
}));

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

  // Regression test for code-review Fix 3: when a step's target isn't in
  // the DOM (e.g. an employee-role demo session has no #demo-tour-trend
  // block), the tour must skip straight to the next AVAILABLE step's
  // content — it must never render a step's title/text while still
  // anchored (even momentarily, from the test's black-box perspective) to
  // an unrelated, previously-shown step's element. Simulates an
  // employee-role session by omitting the #demo-tour-trend target
  // entirely, mirroring how DashboardPage.jsx only renders that wrapper
  // for non-employee roles.
  test('skips a step with a missing target and shows only the next available step\'s content (no stale/mismatched render)', async () => {
    authService.isDemo.mockReturnValue(true);
    // Only kpi-cards and export exist — trend and site-filter are absent,
    // simulating an employee-role demo session missing 2 of the 4 anchors.
    render(
      <>
        <div id="demo-tour-kpi-cards">kpi</div>
        <div id="demo-tour-export">export</div>
        <DemoTour />
      </>
    );

    await waitFor(() => {
      expect(screen.getByText(/presenze in tempo reale/i)).toBeInTheDocument();
    });
    // The trend step's content must never appear — its target is missing.
    expect(screen.queryByText(/grafici trend/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));

    await waitFor(() => {
      expect(screen.getByText(/export csv/i)).toBeInTheDocument();
    });
    // Still never rendered at any point during the skip.
    expect(screen.queryByText(/grafici trend/i)).not.toBeInTheDocument();
    // And the tooltip is anchored to the export target, not a stale one —
    // verified by the Popper content actually being present and singular.
    expect(screen.getAllByTestId('demo-tour-step')).toHaveLength(1);
  });
});
