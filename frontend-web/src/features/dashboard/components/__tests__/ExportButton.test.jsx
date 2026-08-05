import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExportButton from '../ExportButton';
import apiClient from '../../../../services/apiClient';

vi.mock('../../../../services/apiClient', () => ({
  default: { get: vi.fn() },
}));

describe('ExportButton — avviso export troncato (finding #13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom does not implement createObjectURL/revokeObjectURL — ExportButton
    // calls these unconditionally on the success path to trigger the download.
    window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();
  });

  it('mostra un avviso quando la risposta ha X-Truncated: true (finding #13)', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: new Blob(['col1,col2\n1,2'], { type: 'text/csv' }),
      headers: {
        'content-disposition': 'attachment; filename="presenze_2026-08-05.csv"',
        'x-truncated': 'true',
      },
    });

    render(<ExportButton filters={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /esporta csv/i }));

    await waitFor(() => {
      expect(screen.getByText(/export troncato/i)).toBeInTheDocument();
    });
  });

  it('non mostra alcun avviso quando la risposta non è troncata', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: new Blob(['col1,col2\n1,2'], { type: 'text/csv' }),
      headers: {
        'content-disposition': 'attachment; filename="presenze_2026-08-05.csv"',
      },
    });

    render(<ExportButton filters={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /esporta csv/i }));

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    expect(screen.queryByText(/export troncato/i)).not.toBeInTheDocument();
  });

  it('scarica il CSV correttamente quando l\'export ha successo senza troncamento', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: new Blob(['col1,col2\n1,2'], { type: 'text/csv' }),
      headers: {
        'content-disposition': 'attachment; filename="presenze_2026-08-05.csv"',
      },
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExportButton filters={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /esporta csv/i }));

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/export troncato/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    clickSpy.mockRestore();
  });

  it('mostra un errore quando la richiesta di export fallisce e resetta il loading', async () => {
    apiClient.get.mockRejectedValueOnce({
      response: { data: { error: 'Errore interno del server' } },
    });

    render(<ExportButton filters={{}} />);
    const button = screen.getByRole('button', { name: /esporta csv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/errore interno del server/i)).toBeInTheDocument();
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('MuiAlert-standardError');

    // loading state reset: button re-enabled and shows its default label again
    expect(button).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /esporta csv/i })).toBeInTheDocument();
  });
});
