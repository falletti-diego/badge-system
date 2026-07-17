import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { LeaveCalendar } from '../components/LeaveCalendar';
import { useLeave } from '../hooks/useLeave';

const LEAVE_TYPES = [
  { value: 'FERIE_1', label: 'Ferie 1' },
  { value: 'FERIE_2', label: 'Ferie 2' },
  { value: 'FERIE_3', label: 'Ferie 3' },
  { value: 'MALATTIA', label: 'Malattia' }, // kept for history display only — not shown in form dropdown
];

// Only the 3 ferie types consume a balance — MALATTIA is excluded here for the
// same reason it's excluded from the form dropdown above.
const BALANCE_TYPES = LEAVE_TYPES.filter((t) => t.value !== 'MALATTIA');

const STATUS_COLORS = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  WITHDRAWN: 'default',
};

const ITEMS_PER_PAGE = 10;

export const EmployeeLeaveRequest = () => {
  const navigate = useNavigate();
  const { createRequest, getMyRequests, getMyBalance, loading, error, clearError, resetForm } = useLeave();

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
  const [balance, setBalance] = useState([]);

  useEffect(() => {
    loadRequests();
    loadBalance();
  }, []);

  const loadBalance = async () => {
    try {
      const data = await getMyBalance();
      setBalance(data || []);
    } catch (err) {
      // Non-critical: the form still works without the balance chips.
    }
  };

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
      // Convert Date objects to YYYY-MM-DD format
      const formatDate = (date) => {
        if (!date) return null;
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      await createRequest(
        formData.leave_type,
        formatDate(formData.startDate),
        formatDate(formData.endDate),
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
          <Box>
            <Typography variant="h2" sx={{ mb: 1 }}>
              Richiedi Ferie
            </Typography>
            <Typography variant="body1" sx={{ color: '#6B625A' }}>
              Gestisci le tue richieste di ferie
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/dashboard')}
            disabled={loading}
            sx={{
              borderColor: '#374151',
              color: '#374151',
              fontWeight: 600,
              mt: 0.5,
              '&:hover': {
                borderColor: '#111827',
                backgroundColor: 'rgba(55, 65, 81, 0.04)',
                color: '#111827',
              },
            }}
          >
            Dashboard
          </Button>
        </Box>

        {/* Form Card */}
        <Card sx={{ mb: 6, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' }}>
          <CardContent sx={{ p: 3 }}>
            <form onSubmit={handleSubmit}>
              <Stack spacing={3}>
                {/* Saldo ferie residuo per tipologia */}
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap data-testid="leave-balance-chips">
                  {BALANCE_TYPES.map((type) => {
                    const row = balance.find((b) => b.leave_type === type.value);
                    const remaining = row ? row.remaining_days : 0;
                    return (
                      <Chip
                        key={type.value}
                        label={`${type.label}: ${remaining} gg disponibili`}
                        variant="outlined"
                        sx={{ borderColor: '#374151', color: '#374151', fontWeight: 500 }}
                      />
                    );
                  })}
                </Stack>

                {/* Leave Type Row: Dropdown (left) + Malattia redirect (right) */}
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                  {/* Ferie Dropdown */}
                  <FormControl sx={{ flex: 1 }}>
                    <InputLabel>Tipo Feria</InputLabel>
                    <Select
                      value={formData.leave_type}
                      onChange={handleLeaveTypeChange}
                      label="Tipo Feria"
                    >
                      {LEAVE_TYPES.filter((t) => t.value !== 'MALATTIA').map((type) => (
                        <MenuItem key={type.value} value={type.value}>
                          {type.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Malattia → dedicated page */}
                  <Button
                    variant="outlined"
                    onClick={() => navigate('/illnesses/report')}
                    sx={{
                      minWidth: 180,
                      borderColor: '#DC2626',
                      color: '#DC2626',
                      '&:hover': {
                        borderColor: '#991b1b',
                        backgroundColor: 'rgba(220, 38, 38, 0.04)',
                        color: '#991b1b',
                      },
                    }}
                  >
                    🏥 Comunica Malattia
                  </Button>
                </Box>

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
            Le Tue Richieste
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
