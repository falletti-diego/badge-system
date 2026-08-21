import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { usePresences } from '../usePresences';
import apiClient from '../../../../services/apiClient';

vi.mock('../../../../services/apiClient', () => ({
  default: { get: vi.fn() },
}));

describe('usePresences — pollStats error visibility (finding #9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // shouldAdvanceTime lets fake timers tick forward in step with real wall-clock
    // time, so @testing-library's waitFor (which polls via real setTimeout under
    // the hood) keeps working while setInterval is still faked for our explicit
    // vi.advanceTimersByTime(30000) below.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('imposta error quando il poll in background fallisce', async () => {
    apiClient.get.mockResolvedValueOnce({ data: { data: [], pagination: { total: 0 } } }); // fetchPresences: checkins
    apiClient.get.mockResolvedValueOnce({ data: { data: [] } }); // fetchPresences: approved events (page 1)
    apiClient.get.mockResolvedValueOnce({ data: { data: {} } }); // fetchStats iniziale
    apiClient.get.mockRejectedValueOnce(new Error('Network Error')); // pollStats dopo 30s

    // NOTE: filters must be a stable reference across re-renders. Passing a fresh
    // `{}` literal inline (e.g. `usePresences({})`) is recreated on every render
    // that renderHook triggers via the hook's own setState calls, which changes
    // the `filters` dependency identity on every render and causes an infinite
    // fetch loop (fetchPresences/fetchStats/refetch are all memoized on `filters`).
    const stableFilters = {};
    const { result } = renderHook(() => usePresences(stableFilters));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      vi.advanceTimersByTime(30000);
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).toBe('Network Error');
  });

  it('auto-guarisce: un poll riuscito dopo un poll fallito ripulisce error', async () => {
    apiClient.get.mockResolvedValueOnce({ data: { data: [], pagination: { total: 0 } } }); // fetchPresences: checkins
    apiClient.get.mockResolvedValueOnce({ data: { data: [] } }); // fetchPresences: approved events (page 1)
    apiClient.get.mockResolvedValueOnce({ data: { data: {} } }); // fetchStats iniziale
    apiClient.get.mockRejectedValueOnce(new Error('Network Error')); // pollStats #1 (30s) fallisce
    apiClient.get.mockResolvedValueOnce({ data: { data: {} } }); // pollStats #2 (60s) riesce

    const stableFilters = {};
    const { result } = renderHook(() => usePresences(stableFilters));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      vi.advanceTimersByTime(30000);
    });
    await waitFor(() => expect(result.current.error).toBeTruthy());

    act(() => {
      vi.advanceTimersByTime(30000);
    });

    await waitFor(() => expect(result.current.error).toBeFalsy());
  });
});
