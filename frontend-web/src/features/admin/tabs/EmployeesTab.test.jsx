import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmployeesTab } from './EmployeesTab';
import apiClient from '../../../services/apiClient';

const MOCK_CLIENTS = [{ id: 'client-1', name: 'Cliente Test' }];
const MOCK_SITES = [
  { id: 'site-1', client_id: 'client-1', name: 'Sede Torino' },
  { id: 'site-2', client_id: 'client-1', name: 'Sede Milano' },
];
const MOCK_EMPLOYEES = [
  { id: 'mgr-1', name: 'Manager Torino', role: 'manager', site_id: 'site-1', client_id: 'client-1' },
  { id: 'sm-1', name: 'Senior Manager Uno', role: 'senior_manager', client_id: 'client-1' },
  { id: 'dir-1', name: 'Direttore Uno', role: 'director', client_id: 'client-1' },
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

vi.mock('../../../services/apiClient');

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
    expect(screen.getByRole('combobox', { name: /^sede$/i })).toBeInTheDocument();
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

    expect(screen.getByRole('combobox', { name: /manager di sede/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/i manager non hanno un manager di riferimento/i)).toBeInTheDocument();
  });

  it('disables Manager di riferimento with a hint until a Sede is chosen', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));

    expect(screen.getByRole('combobox', { name: /manager di sede/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/seleziona prima una sede/i)).toBeInTheDocument();
  });

  it('shows a helper hint when the chosen Sede has no manager', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByRole('combobox', { name: /^sede$/i }));
    await user.click(screen.getByRole('option', { name: 'Sede Milano' }));

    expect(screen.getByText(/nessun manager assegnato a questa sede/i)).toBeInTheDocument();
  });

  it('enables Manager di riferimento with the site manager when a Sede with a manager is chosen', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByRole('combobox', { name: /^sede$/i }));
    await user.click(screen.getByRole('option', { name: 'Sede Torino' }));

    const managerField = screen.getByRole('combobox', { name: /manager di sede/i });
    expect(managerField).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(managerField);
    expect(screen.getByRole('option', { name: 'Manager Torino' })).toBeInTheDocument();
  });

  it('disables the submit button for role employee until a Manager di riferimento is chosen, even when managers are available', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);

    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByRole('combobox', { name: /^sede$/i }));
    await user.click(screen.getByRole('option', { name: 'Sede Torino' })); // has a manager (mgr-1)
    await user.type(screen.getByRole('textbox', { name: /^nome/i }), 'Mario Rossi');
    await user.type(screen.getByRole('textbox', { name: /^email/i }), 'mario.rossi@example.com');

    const submitButton = screen.getByRole('button', { name: /crea dipendente/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/seleziona un manager di riferimento/i)).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /manager di sede/i }));
    await user.click(screen.getByRole('option', { name: 'Manager Torino' }));

    expect(submitButton).toBeEnabled();
  });

  it('does not submit a stale manager_id when switching Ruolo to Manager after picking one as employee', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { name: 'Mario Rossi' }, temp_password: null } });
    const user = userEvent.setup();
    render(<EmployeesTab />);

    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));

    await user.click(screen.getByRole('combobox', { name: /^sede$/i }));
    await user.click(screen.getByRole('option', { name: 'Sede Torino' }));

    // Still role=employee (default): pick a manager di riferimento.
    await user.click(screen.getByRole('combobox', { name: /manager di sede/i }));
    await user.click(screen.getByRole('option', { name: 'Manager Torino' }));

    // Now switch role to Manager — manager_id should be cleared.
    await user.click(screen.getByLabelText(/^ruolo$/i));
    await user.click(screen.getByRole('option', { name: 'Manager' }));

    await user.type(screen.getByRole('textbox', { name: /^nome/i }), 'Mario Rossi');
    await user.type(screen.getByRole('textbox', { name: /^email/i }), 'mario.rossi@example.com');

    await user.click(screen.getByRole('button', { name: /crea dipendente/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const payload = apiClient.post.mock.calls[0][1];
    expect(payload.manager_id).toBeFalsy();
  });

  it('disables the submit button when Matricola has invalid characters', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);

    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.type(screen.getByRole('textbox', { name: /^nome/i }), 'Mario Rossi');
    await user.type(screen.getByRole('textbox', { name: /^email/i }), 'mario.rossi@example.com');

    const submitButton = screen.getByRole('button', { name: /crea dipendente/i });
    expect(submitButton).toBeEnabled();

    await user.type(screen.getByLabelText(/matricola/i), 'ABC-123');

    expect(submitButton).toBeDisabled();

    // Clearing the invalid characters re-enables it.
    await user.clear(screen.getByLabelText(/matricola/i));
    await user.type(screen.getByLabelText(/matricola/i), 'ABC123');

    expect(submitButton).toBeEnabled();
  });

  it('blocks submit natively when no Sede is selected, without calling the API', async () => {
    // MUI's <Select required> renders a hidden `MuiSelect-nativeInput` that participates in
    // native HTML5 form validation, so the browser refuses to fire the `submit` event (and
    // handleSubmit never runs) when form.site_id === ''. Confirmed directly by inspecting
    // form.checkValidity() during a checkpoint review — do not "fix" this by assuming
    // apiClient.post needs a guard for missing site_id.
    apiClient.post.mockClear();
    apiClient.post.mockResolvedValue({ data: { data: { name: 'Mario Rossi' }, temp_password: null } });
    const user = userEvent.setup();
    render(<EmployeesTab />);

    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.type(screen.getByRole('textbox', { name: /^nome/i }), 'Mario Rossi');
    await user.type(screen.getByRole('textbox', { name: /^email/i }), 'mario.rossi@example.com');

    // Deliberately skip selecting a Sede.
    await user.click(screen.getByRole('button', { name: /crea dipendente/i }));

    // Give any (unexpected) async submit handling a chance to run before asserting.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('shows the real Zod validation message instead of a generic Axios error', async () => {
    apiClient.post.mockRejectedValue({
      response: {
        data: {
          error: 'Validation Error',
          details: [{ message: 'employees must have at least one assigned site', path: ['assigned_sites'] }],
        },
      },
      message: 'Request failed with status code 400',
    });
    const user = userEvent.setup();
    render(<EmployeesTab />);

    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByRole('combobox', { name: /^sede$/i }));
    await user.click(screen.getByRole('option', { name: 'Sede Torino' }));
    await user.type(screen.getByRole('textbox', { name: /^nome/i }), 'Mario Rossi');
    await user.type(screen.getByRole('textbox', { name: /^email/i }), 'mario.rossi@example.com');
    await user.click(screen.getByRole('combobox', { name: /manager di sede/i }));
    await user.click(screen.getByRole('option', { name: 'Manager Torino' }));

    await user.click(screen.getByRole('button', { name: /crea dipendente/i }));

    await waitFor(() =>
      expect(screen.getByText(/employees must have at least one assigned site/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/request failed with status code 400/i)).not.toBeInTheDocument();
  });

  it('shows Senior Manager and Direttore options in the role dropdown', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByRole('combobox', { name: /^ruolo$/i }));
    expect(screen.getByRole('option', { name: 'Senior Manager' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Direttore' })).toBeInTheDocument();
  });

  it('disables Approvatore richieste personali when role is Dipendente', () => {
    render(<EmployeesTab />);
    expect(screen.getByRole('combobox', { name: /approvatore richieste personali/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('enables Approvatore richieste personali and filters options when role is Manager', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByRole('combobox', { name: /^ruolo$/i }));
    await user.click(screen.getByRole('option', { name: 'Manager' }));

    const approverField = screen.getByRole('combobox', { name: /approvatore richieste personali/i });
    expect(approverField).not.toHaveAttribute('aria-disabled', 'true');

    await user.click(approverField);
    expect(screen.getByRole('option', { name: /Senior Manager Uno/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Direttore Uno/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Manager Torino/i })).not.toBeInTheDocument();
  });

  it('shows only Direttore as an approver option when role is Senior Manager', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByRole('combobox', { name: /^ruolo$/i }));
    await user.click(screen.getByRole('option', { name: 'Senior Manager' }));

    const approverField = screen.getByRole('combobox', { name: /approvatore richieste personali/i });
    await user.click(approverField);
    expect(screen.getByRole('option', { name: /Direttore Uno/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Senior Manager Uno/i })).not.toBeInTheDocument();
  });

  it('clears reports_to_id when the role changes after a real approver was selected', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByRole('combobox', { name: /^ruolo$/i }));
    await user.click(screen.getByRole('option', { name: 'Manager' }));

    const approverField = screen.getByRole('combobox', { name: /approvatore richieste personali/i });
    await user.click(approverField);
    await user.click(screen.getByRole('option', { name: /Senior Manager Uno/i }));
    expect(approverField).toHaveTextContent(/Senior Manager Uno/i);

    // Switch to a different role that keeps the field enabled — the stale approver
    // selection must not silently persist (it may not even be a valid option anymore).
    await user.click(screen.getByRole('combobox', { name: /^ruolo$/i }));
    await user.click(screen.getByRole('option', { name: 'Senior Manager' }));

    expect(approverField).not.toHaveTextContent(/Senior Manager Uno/i);
  });
});
