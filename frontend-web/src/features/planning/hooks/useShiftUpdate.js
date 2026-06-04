import { useState } from 'react';

/**
 * PHASE 2: Hook ready for backend API integration
 * Currently unused (PlanningPage uses direct handleSaveShifts).
 * When POST /api/shifts/:siteId is implemented:
 *   1. Replace mock setTimeout with apiClient.post()
 *   2. Import useShiftUpdate in PlanningPage
 *   3. Use updateShift() in handleSaveShifts
 * This pattern will enable per-cell error tracking and loading states.
 */
export const useShiftUpdate = (siteId, month, year) => {
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});

  const updateShift = async (employeeId, date, shiftValue) => {
    const key = `${employeeId}-${date}`;
    setLoading(prev => ({ ...prev, [key]: true }));

    // TODO: Replace with apiClient.post when backend ready
    // const response = await apiClient.post(`/api/shifts/${siteId}`, {...});

    // MOCK: Simulate API delay and success
    return new Promise(resolve => {
      setTimeout(() => {
        setLoading(prev => ({ ...prev, [key]: false }));
        setErrors(prev => ({ ...prev, [key]: null }));
        console.log(`✅ Mock save: ${employeeId} on ${date} = ${shiftValue}`);
        resolve(true);
      }, 500);
    });
  };

  return { updateShift, loading, errors };
};
