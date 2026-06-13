import React, { useState, useMemo } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Stack,
} from '@mui/material';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export const LeaveCalendar = ({ startDate, endDate, onDateChange }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const dateToString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const stringToDate = (dateStr) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const handleDateClick = (day) => {
    const clickedDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const clickedDate = stringToDate(clickedDateStr);

    if (clickedDate < today) {
      return;
    }

    if (!startDate) {
      onDateChange({ startDate: clickedDateStr, endDate: null });
    } else if (!endDate) {
      const start = stringToDate(startDate);
      if (clickedDate.getTime() === start.getTime()) {
        onDateChange({ startDate: null, endDate: null });
      } else if (clickedDate > start) {
        onDateChange({ startDate, endDate: clickedDateStr });
      } else {
        onDateChange({ startDate: clickedDateStr, endDate: startDate });
      }
    } else {
      const start = stringToDate(startDate);
      if (clickedDate.getTime() === start.getTime()) {
        onDateChange({ startDate: null, endDate: null });
      } else {
        onDateChange({ startDate: clickedDateStr, endDate: null });
      }
    }
  };

  const getDaysInMonth = (month, year) => {
    return new Date(year, month, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    return firstDay === 0 ? 7 : firstDay;
  };

  const isDateInRange = (dateStr) => {
    if (!startDate || !endDate) return false;
    const date = stringToDate(dateStr);
    const start = stringToDate(startDate);
    const end = stringToDate(endDate);
    return date >= start && date <= end;
  };

  const isDateSelected = (dateStr) => {
    return dateStr === startDate || dateStr === endDate;
  };

  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const days = [];

    for (let i = 1; i < firstDay; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  }, [currentMonth, currentYear]);

  const monthLabel = MONTHS[currentMonth - 1];

  return (
    <Box
      sx={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      }}
    >
      <Stack spacing={3}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Button
            onClick={handlePrevMonth}
            variant="outlined"
            startIcon={<NavigateBeforeIcon />}
            size="small"
          >
            Precedente
          </Button>

          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {monthLabel} {currentYear}
          </Typography>

          <Button
            onClick={handleNextMonth}
            variant="outlined"
            endIcon={<NavigateNextIcon />}
            size="small"
          >
            Prossimo
          </Button>
        </Stack>

        <Table
          sx={{
            '& td': { padding: '8px', textAlign: 'center', border: 'none' },
            '& th': { padding: '8px', textAlign: 'center', border: 'none' },
          }}
        >
          <TableHead>
            <TableRow>
              {DAYS.map((day) => (
                <TableCell key={day} sx={{ fontWeight: 600, color: '#666' }}>
                  {day}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map(
              (_, weekIdx) => (
                <TableRow key={weekIdx}>
                  {calendarDays.slice(weekIdx * 7, (weekIdx + 1) * 7).map(
                    (day, dayIdx) => {
                      const dateStr = day
                        ? `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                        : null;
                      const dayDate = dateStr ? stringToDate(dateStr) : null;
                      const isPastDate = dayDate && dayDate < today;
                      const isRangeDay = dateStr && isDateInRange(dateStr);
                      const isSelectedDay = dateStr && isDateSelected(dateStr);

                      return (
                        <TableCell key={dayIdx}>
                          {day ? (
                            <Button
                              data-testid={`day-${day}`}
                              onClick={() => handleDateClick(day)}
                              disabled={isPastDate}
                              data-selected={isSelectedDay || isRangeDay}
                              sx={{
                                width: '32px',
                                height: '32px',
                                minWidth: '32px',
                                padding: 0,
                                backgroundColor: isSelectedDay
                                  ? '#1E3A5F'
                                  : isRangeDay
                                    ? '#3b82f6'
                                    : 'transparent',
                                color: isSelectedDay ? '#FFF' : isRangeDay ? '#FFF' : '#000',
                                borderRadius: isSelectedDay ? '50%' : '4px',
                                border: isRangeDay ? '2px solid #2563eb' : isSelectedDay ? '2px solid #1E3A5F' : 'none',
                                fontWeight: isRangeDay ? 600 : 'normal',
                                '&:hover': {
                                  backgroundColor: isPastDate
                                    ? 'transparent'
                                    : isSelectedDay
                                      ? '#1a2f4a'
                                      : isRangeDay
                                        ? '#2563eb'
                                        : '#F5F5F5',
                                },
                                '&:disabled': {
                                  color: '#CCC',
                                  cursor: 'not-allowed',
                                },
                              }}
                            >
                              {day}
                            </Button>
                          ) : null}
                        </TableCell>
                      );
                    }
                  )}
                </TableRow>
              )
            )}
          </TableBody>
        </Table>

        {startDate && endDate && (
          <Box sx={{ textAlign: 'center', color: '#666', fontSize: '14px' }}>
            <Typography variant="body2">
              {new Date(startDate).toLocaleDateString('it-IT')} -{' '}
              {new Date(endDate).toLocaleDateString('it-IT')}
            </Typography>
            <Typography variant="caption" sx={{ color: '#999' }}>
              {Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1} giorni
            </Typography>
          </Box>
        )}
      </Stack>
    </Box>
  );
};
