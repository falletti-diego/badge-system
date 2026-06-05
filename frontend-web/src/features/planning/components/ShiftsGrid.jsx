import React, { useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  Box,
  CircularProgress,
  Alert
} from '@mui/material';
import { ShiftCell } from './ShiftCell';

const getDaysInMonth = (month, year) => {
  return new Date(year, month, 0).getDate();
};

const getDayOfWeek = (date) => {
  const days = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  return days[new Date(date).getDay()];
};

export const ShiftsGrid = ({
  shiftsData = {},
  employees = [],
  month,
  year,
  loading = false,
  error = null,
  onChange,
  cellLoading = {},
  cellErrors = {},
  readOnly = false
}) => {
  const daysInMonth = getDaysInMonth(month, year);
  const sortedEmployees = [...employees].sort((a, b) => a.name.localeCompare(b.name));

  const handleShiftChange = useCallback((employeeId, date, newShift) => {
    if (onChange) {
      onChange(employeeId, date, newShift);
    }
  }, [onChange]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const STICKY_SHADOW = '4px 0 6px -2px rgba(0,0,0,0.15)';

  return (
    <Paper sx={{ marginTop: '20px', overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ backgroundColor: '#F5F2ED', borderCollapse: 'separate', borderSpacing: 0 }}>
        <TableHead>
          <TableRow sx={{ backgroundColor: '#1E3A5F' }}>
            <TableCell
              sx={{
                color: '#FFFFFF',
                fontWeight: 'bold',
                minWidth: '160px',
                position: 'sticky',
                left: 0,
                backgroundColor: '#1E3A5F',
                zIndex: 3,
                boxShadow: STICKY_SHADOW
              }}
            >
              Dipendente
            </TableCell>
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = new Date(year, month - 1, day);
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayOfWeek = getDayOfWeek(dateStr);

              return (
                <TableCell
                  key={dateStr}
                  align="center"
                  sx={{
                    color: '#FFFFFF',
                    fontWeight: 'bold',
                    padding: '8px 4px',
                    minWidth: '60px',
                    fontSize: '0.75rem'
                  }}
                >
                  <div>{day}</div>
                  <div style={{ fontSize: '0.65rem' }}>{dayOfWeek}</div>
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>

        <TableBody>
          {sortedEmployees.map((employee, rowIdx) => {
            const rowBg = rowIdx % 2 === 0 ? '#FFFFFF' : '#FAFAF8';
            return (
            <TableRow key={employee.id} sx={{ '&:hover td': { backgroundColor: '#EEF2F7' } }}>
              <TableCell
                sx={{
                  fontWeight: '600',
                  fontSize: '0.82rem',
                  position: 'sticky',
                  left: 0,
                  backgroundColor: rowBg,
                  zIndex: 2,
                  boxShadow: STICKY_SHADOW,
                  whiteSpace: 'nowrap'
                }}
              >
                {employee.name}
              </TableCell>

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const shiftValue = shiftsData[employee.id]?.[dateStr] || '';
                const cellKey = `${employee.id}-${dateStr}`;

                return (
                  <TableCell
                    key={dateStr}
                    align="center"
                    sx={{
                      padding: '4px',
                      backgroundColor: '#FFFFFF'
                    }}
                  >
                    <ShiftCell
                      employeeId={employee.id}
                      date={dateStr}
                      value={shiftValue}
                      onChange={handleShiftChange}
                      loading={cellLoading[cellKey]}
                      error={cellErrors[cellKey]}
                      readOnly={readOnly}
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          );})}
        </TableBody>
      </Table>
      </Box>
    </Paper>
  );
};
