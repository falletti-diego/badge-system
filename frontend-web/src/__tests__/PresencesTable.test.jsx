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

  it('mostra il chip "No Face ID" quando faceid_verified è false', () => {
    const data = { rows: [{ id: 'c1', employee_id: 'e1', type: 'IN', timestamp: '2026-08-02T09:00:00Z', faceid_verified: false }], total: 1 };
    render(<PresencesTable data={data} />);
    expect(screen.getByText('No Face ID')).toBeInTheDocument();
  });

  it('non mostra il chip quando faceid_verified è true', () => {
    const data = { rows: [{ id: 'c1', employee_id: 'e1', type: 'IN', timestamp: '2026-08-02T09:00:00Z', faceid_verified: true }], total: 1 };
    render(<PresencesTable data={data} />);
    expect(screen.queryByText('No Face ID')).not.toBeInTheDocument();
  });
});
