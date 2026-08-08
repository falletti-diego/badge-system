import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import SummaryPage from '../pages/SummaryPage';
import apiClient from '../services/apiClient';
import authService from '../services/authService';

vi.mock('../services/apiClient', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../services/authService', () => ({
  default: {
    getUserRole: vi.fn().mockReturnValue('manager'),
    isDemo: vi.fn().mockReturnValue(false),
    getDemoDaysRemaining: vi.fn().mockReturnValue(null),
    getUser: vi.fn().mockReturnValue({ id: 'u1', role: 'manager' }),
    getSiteId: vi.fn().mockReturnValue(null),
    getEmployeeId: vi.fn().mockReturnValue(null),
  },
}));

const mockPrint = vi.fn();

describe('SummaryPage — PDF export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authService.getUserRole.mockReturnValue('manager');
    window.print = mockPrint;
    apiClient.get.mockResolvedValue({
      data: {
        data: {
          employees: [
            { id: 'e1', name: 'Mario Rossi', matricola: 'M001', giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 20, presenze_aperte: 0 },
          ],
          totals: { giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 20 },
          meal_voucher_threshold_hours: 6,
        },
      },
    });
  });

  test('il bottone "Esporta PDF" chiama window.print', async () => {
    render(<Router><SummaryPage /></Router>);
    await waitFor(() => expect(screen.getByText('Mario Rossi')).toBeInTheDocument());

    fireEvent.click(screen.getByText('PDF'));

    expect(mockPrint).toHaveBeenCalledTimes(1);
  });

  test('il titolo di stampa mostra il mese e anno correnti', async () => {
    render(<Router><SummaryPage /></Router>);
    await waitFor(() => expect(screen.getByText('Mario Rossi')).toBeInTheDocument());

    const now = new Date();
    const monthNames = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const expectedTitle = `📊 Riepilogo Ore — ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    expect(screen.getByText(expectedTitle)).toBeInTheDocument();
  });
});
