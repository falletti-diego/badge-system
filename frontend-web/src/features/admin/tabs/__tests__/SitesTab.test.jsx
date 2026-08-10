import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SitesTab } from '../SitesTab';
import apiClient from '../../../../services/apiClient';
import { useFetch } from '../../components/useFetch';

vi.mock('../../../../services/apiClient');
vi.mock('../../components/useFetch');

describe('SitesTab — Rigenera QR', () => {
  const site = {
    id: 'site-1', name: 'Torino Store', client_name: 'Dataxiom', location: 'Via Roma 1',
    qr_code_content: 'badge://checkin?site_id=site-1&client_id=client-1&v=OLD',
    geofencing_feature_enabled: true, geofence_enabled: false, geofence_radius_meters: 150,
    created_at: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useFetch.mockImplementation((url) => {
      if (url.includes('/clients')) return { data: [{ id: 'client-1', name: 'Dataxiom', geofencing_feature_enabled: true }] };
      return { data: [site], loading: false, error: null, reload: vi.fn() };
    });
  });

  it('apre il dialog di conferma con testo esplicito sull\'invalidazione del poster', async () => {
    render(<SitesTab />);
    fireEvent.click(screen.getByRole('button', { name: /rigenera qr/i }));

    expect(await screen.findByText(/smette immediatamente di funzionare/i)).toBeInTheDocument();
  });

  it('alla conferma chiama POST /api/admin/sites/:id/regenerate-qr e ricarica la tabella', async () => {
    apiClient.post.mockResolvedValue({ data: { success: true, data: { ...site, qr_code_content: 'badge://checkin?site_id=site-1&client_id=client-1&v=NEW' } } });

    render(<SitesTab />);
    fireEvent.click(screen.getByRole('button', { name: /rigenera qr/i }));
    fireEvent.click(await screen.findByText('Rigenera'));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/sites/site-1/regenerate-qr'));
  });
});
