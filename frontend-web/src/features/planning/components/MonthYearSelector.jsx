import React from 'react';
import {
  Box,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Stack
} from '@mui/material';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

const MONTHS = [
  { value: 1, label: 'Gennaio' },
  { value: 2, label: 'Febbraio' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Aprile' },
  { value: 5, label: 'Maggio' },
  { value: 6, label: 'Giugno' },
  { value: 7, label: 'Luglio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Settembre' },
  { value: 10, label: 'Ottobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Dicembre' }
];

export const MonthYearSelector = ({ month, year, onMonthChange, onYearChange }) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const handlePrevMonth = () => {
    if (month === 1) {
      onMonthChange(12);
      onYearChange(year - 1);
    } else {
      onMonthChange(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      onMonthChange(1);
      onYearChange(year + 1);
    } else {
      onMonthChange(month + 1);
    }
  };

  const monthLabel = MONTHS.find(m => m.value === month)?.label || 'Gennaio';

  return (
    <Box
      sx={{
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        padding: '16px',
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        marginBottom: '20px'
      }}
    >
      <Button
        onClick={handlePrevMonth}
        variant="outlined"
        startIcon={<NavigateBeforeIcon />}
        size="small"
      >
        Precedente
      </Button>

      <Stack direction="row" spacing={2} sx={{ flexGrow: 1, justifyContent: 'center' }}>
        <FormControl sx={{ minWidth: '150px' }}>
          <InputLabel>Mese</InputLabel>
          <Select
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
            label="Mese"
          >
            {MONTHS.map(m => (
              <MenuItem key={m.value} value={m.value}>
                {m.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: '120px' }}>
          <InputLabel>Anno</InputLabel>
          <Select
            value={year}
            onChange={(e) => onYearChange(e.target.value)}
            label="Anno"
          >
            {years.map(y => (
              <MenuItem key={y} value={y}>
                {y}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Button
        onClick={handleNextMonth}
        variant="outlined"
        endIcon={<NavigateNextIcon />}
        size="small"
      >
        Prossimo
      </Button>
    </Box>
  );
};
