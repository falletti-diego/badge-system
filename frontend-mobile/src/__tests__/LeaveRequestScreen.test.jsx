import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

jest.mock('../services/apiClient', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

// The real DateTimePicker renders a native spinner UI that isn't meaningfully
// testable in jsdom-less RNTL; this mock exposes a single button per instance
// that fires onChange with a fixed date, distinguished by testID (the screen
// doesn't currently pass testID to DateTimePicker — this is added in this
// task alongside the mock, see Step 3 below).
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return function MockDateTimePicker({ onChange, testID }) {
    return React.createElement(
      TouchableOpacity,
      { testID: testID || 'mock-date-picker', onPress: () => onChange({}, new Date('2026-09-20T00:00:00')) },
      React.createElement(Text, null, 'mock-picker')
    );
  };
});

const apiClient = require('../services/apiClient');
const LeaveRequestScreen = require('../screens/leave/LeaveRequestScreen').default;

function mockDefaultResponses() {
  apiClient.get.mockImplementation((url) => {
    if (url.includes('balance')) {
      return Promise.resolve({ data: { data: [
        { leave_type: 'FERIE_1', remaining_days: 19.5 },
        { leave_type: 'FERIE_2', remaining_days: 10 },
        { leave_type: 'FERIE_3', remaining_days: 4 },
      ] } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
  apiClient.post.mockResolvedValue({ data: { data: { id: 'req-1' } } });
}

describe('LeaveRequestScreen — half-day toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDefaultResponses();
  });

  it('shows the balance with 1 decimal (formatLeaveDays) for a half-day remaining value', async () => {
    // render() resolves as a Promise in this environment (React 19
    // concurrent root under jest-expo) — it must be awaited before its
    // query functions are usable (see MyScheduleScreen.test.jsx).
    const { findByText } = await render(<LeaveRequestScreen />);
    expect(await findByText('19,5')).toBeTruthy();
  });

  it('shows the half-day toggle only when start and end date are the same day, and sends half_day=true', async () => {
    const { findByText } = await render(<LeaveRequestScreen />);
    await findByText('Saldo disponibile');

    // Default state: startDate === endDate === today() already, so the
    // toggle should be visible without any interaction. The mocked
    // DateTimePicker instances aren't pressed here because the real
    // component only mounts once the corresponding "Data inizio"/"Data
    // fine" button is tapped to open it (showStartPicker/showEndPicker
    // default to false) — pressing them adds no coverage since the
    // default dates already satisfy the same-day condition under test.
    expect(await findByText('Mezza giornata')).toBeTruthy();

    fireEvent.press(await findByText('Mezza giornata'));
    fireEvent.press(await findByText('Invia Richiesta Ferie'));

    const todayISO = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    })();

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ half_day: true, start_date: todayISO, end_date: todayISO })
      );
    });
  });

  it('hides the half-day toggle once start and end date differ', async () => {
    const { findByText, findByTestId, getAllByText, queryByText } = await render(<LeaveRequestScreen />);
    await findByText('Saldo disponibile');

    // Both date buttons render as "📅  <ISO date>" and start out identical
    // (startDate === endDate === today()), so they can't be told apart by
    // text alone. The screen renders "Data inizio" first, then "Data fine",
    // so the second 📅-labeled button (index 1) is the end-date button.
    const dateButtons = getAllByText(/📅/);
    fireEvent.press(dateButtons[1]);

    // Opening the end-date picker (showEndPicker=true) mounts the real
    // DateTimePicker with testID="end-date-picker"; pressing the mock fires
    // onChange with a fixed date (2026-09-20), distinct from today(), so
    // startDate and endDate now differ and the toggle should disappear.
    const picker = await findByTestId('end-date-picker');
    fireEvent.press(picker);

    await waitFor(() => {
      expect(queryByText('Mezza giornata')).toBeFalsy();
    });
  });
});
