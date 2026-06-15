import { useState, useEffect, useRef } from 'react';
import apiClient from '../../../services/apiClient';

export function useFetch(url) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const load = async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(url, { signal: abortRef.current.signal });
      setData(res.data.data || []);
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
        setError(err.response?.data?.message || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, reload: load };
}
