import { useState } from 'react';
import apiClient from '../../../services/apiClient';

export const useCheckinCorrection = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const correctCheckin = async (checkinId, { type, timestamp, correction_note }) => {
    setLoading(true);
    setError(null);
    try {
      const body = {};
      if (type !== undefined) body.type = type;
      if (timestamp !== undefined) body.timestamp = timestamp;
      if (correction_note !== undefined) body.correction_note = correction_note;

      const response = await apiClient.put(`/api/checkins/${checkinId}`, body);
      return response.data.data;
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Errore nel salvataggio';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  return { correctCheckin, loading, error };
};
