import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeRoleDialog } from './ChangeRoleDialog';
import apiClient from '../../../services/apiClient';

vi.mock('../../../services/apiClient');

const MANAGER = { id: 'mgr-1', name: 'Mario Rossi', role: 'manager', client_id: 'client-1', reports_to_id: null };
const SENIOR = { id: 'sm-1', name: 'Senior Uno', role: 'senior_manager', client_id: 'client-1', reports_to_id: null };
const ALL_EMPLOYEES = [
  MANAGER, SENIOR,
  { id: 'dir-1', name: 'Direttore Uno', role: 'director', client_id: 'client-1', reports_to_id: null },
  { id: 'dir-2', name: 'Direttore Altro Cliente', role: 'director', client_id: 'client-2', reports_to_id: null },
];

describe('ChangeRoleDialog', () => {
  it('offers only Senior Manager and Direttore when promoting a manager', async () => {
    const user = userEvent.setup();
    render(<ChangeRoleDialog employee={MANAGER} allEmployees={ALL_EMPLOYEES} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: /nuovo ruolo/i }));
    expect(screen.getByRole('option', { name: 'Senior Manager' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Direttore' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Manager' })).not.toBeInTheDocument();
  });

  it('offers only Direttore when promoting a senior_manager', async () => {
    const user = userEvent.setup();
    render(<ChangeRoleDialog employee={SENIOR} allEmployees={ALL_EMPLOYEES} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: /nuovo ruolo/i }));
    expect(screen.getByRole('option', { name: 'Direttore' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Senior Manager' })).not.toBeInTheDocument();
  });

  it('filters approver options to the same client, excludes director role when target is director', async () => {
    const user = userEvent.setup();
    render(<ChangeRoleDialog employee={SENIOR} allEmployees={ALL_EMPLOYEES} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: /nuovo ruolo/i }));
    await user.click(screen.getByRole('option', { name: 'Direttore' }));
    expect(screen.getByRole('combobox', { name: /approvatore richieste personali/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('calls PATCH with the selected role and reports_to_id, then onSuccess+onClose', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    apiClient.patch.mockResolvedValueOnce({ data: { success: true, data: { id: 'mgr-1', role: 'senior_manager' } } });
    const user = userEvent.setup();
    render(<ChangeRoleDialog employee={MANAGER} allEmployees={ALL_EMPLOYEES} onClose={onClose} onSuccess={onSuccess} />);
    await user.click(screen.getByRole('combobox', { name: /nuovo ruolo/i }));
    await user.click(screen.getByRole('option', { name: 'Senior Manager' }));
    await user.click(screen.getByRole('combobox', { name: /approvatore richieste personali/i }));
    await user.click(screen.getByRole('option', { name: /direttore uno/i }));
    await user.click(screen.getByRole('button', { name: /conferma/i }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/admin/employees/mgr-1/role', {
      role: 'senior_manager', reports_to_id: 'dir-1',
    }));
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the backend error message and does not close on failure', async () => {
    apiClient.patch.mockRejectedValueOnce({ response: { data: { message: 'reports_to_id would create a cycle' } } });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ChangeRoleDialog employee={MANAGER} allEmployees={ALL_EMPLOYEES} onClose={onClose} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: /nuovo ruolo/i }));
    await user.click(screen.getByRole('option', { name: 'Senior Manager' }));
    await user.click(screen.getByRole('button', { name: /conferma/i }));
    expect(await screen.findByText(/would create a cycle/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
