import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import HelpPage from '../pages/HelpPage';
import authService from '../services/authService';

vi.mock('../services/authService', () => ({
  default: { getUserRole: vi.fn(), logout: vi.fn(), isDemo: vi.fn().mockReturnValue(false), getDemoDaysRemaining: vi.fn().mockReturnValue(null) },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Test User', role: 'manager', email: 'test@example.com' }, loading: false }),
}));

describe('HelpPage — role-based FAQ visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('un employee vede le FAQ "employee" e "all", non quelle "staff"', () => {
    authService.getUserRole.mockReturnValue('employee');
    render(<Router><HelpPage /></Router>);

    expect(screen.getByText('Perché non riesco a timbrare (check-in rifiutato)?')).toBeInTheDocument();
    expect(screen.getByText('Come vengono protetti i dati dei dipendenti?')).toBeInTheDocument();
    expect(screen.queryByText('Come posso aggiungere un nuovo dipendente?')).not.toBeInTheDocument();
  });

  test('un admin vede le FAQ "staff" e "all", non quelle "employee"-only', () => {
    authService.getUserRole.mockReturnValue('admin');
    render(<Router><HelpPage /></Router>);

    expect(screen.getByText('Come posso aggiungere un nuovo dipendente?')).toBeInTheDocument();
    expect(screen.getByText('Come vengono protetti i dati dei dipendenti?')).toBeInTheDocument();
    expect(screen.queryByText('Perché non riesco a timbrare (check-in rifiutato)?')).not.toBeInTheDocument();
  });

  test('un manager vede le stesse FAQ "staff" di un admin', () => {
    authService.getUserRole.mockReturnValue('manager');
    render(<Router><HelpPage /></Router>);
    expect(screen.getByText('Quante sedi posso gestire con un unico account manager?')).toBeInTheDocument();
  });

  test('un viewer vede le FAQ "staff"', () => {
    authService.getUserRole.mockReturnValue('viewer');
    render(<Router><HelpPage /></Router>);
    expect(screen.getByText('Il dipendente ha scansionato il QR sbagliato (altra sede). Come si corregge?')).toBeInTheDocument();
  });

  test('ruolo non determinabile (null): solo le FAQ "all" sono visibili', () => {
    authService.getUserRole.mockReturnValue(null);
    render(<Router><HelpPage /></Router>);

    expect(screen.getByText('Come vengono protetti i dati dei dipendenti?')).toBeInTheDocument();
    expect(screen.queryByText('Come posso aggiungere un nuovo dipendente?')).not.toBeInTheDocument();
    expect(screen.queryByText('Perché non riesco a timbrare (check-in rifiutato)?')).not.toBeInTheDocument();
  });

  test('cliccare una domanda espande la risposta', () => {
    authService.getUserRole.mockReturnValue('employee');
    render(<Router><HelpPage /></Router>);

    expect(screen.queryByText(/interruttore/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Come attivo o disattivo il Face ID per il check-in?'));
    expect(screen.getByText(/interruttore/)).toBeInTheDocument();
  });
});
