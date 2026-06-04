import React, { useState } from 'react';
import {
  Select,
  MenuItem,
  CircularProgress,
  Box,
  Tooltip,
  FormControl
} from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';

const SHIFT_OPTIONS = [
  { value: 'm', label: 'Mattino', icon: '🌅', color: '#1E3A5F' },
  { value: 'p', label: 'Pomeriggio', icon: '☀️', color: '#B45309' },
  { value: 's', label: 'Sera', icon: '🌙', color: '#7C3AED' },
  { value: 'R', label: 'Riposo', icon: '❌', color: '#6B7280' }
];

export const ShiftCell = ({
  employeeId,
  date,
  value,
  onChange,
  loading = false,
  error = null,
  readOnly = false
}) => {
  const shiftOption = SHIFT_OPTIONS.find(opt => opt.value === value);
  const cellKey = `${employeeId}-${date}`;

  if (readOnly) {
    return (
      <Box
        sx={{
          padding: '8px',
          textAlign: 'center',
          backgroundColor: shiftOption?.color || '#FFFFFF',
          color: '#FFFFFF',
          borderRadius: '4px',
          fontWeight: 'bold',
          minHeight: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {shiftOption?.icon} {shiftOption?.label}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '44px'
      }}
    >
      {loading ? (
        <CircularProgress size={24} />
      ) : error ? (
        <Tooltip title={error}>
          <ErrorIcon sx={{ color: '#C0392B', fontSize: '20px' }} />
        </Tooltip>
      ) : (
        <FormControl fullWidth size="small" variant="outlined">
          <Select
            key={cellKey}
            value={value || ''}
            onChange={(e) => onChange(employeeId, date, e.target.value)}
            sx={{
              backgroundColor: shiftOption?.color || '#FFFFFF',
              color: '#FFFFFF',
              fontWeight: 'bold',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: shiftOption?.color || '#CCCCCC'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: shiftOption?.color || '#999999'
              },
              '& .MuiSvgIcon-root': {
                color: '#FFFFFF'
              }
            }}
          >
            <MenuItem value="">-</MenuItem>
            {SHIFT_OPTIONS.map(opt => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.icon} {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    </Box>
  );
};
