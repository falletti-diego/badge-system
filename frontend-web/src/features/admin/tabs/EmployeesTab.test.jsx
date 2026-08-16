import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmployeesTab } from './EmployeesTab';

const MOCK_CLIENTS = [{ id: 'client-1', name: 'Cliente Test' }];
const MOCK_SITES = [
  { id: 'site-1', client_id: 'client-1', name: 'Sede Torino' },
  { id: 'site-2', client_id: 'client-1', name: 'Sede Milano' },
];
const MOCK_EMPLOYEES = [
  { id: 'mgr-1', name: 'Manager Torino', role: 'manager', site_id: 'site-1', client_id: 'client-1' },
];

vi.mock('../components/useFetch', () => ({
  useFetch: (url) => {
    if (url.includes('/clients')) return { data: MOCK_CLIENTS, loading: false, error: null, reload: vi.fn() };
    if (url.includes('/sites')) return { data: MOCK_SITES, loading: false, error: null, reload: vi.fn() };
    return { data: MOCK_EMPLOYEES, loading: false, error: null, reload: vi.fn() };
  },
}));

vi.mock('../hooks/useEmployeeSync', () => ({
  useEmployeeSync: () => ({
    downloadTemplate: vi.fn(),
    preview: vi.fn(),
    apply: vi.fn(),
    exportHistory: vi.fn(),
    loading: false,
    error: null,
  }),
}));

describe('EmployeesTab', () => {
  it('no longer renders the legacy CSV import card', () => {
    render(<EmployeesTab />);
    expect(screen.queryByText(/importazione csv/i)).not.toBeInTheDocument();
  });

  it('renders the Aggiorna Dipendenti entry point', () => {
    render(<EmployeesTab />);
    expect(screen.getByText(/aggiorna dipendenti/i)).toBeInTheDocument();
  });

  it('renders the export storico completo button', () => {
    render(<EmployeesTab />);
    expect(screen.getByRole('button', { name: /esporta storico completo/i })).toBeInTheDocument();
  });

  it('renders Sede, Matricola, Data assunzione fields', () => {
    render(<EmployeesTab />);
    expect(screen.getByLabelText(/^sede$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/matricola/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data assunzione/i)).toBeInTheDocument();
  });

  it('disables Manager di riferimento and shows a reason when role is manager', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByLabelText(/^ruolo$/i));
    await user.click(screen.getByRole('option', { name: 'Manager' }));

    expect(screen.getByLabelText(/manager di riferimento/i)).toBeDisabled();
    expect(screen.getByText(/i manager non hanno un manager di riferimento/i)).toBeInTheDocument();
  });

  it('disables Manager di riferimento with a hint until a Sede is chosen', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));

    expect(screen.getByLabelText(/manager di riferimento/i)).toBeDisabled();
    expect(screen.getByText(/seleziona prima una sede/i)).toBeInTheDocument();
  });

  it('shows a helper hint when the chosen Sede has no manager', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByLabelText(/^sede$/i));
    await user.click(screen.getByRole('option', { name: 'Sede Milano' }));

    expect(screen.getByText(/nessun manager assegnato a questa sede/i)).toBeInTheDocument();
  });

  it('enables Manager di riferimento with the site manager when a Sede with a manager is chosen', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByLabelText(/^sede$/i));
    await user.click(screen.getByRole('option', { name: 'Sede Torino' }));

    expect(screen.getByLabelText(/manager di riferimento/i)).not.toBeDisabled();
    await user.click(screen.getByLabelText(/manager di riferimento/i));
    expect(screen.getByRole('option', { name: 'Manager Torino' })).toBeInTheDocument();
  });
});
