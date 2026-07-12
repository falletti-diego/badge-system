import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrendChart from '../features/dashboard/components/TrendChart';

describe('TrendChart', () => {
  it('mostra il titolo e non crasha con dati vuoti', () => {
    render(<TrendChart days={[]} loading={false} error={null} />);
    expect(screen.getByText(/Presenze giornaliere/i)).toBeInTheDocument();
  });

  it('mostra un messaggio di errore quando error è presente', () => {
    render(<TrendChart days={[]} loading={false} error="Errore di rete" />);
    expect(screen.getByText(/Errore di rete/i)).toBeInTheDocument();
  });

  it('mostra un indicatore di caricamento quando loading è true', () => {
    render(<TrendChart days={[]} loading={true} error={null} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('espone un testo alternativo accessibile per il grafico', () => {
    render(<TrendChart days={[]} loading={false} error={null} />);
    expect(
      screen.getByRole('img', { name: /presenze giornaliere degli ultimi 30 giorni/i }),
    ).toBeInTheDocument();
  });
});
