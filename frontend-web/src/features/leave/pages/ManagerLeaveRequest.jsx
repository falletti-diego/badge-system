import React, { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Snackbar,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Pagination,
  Stack,
  CircularProgress,
} from '@mui/material';
import { LeaveCalendar } from '../components/LeaveCalendar';
import { useLeave } from '../hooks/useLeave';

const LEAVE_TYPES = [
  { value: 'FERIE_1', label: 'Ferie 1' },
  { value: 'FERIE_2', label: 'Ferie 2' },
  { value: 'FERIE_3', label: 'Ferie 3' },
  { value: 'MALATTIA', label: 'Malattia' },
];

const STATUS_COLORS = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  WITHDRAWN: 'default',
};

const ITEMS_PER_PAGE = 10;

export const ManagerLeaveRequest = () => {
  const { createRequest, getMyRequests, loading, error, clearError, resetForm } = useLeave();

  const [formData, setFormData] = useState({
    leave_type: '',
    startDate: null,
    endDate: null,
    motivation: '',
  });

  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('date_desc');

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const data = await getMyRequests();
      setRequests(data || []);
    } catch (err) {
      setRequestsError(err.message || 'Failed to load requests');
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleLeaveTypeChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      leave_type: e.target.value,
    }));
  };

  const handleCalendarChange = ({ startDate, endDate }) => {
    setFormData((prev) => ({
      ...prev,
      startDate,
      endDate,
    }));
  };

  const handleMotivationChange = (e) => {
    const value = e.target.value;
    if (value.length <= 500) {
      setFormData((prev) => ({
        ...prev,
        motivation: value,
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.leave_type || !formData.startDate || !formData.endDate) {
      return;
    }

    try {
      await createRequest(
        formData.leave_type,
        formData.startDate,
        formData.endDate,
        formData.motivation
      );

      setSuccessMessage('Richiesta di ferie inviata con successo!');
      setFormData({
        leave_type: '',
        startDate: null,
        endDate: null,
        motivation: '',
      });

      setTimeout(() => {
        loadRequests();
      }, 500);
    } catch (err) {
      // Error is handled by useLeave hook and shown in snackbar
    }
  };

  const handleCancel = () => {
    setFormData({
      leave_type: '',
      startDate: null,
      endDate: null,
      motivation: '',
    });
    clearError();
  };

  const handleCloseSnackbar = () => {
    clearError();
    setSuccessMessage(null);
  };

  const handlePageChange = (event, value) => {
    setCurrentPage(value);
  };

  const sortedRequests = useMemo(() => {
    const sorted = [...requests];

    if (sortBy === 'date_desc') {
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === 'date_asc') {
      sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortBy === 'status') {
      sorted.sort((a, b) => a.status.localeCompare(b.status));
    }

    return sorted;
  }, [requests, sortBy]);

  const paginatedRequests = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedRequests.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [sortedRequests, currentPage]);

  const totalPages = Math.ceil(sortedRequests.length / ITEMS_PER_PAGE);

  const isFormValid = formData.leave_type && formData.startDate && formData.endDate;

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4, px: 2 }}>
        {/* Header */}
        <Typography variant="h2" sx={{ mb: 1 }}>
          Richiedi Ferie - Manager
        </Typography>
        <Typography variant="body1" sx={{ color: '#6B625A', mb: 4 }}>
          Gestisci le tue richieste di ferie e malattia
        </Typography>

        {/* Form Card */}
        <Card sx={{ mb: 6, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' }}>
          <CardContent sx={{ p: 3 }}>
            <form onSubmit={handleSubmit}>
              <Stack spacing={3}>
                {/* Leave Type Dropdown */}
                <FormControl fullWidth>
                  <InputLabel>Tipo di Feria</InputLabel>
                  <Select
                    value={formData.leave_type}
                    onChange={handleLeaveTypeChange}
                    label="Tipo di Feria"
                  >
                    {LEAVE_TYPES.map((type) => (
                      <MenuItem key={type.value} value={type.value}>
                        {type.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Calendar */}
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                    Seleziona Date
                  </Typography>
                  <LeaveCalendar
                    startDate={formData.startDate}
                    endDate={formData.endDate}
                    onDateChange={handleCalendarChange}
                  />
                </Box>

                {/* Motivation */}
                <TextField
                  label="Note (opzionale)"
                  multiline
                  rows={4}
                  value={formData.motivation}
                  onChange={handleMotivationChange}
                  placeholder="Aggiungi una nota per la tua richiesta..."
                  helperText={`${formData.motivation.length}/500`}
                  fullWidth
                />

                {/* Action Buttons */}
                <Stack direction="row" spacing={2} justifyContent="flex-start">
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSubmit}
                    disabled={!isFormValid || loading}
                    sx={{
                      backgroundColor: '#2D7049',
                      '&:hover': {
                        backgroundColor: '#215a37',
                      },
                      '&:disabled': {
                        backgroundColor: '#ccc',
                      },
                    }}
                  >
                    {loading ? <CircularProgress size={24} /> : 'Richiedi'}
                  </Button>
                  <Button
                    variant="outlined"
                    color="inherit"
                    onClick={handleCancel}
                    disabled={loading}
                  >
                    Annulla
                  </Button>
                </Stack>
              </Stack>
            </form>
          </CardContent>
        </Card>

        {/* Requests History Section */}
        <Box sx={{ mt: 6 }}>
          <Typography variant="h3" sx={{ mb: 3, fontWeight: 600 }}>
            Le Tue Richieste di Ferie
          </Typography>

          {requestsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : requestsError ? (
            <Alert severity="error">{requestsError}</Alert>
          ) : requests.length === 0 ? (
            <Alert severity="info">Non hai ancora inoltrato richieste di ferie</Alert>
          ) : (
            <Box>
              {/* Sorting Control */}
              <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>Ordina per</InputLabel>
                  <Select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setCurrentPage(1);
                    }}
                    label="Ordina per"
                  >
                    <MenuItem value="date_desc">Data più recente</MenuItem>
                    <MenuItem value="date_asc">Data più antica</MenuItem>
                    <MenuItem value="status">Status</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              {/* Requests Table */}
              <Paper sx={{ overflowX: 'auto' }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#F5F2ED' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Tipo Feria</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Data Inizio</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Data Fine</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        Giorni
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Data Richiesta</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedRequests.map((req) => {
                      const leaveType = LEAVE_TYPES.find((t) => t.value === req.leave_type);
                      const startDate = new Date(req.start_date);
                      const endDate = new Date(req.end_date);
                      const numDays =
                        Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
                      const createdDate = new Date(req.created_at);

                      return (
                        <TableRow key={req.id} hover>
                          <TableCell>{leaveType?.label || req.leave_type}</TableCell>
                          <TableCell>{startDate.toLocaleDateString('it-IT')}</TableCell>
                          <TableCell>{endDate.toLocaleDateString('it-IT')}</TableCell>
                          <TableCell align="center">{numDays}</TableCell>
                          <TableCell>
                            <Chip
                              label={req.status}
                              size="small"
                              color={STATUS_COLORS[req.status]}
                              variant="filled"
                            />
                          </TableCell>
                          <TableCell>{createdDate.toLocaleDateString('it-IT')}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Paper>

              {/* Pagination */}
              {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                  <Pagination
                    count={totalPages}
                    page={currentPage}
                    onChange={handlePageChange}
                    color="primary"
                  />
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* Snackbars */}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Container>
  );
};
