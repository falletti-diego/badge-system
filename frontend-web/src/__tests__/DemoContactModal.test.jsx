import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DemoContactModal from '../components/DemoContactModal';
import apiClient from '../services/apiClient';

vi.mock('../services/apiClient', () => ({
  default: { post: vi.fn() },
}));

describe('DemoContactModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders nothing (no dialog content) when closed', () => {
    render(<DemoContactModal open={false} onClose={() => {}} />);
    expect(screen.queryByLabelText(/il tuo messaggio/i)).not.toBeInTheDocument();
  });

  test('renders the message field and buttons when open', () => {
    render(<DemoContactModal open onClose={() => {}} />);
    expect(screen.getByLabelText(/il tuo messaggio/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /invia/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /annulla/i })).toBeInTheDocument();
  });

  test('blocks submit and shows inline error on empty message', () => {
    render(<DemoContactModal open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /invia/i }));
    expect(screen.getByText(/scrivi un messaggio/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  test('submits the message and shows the confirmation on success', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { success: true } } });

    render(<DemoContactModal open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/il tuo messaggio/i), { target: { value: 'Vorrei saperne di più' } });
    fireEvent.click(screen.getByRole('button', { name: /invia/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/demo/contact', { message: 'Vorrei saperne di più' });
    });
    await waitFor(() => {
      expect(screen.getByText(/messaggio inviato, ti ricontattiamo presto/i)).toBeInTheDocument();
    });
  });

  test('keeps the dialog open and shows an inline error when the API call fails', async () => {
    apiClient.post.mockRejectedValue({ response: { data: { message: 'Server error' } } });
    const onClose = vi.fn();

    render(<DemoContactModal open onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/il tuo messaggio/i), { target: { value: 'Ciao' } });
    fireEvent.click(screen.getByRole('button', { name: /invia/i }));

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    // Field is still present/editable — user can retry without retyping.
    expect(screen.getByLabelText(/il tuo messaggio/i)).toHaveValue('Ciao');
  });

  test('clicking Annulla calls onClose', () => {
    const onClose = vi.fn();
    render(<DemoContactModal open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /annulla/i }));
    expect(onClose).toHaveBeenCalled();
  });

  // Regression test for code-review Fix 1: DemoBanner renders a single,
  // persistent DemoContactModal instance whose `open` prop toggles (not a
  // remount). Closing schedules a 200ms delayed reset of message/error/sent;
  // if the dialog is reopened before that timer fires, the stale timer must
  // not be allowed to wipe text the user has since started typing.
  test('does not wipe in-progress typed text if closed and reopened within the 200ms reset window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onClose = vi.fn();

    const { rerender } = render(<DemoContactModal open onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/il tuo messaggio/i), { target: { value: 'primo messaggio' } });

    // Close (schedules the 200ms delayed reset) then reopen quickly, before
    // the timer fires — DemoBanner does this via the `open` prop, not by
    // remounting the component.
    fireEvent.click(screen.getByRole('button', { name: /annulla/i }));
    rerender(<DemoContactModal open={false} onClose={onClose} />);
    rerender(<DemoContactModal open onClose={onClose} />);

    // Start typing a new message before the stale 200ms timer would fire.
    fireEvent.change(screen.getByLabelText(/il tuo messaggio/i), { target: { value: 'nuovo messaggio' } });

    // Advance past the 200ms window — the stale timer, if not cancelled,
    // would wipe the field back to ''.
    await vi.advanceTimersByTimeAsync(250);

    expect(screen.getByLabelText(/il tuo messaggio/i)).toHaveValue('nuovo messaggio');

    vi.useRealTimers();
  });

  // Regression guard: unmounting while a reset timer is pending must not
  // throw or leave a dangling timer that fires against an unmounted tree.
  test('does not throw when unmounted while a reset timer is pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onClose = vi.fn();

    const { unmount } = render(<DemoContactModal open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /annulla/i }));

    expect(() => unmount()).not.toThrow();
    await expect(vi.advanceTimersByTimeAsync(250)).resolves.not.toThrow();

    vi.useRealTimers();
  });
});
