import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PresencesTable from '../features/dashboard/components/PresencesTable';

describe('PresencesTable — badge Offline', () => {
  const baseRow = {
    id: 'ci-1',
    employee_id: 'emp-1',
    employee_name: 'Mario Rossi',
    employee_email: 'mario@example.com',
    site_name: 'Sede Torino',
    timestamp: '2026-07-22T08:00:00.000Z',
    type: 'IN',
    modified_at: null,
  };

  it('mostra il Chip "Offline" quando is_offline è true', () => {
    render(<PresencesTable data={{ rows: [{ ...baseRow, is_offline: true }], total: 1 }} />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('non mostra il Chip "Offline" quando is_offline è false', () => {
    render(<PresencesTable data={{ rows: [{ ...baseRow, is_offline: false }], total: 1 }} />);
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });

  it('non mostra il Chip "Offline" quando is_offline è assente (retrocompatibilità)', () => {
    render(<PresencesTable data={{ rows: [{ ...baseRow }], total: 1 }} />);
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });
});
