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
});
