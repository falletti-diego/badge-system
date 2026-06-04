import { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * useShiftUpdate — Save shift planning to backend API
 * POST /api/shifts/:siteId with { month, year, shifts_data }
 * Tracks per-cell loading and error states for optimistic UI updates
 */
export const useShiftUpdate = (siteId, month, year) => {
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});

  /**
   * Save entire month's shifts
   * @param {Object} shiftsData - {employee_id: {date: shift}}
   * @returns {Promise<{success: boolean, id?: string, message?: string}>}
   */
  const saveShifts = async (shiftsData) => {
    if (!siteId || !month || !year) {
      throw new Error('Missing siteId, month, or year');
    }

    setLoading(prev => ({ ...prev, all: true }));
    setErrors(prev => ({ ...prev, all: null }));

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await axios.post(
        `${API_BASE_URL}/api/shifts/${siteId}`,
        {
          month,
          year,
          shifts_data: shiftsData,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`✅ Shifts saved to API (${Object.keys(shiftsData).length} employees):`, response.data.data);

      return {
        success: true,
        id: response.data.data.id,
        message: response.data.message || 'Shifts saved successfully',
      };

    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to save shifts';
      const statusCode = err.response?.status;

      console.error(`❌ Error saving shifts (${statusCode}):`, errorMsg);

      const error = {
        message: errorMsg,
        statusCode,
        isAuthError: statusCode === 401,
        isForbiddenError: statusCode === 403,
        isValidationError: statusCode === 400,
      };

      setErrors(prev => ({ ...prev, all: error }));

      throw error;

    } finally {
      setLoading(prev => ({ ...prev, all: false }));
    }
  };

  return { saveShifts, loading, errors };
};
