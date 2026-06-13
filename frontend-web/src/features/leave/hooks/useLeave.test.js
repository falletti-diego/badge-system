import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLeave } from './useLeave';
import apiClient from '../../../services/apiClient';

vi.mock('../../../services/apiClient');

describe('useLeave Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createRequest', () => {
    it('should successfully create a leave request', async () => {
      const mockResponse = {
        data: {
          data: {
            id: 'req-123',
            status: 'PENDING',
            leave_type: 'FERIE_1',
            start_date: '2026-07-01',
            end_date: '2026-07-05',
          },
        },
      };

      apiClient.post.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeave());

      let createdRequest;
      await act(async () => {
        createdRequest = await result.current.createRequest(
          'FERIE_1',
          '2026-07-01',
          '2026-07-05',
          'Vacanza al mare'
        );
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/leave/request', {
        leave_type: 'FERIE_1',
        start_date: '2026-07-01',
        end_date: '2026-07-05',
        motivation: 'Vacanza al mare',
      });
      expect(createdRequest.id).toBe('req-123');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should handle insufficient saldo error', async () => {
      const mockError = {
        response: {
          data: {
            error: 'INSUFFICIENT_SALDO',
            message: 'Insufficient vacation days remaining',
          },
        },
      };

      apiClient.post.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.createRequest('FERIE_1', '2026-07-01', '2026-07-10', 'Test');
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('INSUFFICIENT_SALDO');
      expect(result.current.loading).toBe(false);
    });

    it('should handle validation error', async () => {
      const mockError = {
        response: {
          data: {
            error: 'VALIDATION_ERROR',
            details: [{ message: 'start_date is required' }],
          },
        },
      };

      apiClient.post.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.createRequest('FERIE_1', null, '2026-07-05', 'Test');
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('VALIDATION_ERROR');
    });

    it('should handle network error', async () => {
      const mockError = new Error('Network error');

      apiClient.post.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.createRequest('FERIE_1', '2026-07-01', '2026-07-05', 'Test');
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('Network error');
    });

    it('should clear loading state after request completes', async () => {
      apiClient.post.mockResolvedValue({
        data: { data: { id: 'req-123' } },
      });

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        await result.current.createRequest('FERIE_1', '2026-07-01', '2026-07-05', 'Test');
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe('getMyRequests', () => {
    it('should fetch user leave requests', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'req-1',
              leave_type: 'FERIE_1',
              start_date: '2026-07-01',
              end_date: '2026-07-05',
              status: 'APPROVED',
              created_at: '2026-06-13T10:00:00Z',
            },
            {
              id: 'req-2',
              leave_type: 'MALATTIA',
              start_date: '2026-07-10',
              end_date: '2026-07-10',
              status: 'PENDING',
              created_at: '2026-06-13T11:00:00Z',
            },
          ],
        },
      };

      apiClient.get.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeave());

      let requests;
      await act(async () => {
        requests = await result.current.getMyRequests();
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/leave/my-requests');
      expect(requests).toHaveLength(2);
      expect(requests[0].id).toBe('req-1');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should handle empty requests list', async () => {
      apiClient.get.mockResolvedValue({
        data: { data: [] },
      });

      const { result } = renderHook(() => useLeave());

      let requests;
      await act(async () => {
        requests = await result.current.getMyRequests();
      });

      expect(requests).toHaveLength(0);
    });

    it('should handle 401 unauthorized error', async () => {
      const mockError = {
        response: {
          status: 401,
          data: {
            error: 'UNAUTHORIZED',
          },
        },
      };

      apiClient.get.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.getMyRequests();
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('UNAUTHORIZED');
    });

    it('should handle server error', async () => {
      const mockError = {
        response: {
          status: 500,
          data: {
            error: 'SERVER_ERROR',
          },
        },
      };

      apiClient.get.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.getMyRequests();
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('SERVER_ERROR');
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      apiClient.post.mockRejectedValue(new Error('Test error'));

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.createRequest('FERIE_1', '2026-07-01', '2026-07-05', 'Test');
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).not.toBe(null);

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('resetForm', () => {
    it('should reset all state', async () => {
      apiClient.post.mockRejectedValue(new Error('Test error'));

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.createRequest('FERIE_1', '2026-07-01', '2026-07-05', 'Test');
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).not.toBe(null);

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.error).toBe(null);
      expect(result.current.loading).toBe(false);
    });
  });
});
