import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { OnboardingWizardPage } from './OnboardingWizardPage';

const mockPreview = vi.fn();
const mockApply = vi.fn();
const mockResendCredentials = vi.fn();

vi.mock('../hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    preview: mockPreview,
    apply: mockApply,
    resendCredentials: mockResendCredentials,
    loading: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

const renderWithRouter = (component) => render(<BrowserRouter>{component}</BrowserRouter>);

function makeFile() {
  return new File(['dummy'], 'onboarding.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function uploadFile() {
  const input = screen.getByLabelText(/carica file excel/i);
  fireEvent.change(input, { target: { files: [makeFile()] } });
  fireEvent.click(screen.getByRole('button', { name: /continua/i }));
}

describe('OnboardingWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the preview diff after uploading a valid Excel file', async () => {
    mockPreview.mockResolvedValueOnce({
      errors: [],
      warnings: [],
      summary: { sedi: 1, dipendenti_creati: 2, dipendenti_aggiornati: 0, saldi: 4 },
    });

    renderWithRouter(<OnboardingWizardPage />);
    uploadFile();

    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/Dipendenti creati: 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /conferma e importa/i })).not.toBeDisabled();
  });

  it('disables the confirm button when the preview reports blocking errors', async () => {
    mockPreview.mockResolvedValueOnce({
      errors: ['Sede "Sede Inesistente" non trovata'],
      warnings: [],
      summary: null,
    });

    renderWithRouter(<OnboardingWizardPage />);
    uploadFile();

    expect(await screen.findByText(/Sede Inesistente/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /conferma e importa/i })).toBeDisabled();
  });

  it('shows the summary with a link to /admin/sites after a successful apply', async () => {
    mockPreview.mockResolvedValueOnce({
      errors: [],
      warnings: [],
      summary: { sedi: 1, dipendenti_creati: 1, dipendenti_aggiornati: 0, saldi: 0 },
    });
    mockApply.mockResolvedValueOnce({
      errors: [],
      summary: { sedi: 1, dipendenti_creati: 1, dipendenti_aggiornati: 0, saldi: 0 },
      failedEmails: [],
    });

    renderWithRouter(<OnboardingWizardPage />);
    uploadFile();
    fireEvent.click(await screen.findByRole('button', { name: /conferma e importa/i }));

    await waitFor(() => {
      expect(mockApply).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/importazione completata/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vai alle sedi/i })).toHaveAttribute('href', '/admin/sites');
  });

  it('shows the failed-email retry list when apply reports failedEmails', async () => {
    mockPreview.mockResolvedValueOnce({
      errors: [],
      warnings: [],
      summary: { sedi: 0, dipendenti_creati: 1, dipendenti_aggiornati: 0, saldi: 0 },
    });
    mockApply.mockResolvedValueOnce({
      errors: [],
      summary: { sedi: 0, dipendenti_creati: 1, dipendenti_aggiornati: 0, saldi: 0 },
      failedEmails: [{ id: 'emp-1', email: 'mario@example.invalid' }],
    });

    renderWithRouter(<OnboardingWizardPage />);
    uploadFile();
    fireEvent.click(await screen.findByRole('button', { name: /conferma e importa/i }));

    expect(await screen.findByText(/mario@example\.invalid/i)).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: /rigenera credenziali/i });
    expect(retryButton).toBeInTheDocument();

    mockResendCredentials.mockResolvedValueOnce({ temp_password: 'Abcd1234' });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(mockResendCredentials).toHaveBeenCalledWith('emp-1');
    });
    expect(await screen.findByText('Abcd1234')).toBeInTheDocument();
  });
});
