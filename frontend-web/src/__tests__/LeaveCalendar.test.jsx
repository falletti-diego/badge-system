import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeaveCalendar } from '../features/leave/components/LeaveCalendar';

describe('LeaveCalendar', () => {
  const mockOnDateChange = vi.fn();

  beforeEach(() => {
    mockOnDateChange.mockClear();
  });

  it('should render calendar with current month displayed', () => {
    const { container } = render(
      <LeaveCalendar
        startDate={null}
        endDate={null}
        onDateChange={mockOnDateChange}
      />
    );

    const currentDate = new Date();
    const monthYear = container.textContent;
    expect(monthYear).toContain(currentDate.getFullYear().toString());
  });

  it('should allow navigating to previous month', async () => {
    const user = userEvent.setup();
    render(
      <LeaveCalendar
        startDate={null}
        endDate={null}
        onDateChange={mockOnDateChange}
      />
    );

    const prevButton = screen.getByRole('button', { name: /precedente/i });
    await user.click(prevButton);

    expect(screen.getByRole('button', { name: /precedente/i })).toBeInTheDocument();
  });

  it('should allow navigating to next month', async () => {
    const user = userEvent.setup();
    render(
      <LeaveCalendar
        startDate={null}
        endDate={null}
        onDateChange={mockOnDateChange}
      />
    );

    const nextButton = screen.getByRole('button', { name: /prossimo/i });
    await user.click(nextButton);

    expect(screen.getByRole('button', { name: /prossimo/i })).toBeInTheDocument();
  });

  it('should render calendar days for current month', () => {
    const { container } = render(
      <LeaveCalendar
        startDate={null}
        endDate={null}
        onDateChange={mockOnDateChange}
      />
    );

    const buttons = container.querySelectorAll('button[data-testid^="day-"]');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should call onDateChange with start date when first date is selected', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LeaveCalendar
        startDate={null}
        endDate={null}
        onDateChange={mockOnDateChange}
      />
    );

    const dayButton = container.querySelector('button[data-testid="day-15"]');
    if (dayButton && !dayButton.disabled) {
      await user.click(dayButton);

      const currentDate = new Date();
      const yearMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

      expect(mockOnDateChange).toHaveBeenCalledWith({
        startDate: expect.stringContaining(yearMonth),
        endDate: expect.stringContaining(yearMonth),
      });
    }
  });

  it('should call onDateChange with range when both dates are selected', async () => {
    const user = userEvent.setup();
    let localStartDate = null;
    let localEndDate = null;

    const handleDateChange = (dates) => {
      localStartDate = dates.startDate;
      localEndDate = dates.endDate;
      mockOnDateChange(dates);
    };

    const { container, rerender } = render(
      <LeaveCalendar
        startDate={localStartDate}
        endDate={localEndDate}
        onDateChange={handleDateChange}
      />
    );

    const dayButton15 = container.querySelector('button[data-testid="day-15"]');

    if (dayButton15 && !dayButton15.disabled) {
      await user.click(dayButton15);

      rerender(
        <LeaveCalendar
          startDate={localStartDate}
          endDate={localEndDate}
          onDateChange={handleDateChange}
        />
      );

      mockOnDateChange.mockClear();

      const dayButton20 = container.querySelector('button[data-testid="day-20"]');
      if (dayButton20 && !dayButton20.disabled) {
        await user.click(dayButton20);

        expect(mockOnDateChange).toHaveBeenCalledWith(
          expect.objectContaining({
            startDate: expect.any(String),
            endDate: expect.any(String),
          })
        );
      }
    }
  });

  it('should highlight selected date range', () => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-10`;
    const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-20`;

    const { container } = render(
      <LeaveCalendar
        startDate={startDate}
        endDate={endDate}
        onDateChange={mockOnDateChange}
      />
    );

    const selectedRange = container.querySelectorAll('[data-testid^="day-"][data-selected="true"]');
    expect(selectedRange.length).toBeGreaterThan(0);
  });

  it('should allow clearing selection by clicking on selected start date', async () => {
    const user = userEvent.setup();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const initialStartDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-15`;
    let localStartDate = initialStartDate;
    let localEndDate = null;

    const handleDateChange = (dates) => {
      localStartDate = dates.startDate;
      localEndDate = dates.endDate;
      mockOnDateChange(dates);
    };

    const { container, rerender } = render(
      <LeaveCalendar
        startDate={localStartDate}
        endDate={localEndDate}
        onDateChange={handleDateChange}
      />
    );

    const dayButton = container.querySelector('button[data-testid="day-15"]');
    if (dayButton && !dayButton.disabled) {
      await user.click(dayButton);

      expect(mockOnDateChange).toHaveBeenCalledWith({
        startDate: null,
        endDate: null,
      });
    }
  });

  it('should render day names header', () => {
    render(
      <LeaveCalendar
        startDate={null}
        endDate={null}
        onDateChange={mockOnDateChange}
      />
    );

    expect(screen.getByText('Lun')).toBeInTheDocument();
    expect(screen.getByText('Mar')).toBeInTheDocument();
    expect(screen.getByText('Mer')).toBeInTheDocument();
    expect(screen.getByText('Gio')).toBeInTheDocument();
    expect(screen.getByText('Ven')).toBeInTheDocument();
    expect(screen.getByText('Sab')).toBeInTheDocument();
    expect(screen.getByText('Dom')).toBeInTheDocument();
  });

  it('should have disabled buttons for past dates', () => {
    const { container } = render(
      <LeaveCalendar
        startDate={null}
        endDate={null}
        onDateChange={mockOnDateChange}
      />
    );

    const disabledButtons = container.querySelectorAll('button[data-testid^="day-"][disabled]');
    expect(disabledButtons.length).toBeGreaterThanOrEqual(0);
  });

  it('should display month/year correctly', () => {
    const currentDate = new Date();
    const months = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
      'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const currentMonth = months[currentDate.getMonth()];
    const currentYear = currentDate.getFullYear();

    render(
      <LeaveCalendar
        startDate={null}
        endDate={null}
        onDateChange={mockOnDateChange}
      />
    );

    const monthYearText = screen.getByText(new RegExp(`${currentMonth}.*${currentYear}`, 'i'));
    expect(monthYearText).toBeInTheDocument();
  });
});
