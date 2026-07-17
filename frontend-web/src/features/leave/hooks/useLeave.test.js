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

      expect(result.current.error).toBe('Insufficient vacation days remaining');
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

  describe('getPendingRequests', () => {
    it('should fetch pending leave requests', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'req-101',
              leave_type: 'FERIE_1',
              start_date: '2026-07-01',
              end_date: '2026-07-05',
              status: 'PENDING',
              employee_name: 'Maria Rossi',
            },
            {
              id: 'req-102',
              leave_type: 'MALATTIA',
              start_date: '2026-06-20',
              end_date: '2026-06-20',
              status: 'PENDING',
              employee_name: 'Luigi Bianchi',
            },
          ],
        },
      };

      apiClient.get.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeave());

      let requests;
      await act(async () => {
        requests = await result.current.getPendingRequests();
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/leave/pending');
      expect(requests).toHaveLength(2);
      expect(requests[0].employee_name).toBe('Maria Rossi');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should handle empty pending requests', async () => {
      apiClient.get.mockResolvedValue({ data: { data: [] } });

      const { result } = renderHook(() => useLeave());

      let requests;
      await act(async () => {
        requests = await result.current.getPendingRequests();
      });

      expect(requests).toHaveLength(0);
    });

    it('should handle error fetching pending requests', async () => {
      const mockError = {
        response: {
          data: {
            error: 'UNAUTHORIZED',
          },
        },
      };

      apiClient.get.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.getPendingRequests();
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('UNAUTHORIZED');
    });
  });

  describe('approveRequest', () => {
    it('should approve a leave request', async () => {
      const mockResponse = {
        data: {
          data: {
            id: 'req-101',
            status: 'APPROVED',
          },
        },
      };

      apiClient.put.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeave());

      let approvedRequest;
      await act(async () => {
        approvedRequest = await result.current.approveRequest('req-101');
      });

      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/leave/req-101/approve', {
        status: 'APPROVED',
        rejection_reason: null,
      });
      expect(approvedRequest.status).toBe('APPROVED');
      expect(result.current.loading).toBe(false);
    });

    it('should handle approval error', async () => {
      const mockError = {
        response: {
          data: {
            error: 'REQUEST_NOT_FOUND',
          },
        },
      };

      apiClient.put.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.approveRequest('invalid-id');
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('REQUEST_NOT_FOUND');
    });
  });

  describe('rejectRequest', () => {
    it('should reject a leave request', async () => {
      const mockResponse = {
        data: {
          data: {
            id: 'req-101',
            status: 'REJECTED',
          },
        },
      };

      apiClient.put.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeave());

      let rejectedRequest;
      await act(async () => {
        rejectedRequest = await result.current.rejectRequest('req-101', 'Conflicting shift');
      });

      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/leave/req-101/approve', {
        status: 'REJECTED',
        rejection_reason: 'Conflicting shift',
      });
      expect(rejectedRequest.status).toBe('REJECTED');
      expect(result.current.loading).toBe(false);
    });

    it('should use default rejection reason if not provided', async () => {
      const mockResponse = {
        data: {
          data: {
            id: 'req-101',
            status: 'REJECTED',
          },
        },
      };

      apiClient.put.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        await result.current.rejectRequest('req-101');
      });

      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/leave/req-101/approve', {
        status: 'REJECTED',
        rejection_reason: 'Rejected by manager',
      });
    });

    it('should handle rejection error', async () => {
      const mockError = {
        response: {
          data: {
            error: 'REQUEST_ALREADY_PROCESSED',
          },
        },
      };

      apiClient.put.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.rejectRequest('req-101', 'Test');
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('REQUEST_ALREADY_PROCESSED');
    });
  });

  describe('getAllLeaveRequests', () => {
    it('should fetch all leave requests', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'req-001',
              employee_id: 'emp-001',
              employee_name: 'Maria Rossi',
              leave_type: 'FERIE_1',
              start_date: '2026-07-01',
              end_date: '2026-07-05',
              status: 'APPROVED',
            },
            {
              id: 'req-002',
              employee_id: 'emp-002',
              employee_name: 'Luigi Bianchi',
              leave_type: 'MALATTIA',
              start_date: '2026-06-20',
              end_date: '2026-06-20',
              status: 'PENDING',
            },
          ],
        },
      };

      apiClient.get.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeave());

      let requests;
      await act(async () => {
        requests = await result.current.getAllLeaveRequests({});
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/leave/all');
      expect(requests).toHaveLength(2);
      expect(requests[0].employee_name).toBe('Maria Rossi');
      expect(result.current.loading).toBe(false);
    });

    it('should filter requests by status', async () => {
      apiClient.get.mockResolvedValue({ data: { data: [] } });

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        await result.current.getAllLeaveRequests({ status: 'PENDING' });
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/leave/all?status=PENDING');
    });

    it('should handle error', async () => {
      const mockError = {
        response: {
          data: {
            error: 'FORBIDDEN',
          },
        },
      };

      apiClient.get.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.getAllLeaveRequests({});
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('FORBIDDEN');
    });
  });

  describe('getEmployeeSaldi', () => {
    it('should fetch employee saldi', async () => {
      const mockResponse = {
        data: {
          data: {
            'emp-001': { FERIE_1: 15, FERIE_2: 10, FERIE_3: 5, MALATTIA: 10 },
            'emp-002': { FERIE_1: 20, FERIE_2: 15, FERIE_3: 10, MALATTIA: 12 },
          },
        },
      };

      apiClient.get.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeave());

      let saldi;
      await act(async () => {
        saldi = await result.current.getEmployeeSaldi();
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/leave/admin/saldi');
      expect(Object.keys(saldi)).toHaveLength(2);
      expect(saldi['emp-001'].FERIE_1).toBe(15);
      expect(result.current.loading).toBe(false);
    });

    it('should handle empty saldi', async () => {
      apiClient.get.mockResolvedValue({ data: { data: {} } });

      const { result } = renderHook(() => useLeave());

      let saldi;
      await act(async () => {
        saldi = await result.current.getEmployeeSaldi();
      });

      expect(saldi).toEqual({});
    });

    it('should handle error', async () => {
      const mockError = {
        response: {
          data: {
            error: 'SERVER_ERROR',
          },
        },
      };

      apiClient.get.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.getEmployeeSaldi();
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('SERVER_ERROR');
    });
  });

  describe('getMyBalance', () => {
    it('should fetch the caller\'s own leave balance', async () => {
      const mockResponse = {
        data: {
          data: [
            { leave_type: 'FERIE_1', year: 2026, total_days: 20, used_days: 5, remaining_days: 15 },
            { leave_type: 'FERIE_2', year: 2026, total_days: 10, used_days: 0, remaining_days: 10 },
          ],
        },
      };

      apiClient.get.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeave());

      let balance;
      await act(async () => {
        balance = await result.current.getMyBalance();
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/leave/balance');
      expect(balance).toHaveLength(2);
      expect(balance[0].remaining_days).toBe(15);
      expect(result.current.loading).toBe(false);
    });

    it('should handle empty balance', async () => {
      apiClient.get.mockResolvedValue({ data: { data: [] } });

      const { result } = renderHook(() => useLeave());

      let balance;
      await act(async () => {
        balance = await result.current.getMyBalance();
      });

      expect(balance).toEqual([]);
    });

    it('should handle error', async () => {
      const mockError = {
        response: {
          data: {
            error: 'SERVER_ERROR',
          },
        },
      };

      apiClient.get.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.getMyBalance();
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('SERVER_ERROR');
    });
  });

  describe('getApprovedRequests', () => {
    it('should fetch approved leave requests', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'req-001',
              employee_id: 'emp-001',
              employee_name: 'Maria Rossi',
              leave_type: 'FERIE_1',
              start_date: '2026-07-01',
              end_date: '2026-07-05',
              status: 'APPROVED',
              approved_at: '2026-06-13T10:00:00Z',
            },
          ],
        },
      };

      apiClient.get.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeave());

      let requests;
      await act(async () => {
        requests = await result.current.getApprovedRequests();
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/leave/approved');
      expect(requests).toHaveLength(1);
      expect(requests[0].status).toBe('APPROVED');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should handle empty approved requests', async () => {
      apiClient.get.mockResolvedValue({ data: { data: [] } });

      const { result } = renderHook(() => useLeave());

      let requests;
      await act(async () => {
        requests = await result.current.getApprovedRequests();
      });

      expect(requests).toHaveLength(0);
    });

    it('should handle error', async () => {
      const mockError = {
        response: {
          data: {
            error: 'FORBIDDEN',
          },
        },
      };

      apiClient.get.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLeave());

      await act(async () => {
        try {
          await result.current.getApprovedRequests();
        } catch (err) {
          // expected
        }
      });

      expect(result.current.error).toBe('FORBIDDEN');
    });
  });
});
