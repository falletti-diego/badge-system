import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEvents } from './useEvents';
import apiClient from '../../../services/apiClient';

vi.mock('../../../services/apiClient');

describe('useEvents Hook', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('createRequest', () => {
    it('should successfully create an event request', async () => {
      const mockResponse = {
        data: { data: { id: 'evt-123', status: 'PENDING', event_date: '2026-09-01' } },
      };
      apiClient.post.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useEvents());

      let created;
      await act(async () => {
        created = await result.current.createRequest('2026-09-01', '08:00', '18:00', 'Congresso di settore a Milano');
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/events/request', {
        event_date: '2026-09-01',
        start_time: '08:00',
        end_time: '18:00',
        description: 'Congresso di settore a Milano',
      });
      expect(created.id).toBe('evt-123');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should surface a conflict error message', async () => {
      const mockError = {
        response: { data: { error: 'EVENT_DATE_CONFLICT', message: 'A presence or absence is already recorded for this date' } },
      };
      apiClient.post.mockRejectedValue(mockError);

      const { result } = renderHook(() => useEvents());

      await act(async () => {
        await expect(result.current.createRequest('2026-09-01', '08:00', '18:00', 'Congresso di settore')).rejects.toEqual(mockError);
      });

      expect(result.current.error).toBe('A presence or absence is already recorded for this date');
    });
  });

  describe('getMyRequests', () => {
    it('should fetch the caller\'s own event requests', async () => {
      apiClient.get.mockResolvedValue({ data: { data: [{ id: 'evt-1' }] } });

      const { result } = renderHook(() => useEvents());

      let requests;
      await act(async () => { requests = await result.current.getMyRequests(); });

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/events/my-requests');
      expect(requests).toEqual([{ id: 'evt-1' }]);
    });
  });

  describe('getPendingRequests', () => {
    it('should fetch pending event requests', async () => {
      apiClient.get.mockResolvedValue({ data: { data: [{ id: 'evt-2', status: 'PENDING' }] } });

      const { result } = renderHook(() => useEvents());

      let requests;
      await act(async () => { requests = await result.current.getPendingRequests(); });

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/events/pending');
      expect(requests).toEqual([{ id: 'evt-2', status: 'PENDING' }]);
    });
  });

  describe('approveRequest / rejectRequest', () => {
    it('should PUT status=APPROVED', async () => {
      apiClient.put.mockResolvedValue({ data: { data: { id: 'evt-3', status: 'APPROVED' } } });

      const { result } = renderHook(() => useEvents());
      await act(async () => { await result.current.approveRequest('evt-3'); });

      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/events/evt-3/approve', {
        status: 'APPROVED', rejection_reason: null,
      });
    });

    it('should PUT status=REJECTED with a reason', async () => {
      apiClient.put.mockResolvedValue({ data: { data: { id: 'evt-3', status: 'REJECTED' } } });

      const { result } = renderHook(() => useEvents());
      await act(async () => { await result.current.rejectRequest('evt-3', 'Troppi assenti quel giorno'); });

      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/events/evt-3/approve', {
        status: 'REJECTED', rejection_reason: 'Troppi assenti quel giorno',
      });
    });
  });
});
