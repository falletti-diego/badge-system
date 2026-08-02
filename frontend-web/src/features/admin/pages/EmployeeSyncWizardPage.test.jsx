import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmployeeSyncWizardPage } from './EmployeeSyncWizardPage';
import { useEmployeeSync } from '../hooks/useEmployeeSync';

vi.mock('../hooks/useEmployeeSync');

describe('EmployeeSyncWizardPage', () => {
  it('shows the diff summary after preview and applies on confirm', async () => {
    const mockPreview = vi.fn().mockResolvedValue({
      nuovi: [{ email: 'nuovo@x.it', name: 'Nuovo' }],
      riattivati: [],
      rimossi: [],
      modificati: [],
      anomalie: [],
      errors: [],
    });
    const mockApply = vi
      .fn()
      .mockResolvedValue({ nuovi: [], riattivati: [], rimossi: [], modificati: [], anomalie: [] });
    useEmployeeSync.mockReturnValue({
      downloadTemplate: vi.fn(),
      preview: mockPreview,
      apply: mockApply,
      exportHistory: vi.fn(),
      loading: false,
      error: null,
    });

    render(<EmployeeSyncWizardPage clientId="client-1" />);
    const file = new File(['x'], 'test.xlsx');
    const input = screen.getByLabelText(/carica file/i);
    await userEvent.upload(input, file);

    await waitFor(() => expect(mockPreview).toHaveBeenCalled());
    expect(await screen.findByText(/nuovo@x.it/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /conferma tutte le modifiche/i }));
    await waitFor(() => expect(mockApply).toHaveBeenCalled());
  });

  it('shows what actually changed for a "modificato" row — a site transfer with readable site names — not just the email', async () => {
    useEmployeeSync.mockReturnValue({
      downloadTemplate: vi.fn(),
      preview: vi.fn().mockResolvedValue({
        nuovi: [],
        riattivati: [],
        rimossi: [],
        modificati: [
          {
            email: 'trasferito@x.it',
            changes: { site_id: { from: 'site-torino', to: 'site-milano', fromName: 'Torino Store', toName: 'Milano Store' } },
          },
        ],
        anomalie: [],
        errors: [],
      }),
      apply: vi.fn(),
      exportHistory: vi.fn(),
      loading: false,
      error: null,
    });
    render(<EmployeeSyncWizardPage clientId="client-1" />);
    const file = new File(['x'], 'test.xlsx');
    await userEvent.upload(screen.getByLabelText(/carica file/i), file);

    expect(await screen.findByText(/trasferito@x.it/)).toBeInTheDocument();
    expect(screen.getByText(/Torino Store/)).toBeInTheDocument();
    expect(screen.getByText(/Milano Store/)).toBeInTheDocument();
  });

  it('shows a warning for anomalie without blocking confirmation', async () => {
    useEmployeeSync.mockReturnValue({
      downloadTemplate: vi.fn(),
      preview: vi.fn().mockResolvedValue({
        nuovi: [],
        riattivati: [],
        rimossi: [],
        modificati: [],
        anomalie: [{ email: 'sparito@x.it', name: 'Sparito' }],
        errors: [],
      }),
      apply: vi.fn(),
      exportHistory: vi.fn(),
      loading: false,
      error: null,
    });
    render(<EmployeeSyncWizardPage clientId="client-1" />);
    const file = new File(['x'], 'test.xlsx');
    await userEvent.upload(screen.getByLabelText(/carica file/i), file);
    expect(await screen.findByText(/sparito@x.it/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /conferma tutte le modifiche/i })).toBeEnabled();
  });

  it('renders many anomalie as a scrollable list with a count, not one long comma-separated line', async () => {
    const anomalie = Array.from({ length: 12 }, (_, i) => ({
      email: `dipendente${i}@x.it`,
      name: `Dipendente ${i}`,
    }));
    useEmployeeSync.mockReturnValue({
      downloadTemplate: vi.fn(),
      preview: vi.fn().mockResolvedValue({
        nuovi: [],
        riattivati: [],
        rimossi: [],
        modificati: [],
        anomalie,
        errors: [],
      }),
      apply: vi.fn(),
      exportHistory: vi.fn(),
      loading: false,
      error: null,
    });
    render(<EmployeeSyncWizardPage clientId="client-1" />);
    const file = new File(['x'], 'test.xlsx');
    await userEvent.upload(screen.getByLabelText(/carica file/i), file);

    expect(await screen.findByText('dipendente0@x.it')).toBeInTheDocument();
    // Ogni anomalia è una riga di lista separata, non concatenata in una singola stringa.
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    // Il conteggio è visibile senza dover leggere/contare l'intera lista.
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /conferma tutte le modifiche/i })).toBeEnabled();
  });

  it('disables confirmation when the file has syntax errors', async () => {
    useEmployeeSync.mockReturnValue({
      downloadTemplate: vi.fn(),
      preview: vi.fn().mockResolvedValue({
        nuovi: [],
        riattivati: [],
        rimossi: [],
        modificati: [],
        anomalie: [],
        errors: ['riga 2: email non valida'],
      }),
      apply: vi.fn(),
      exportHistory: vi.fn(),
      loading: false,
      error: null,
    });
    render(<EmployeeSyncWizardPage clientId="client-1" />);
    const file = new File(['x'], 'test.xlsx');
    await userEvent.upload(screen.getByLabelText(/carica file/i), file);
    expect(await screen.findByText(/email non valida/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /conferma tutte le modifiche/i })).toBeDisabled();
  });
});
