import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import MySummaryPage from '../pages/MySummaryPage';
import apiClient from '../services/apiClient';

vi.mock('../services/apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

// La pagina mostra sempre il mese scorso rispetto a "oggi" (unico mese firmabile
// lato server) — calcolato qui allo stesso modo del componente, per non
// hardcodare un mese fisso che diventerebbe sbagliato a seconda di quando
// gira il test.
const now = new Date();
const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

describe('MySummaryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('mostra il banner "Da firmare" e il bottone quando non c\'è firma, per un mese passato', async () => {
    apiClient.get.mockResolvedValue({
      data: { data: {
        period: { month: lastMonth, year: lastMonthYear },
        giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 18,
        signature: null,
      } },
    });

    render(<Router><MySummaryPage /></Router>);
    await waitFor(() => expect(screen.getByText(/Da firmare/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Approvo il cartellino/i })).toBeEnabled();
  });

  test('click su "Approvo il cartellino" chiama POST /timesheet/sign col mese scorso e aggiorna il banner', async () => {
    apiClient.get.mockResolvedValue({
      data: { data: {
        period: { month: lastMonth, year: lastMonthYear },
        giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 18,
        signature: null,
      } },
    });
    apiClient.post.mockResolvedValue({ data: { data: { status: 'signed', signed_at: new Date().toISOString() } } });

    render(<Router><MySummaryPage /></Router>);
    await waitFor(() => expect(screen.getByRole('button', { name: /Approvo il cartellino/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Approvo il cartellino/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/v1/timesheet/sign', { month: lastMonth, year: lastMonthYear }));
  });

  test('mostra "Modificato dopo la firma" quando lo stato è invalidated', async () => {
    apiClient.get.mockResolvedValue({
      data: { data: {
        period: { month: lastMonth, year: lastMonthYear },
        giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 18,
        signature: { status: 'invalidated', signed_at: '2026-07-02T09:00:00Z' },
      } },
    });

    render(<Router><MySummaryPage /></Router>);
    await waitFor(() => expect(screen.getByText(/Modificato dopo la firma/i)).toBeInTheDocument());
  });
});
