/**
 * Export Button Component
 * Triggers CSV download of presences data
 * Supports format selection: generic, zucchetti, teamsystem
 */

import React, { useState } from 'react';
import { Button, CircularProgress, FormControl, Select, MenuItem, InputLabel, Box } from '@mui/material';
import apiClient from '../../../services/apiClient';
import authService from '../../../services/authService';

const FORMAT_OPTIONS = [
  { value: 'generic', label: 'Generico' },
  { value: 'zucchetti', label: 'Zucchetti' },
  { value: 'teamsystem', label: 'TeamSystem' },
];

const ExportButton = ({ filters = {} }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const userRole = authService.getUserRole();

  // Viewer sees only payroll formats; others default to generic
  const defaultFormat = userRole === 'viewer' ? 'zucchetti' : 'generic';
  const [format, setFormat] = useState(defaultFormat);

  const visibleFormats = userRole === 'viewer'
    ? FORMAT_OPTIONS.filter(f => f.value !== 'generic')
    : FORMAT_OPTIONS;

  const handleExport = async () => {
    try {
      setLoading(true);
      setError('');

      const { limit, offset, ...exportFilters } = filters;

      const response = await apiClient.get('/api/v1/export/csv', {
        params: { ...exportFilters, format },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      const contentDisposition = response.headers['content-disposition'];
      const filename =
        contentDisposition?.split('filename="')[1]?.split('"')[0] ||
        `presenze_${new Date().toISOString().split('T')[0]}.csv`;

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Errore durante l\'esportazione');
      console.error('Error exporting CSV:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel>Formato</InputLabel>
        <Select
          label="Formato"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          disabled={loading}
        >
          {visibleFormats.map((f) => (
            <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

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
            <CircularProgress size={18} sx={{ mr: 1, color: 'white' }} />
            Esportazione…
          </>
        ) : (
          '📥 Esporta CSV'
        )}
      </Button>

      {error && <Box component="span" sx={{ color: 'error.main', fontSize: '0.8rem' }}>{error}</Box>}
    </Box>
  );
};

export default ExportButton;
