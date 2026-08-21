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

  it('mostra un messaggio esplicito (non un semplice trattino) quando il pairing IN/OUT fallisce per limite di pagina (finding #11)', () => {
    const data = { rows: [{ id: 'c1', employee_id: 'e1', type: 'OUT', timestamp: '2026-08-02T18:00:00Z' }], total: 1 };
    render(<PresencesTable data={data} />);
    expect(screen.getByText(/verifica pagina precedente/i)).toBeInTheDocument();
  });

  it('mostra una riga evento approvato con badge "Evento", descrizione al posto della sede, e durata precomputata', () => {
    const eventRow = {
      id: 'event-evt-1',
      employee_id: 'emp-1',
      employee_name: 'Maria Rossi',
      employee_email: null,
      site_name: 'Congresso a Torino',
      timestamp: '2026-08-21T08:00:00',
      type: 'EVENT',
      is_event: true,
      modified_at: null,
      ore_label: '10h',
    };
    render(<PresencesTable data={{ rows: [eventRow], total: 1 }} />);

    expect(screen.getByText('Evento')).toBeInTheDocument();
    expect(screen.getByText('Congresso a Torino')).toBeInTheDocument();
    expect(screen.getByText('10h')).toBeInTheDocument();
    expect(screen.getByText('Maria Rossi')).toBeInTheDocument();
  });

  it('non applica il pairing IN/OUT alle righe evento (una riga EVENT isolata non genera un errore di pairing)', () => {
    const rows = [
      { id: 'c1', employee_id: 'e1', type: 'IN', timestamp: '2026-08-02T09:00:00Z' },
      {
        id: 'event-evt-1', employee_id: 'e1', type: 'EVENT', is_event: true,
        timestamp: '2026-08-03T08:00:00', ore_label: '10h', site_name: 'Congresso',
      },
      { id: 'c2', employee_id: 'e1', type: 'OUT', timestamp: '2026-08-02T17:00:00Z' },
    ];
    render(<PresencesTable data={{ rows, total: 3 }} />);

    // The checkin pair still resolves correctly despite the EVENT row sitting between them.
    expect(screen.getByText('8h')).toBeInTheDocument();
    expect(screen.getByText('10h')).toBeInTheDocument();
  });
});
