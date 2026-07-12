import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MiniTrendCard from '../features/dashboard/components/MiniTrendCard';

describe('MiniTrendCard', () => {
  const days = [
    { date: '2026-07-01', ore_lavorate: 40, ore_straordinarie: 2, assenteismo_pct: 10 },
    { date: '2026-07-02', ore_lavorate: 42, ore_straordinarie: 3, assenteismo_pct: 5 },
  ];

  it('mostra il titolo passato come prop', () => {
    render(<MiniTrendCard title="Ore Lavorate" dataKey="ore_lavorate" days={days} color="#1E3A5F" suffix="h" />);
    expect(screen.getByText('Ore Lavorate')).toBeInTheDocument();
  });

  it('mostra il valore dell\'ultimo giorno come cifra corrente', () => {
    render(<MiniTrendCard title="Ore Lavorate" dataKey="ore_lavorate" days={days} color="#1E3A5F" suffix="h" />);
    expect(screen.getByText('42h')).toBeInTheDocument();
  });

  it('non crasha con array vuoto', () => {
    render(<MiniTrendCard title="Ore Lavorate" dataKey="ore_lavorate" days={[]} color="#1E3A5F" suffix="h" />);
    expect(screen.getByText('Ore Lavorate')).toBeInTheDocument();
  });

  it('espone un testo alternativo accessibile per il mini-grafico', () => {
    render(<MiniTrendCard title="Ore Lavorate" dataKey="ore_lavorate" days={days} color="#1E3A5F" suffix="h" />);
    expect(screen.getByRole('img', { name: /Ore Lavorate/i })).toBeInTheDocument();
  });
});
