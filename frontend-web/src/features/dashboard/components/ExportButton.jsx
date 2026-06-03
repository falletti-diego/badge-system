/**
 * Export Button Component
 * Triggers CSV download of presences data
 */

import React, { useState } from 'react';
import { Button, CircularProgress } from '@mui/material';
import apiClient from '../../../services/apiClient';

const ExportButton = ({ filters = {} }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await apiClient.get('/api/export/csv', {
        params: filters,
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      // Extract filename from response headers or use default
      const contentDisposition = response.headers['content-disposition'];
      const filename =
        contentDisposition
          ?.split('filename="')[1]
          ?.split('"')[0] || `presenze_${new Date().toISOString().split('T')[0]}.csv`;

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to export CSV');
      console.error('Error exporting CSV:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="contained"
        onClick={handleExport}
        disabled={loading}
        sx={{
          backgroundColor: '#2D7049',
          '&:hover': { backgroundColor: '#1a4a2f' },
          '&:disabled': { backgroundColor: '#ccc' },
        }}
      >
        {loading ? (
          <>
            <CircularProgress size={20} sx={{ marginRight: '8px', color: 'white' }} />
            Exporting...
          </>
        ) : (
          '📥 Export to CSV'
        )}
      </Button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
};

export default ExportButton;
