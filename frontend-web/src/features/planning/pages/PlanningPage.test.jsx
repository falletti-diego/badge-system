import { describe, it, expect } from 'vitest';

describe('PlanningPage Leave Blocking Logic', () => {
  describe('isDateBlocked helper', () => {
    const isDateBlocked = (employeeId, dateStr, approvedLeaves) => {
      return approvedLeaves.some(leave => {
        if (leave.user_id !== employeeId) return false;
        const startDate = new Date(leave.start_date);
        const endDate = new Date(leave.end_date);
        const checkDate = new Date(dateStr);
        return checkDate >= startDate && checkDate <= endDate;
      });
    };

    it('should block dates within approved leave range', () => {
      const approvedLeaves = [
        {
          user_id: 'emp-001',
          start_date: '2026-06-15',
          end_date: '2026-06-20',
          leave_type: 'FERIE_1',
        },
      ];

      expect(isDateBlocked('emp-001', '2026-06-15', approvedLeaves)).toBe(true);
      expect(isDateBlocked('emp-001', '2026-06-17', approvedLeaves)).toBe(true);
      expect(isDateBlocked('emp-001', '2026-06-20', approvedLeaves)).toBe(true);
    });

    it('should not block dates outside approved leave range', () => {
      const approvedLeaves = [
        {
          user_id: 'emp-001',
          start_date: '2026-06-15',
          end_date: '2026-06-20',
        },
      ];

      expect(isDateBlocked('emp-001', '2026-06-14', approvedLeaves)).toBe(false);
      expect(isDateBlocked('emp-001', '2026-06-21', approvedLeaves)).toBe(false);
      expect(isDateBlocked('emp-001', '2026-06-01', approvedLeaves)).toBe(false);
    });

    it('should not block other employees dates', () => {
      const approvedLeaves = [
        {
          user_id: 'emp-001',
          start_date: '2026-06-15',
          end_date: '2026-06-20',
        },
      ];

      expect(isDateBlocked('emp-002', '2026-06-15', approvedLeaves)).toBe(false);
      expect(isDateBlocked('emp-002', '2026-06-17', approvedLeaves)).toBe(false);
    });

    it('should handle multiple leave requests', () => {
      const approvedLeaves = [
        {
          user_id: 'emp-001',
          start_date: '2026-06-15',
          end_date: '2026-06-20',
        },
        {
          user_id: 'emp-001',
          start_date: '2026-07-01',
          end_date: '2026-07-05',
        },
      ];

      expect(isDateBlocked('emp-001', '2026-06-17', approvedLeaves)).toBe(true);
      expect(isDateBlocked('emp-001', '2026-07-03', approvedLeaves)).toBe(true);
      expect(isDateBlocked('emp-001', '2026-06-25', approvedLeaves)).toBe(false);
    });

    it('should handle single-day leave requests', () => {
      const approvedLeaves = [
        {
          user_id: 'emp-001',
          start_date: '2026-06-15',
          end_date: '2026-06-15',
        },
      ];

      expect(isDateBlocked('emp-001', '2026-06-15', approvedLeaves)).toBe(true);
      expect(isDateBlocked('emp-001', '2026-06-14', approvedLeaves)).toBe(false);
      expect(isDateBlocked('emp-001', '2026-06-16', approvedLeaves)).toBe(false);
    });

    it('should handle empty leave list', () => {
      const approvedLeaves = [];

      expect(isDateBlocked('emp-001', '2026-06-15', approvedLeaves)).toBe(false);
      expect(isDateBlocked('emp-001', '2026-06-17', approvedLeaves)).toBe(false);
    });
  });
});
