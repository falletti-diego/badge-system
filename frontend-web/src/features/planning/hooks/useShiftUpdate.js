import { useState } from 'react';
import apiClient from '../../../services/apiClient';

export const useShiftUpdate = (siteId, month, year) => {
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});

  const updateShift = async (employeeId, date, shiftValue) => {
    const key = `${employeeId}-${date}`;
    setLoading(prev => ({ ...prev, [key]: true }));

    try {
      await apiClient.post(`/api/shifts/${siteId}`, {
        month,
        year,
        shifts_data: {
          [employeeId]: {
            [date]: shiftValue
          }
        }
      });
      setErrors(prev => ({ ...prev, [key]: null }));
      return true;
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Save failed';
      setErrors(prev => ({ ...prev, [key]: errMsg }));
      return false;
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  return { updateShift, loading, errors };
};
