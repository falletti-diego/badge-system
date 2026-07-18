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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Divider,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TableContainer,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLeave } from '../hooks/useLeave';

const LEAVE_TYPE_LABELS = {
  FERIE_1: 'Ferie 1',
  FERIE_2: 'Ferie 2',
  FERIE_3: 'Ferie 3',
  MALATTIA: 'Malattia',
};

const STATUS_LABELS = {
  PENDING: 'Sospeso',
  APPROVED: 'Approvato',
  REJECTED: 'Rifiutato',
};

const STATUS_COLORS = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
};

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`leave-tabpanel-${index}`}
      aria-labelledby={`leave-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export const AdminLeaveManagement = () => {
  const navigate = useNavigate();
  const { getAllLeaveRequests, getEmployeeSaldi, approveRequest, rejectRequest, loading, error, clearError } =
    useLeave();

  const [tabValue, setTabValue] = useState(0);
  const [allRequests, setAllRequests] = useState([]);
  const [saldi, setSaldi] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoadingData(true);
    clearError();
    try {
      const [requestsData, saldiData] = await Promise.all([
        getAllLeaveRequests({}),
        getEmployeeSaldi(),
      ]);
      setAllRequests(requestsData || []);
      setSaldi(saldiData || {});
    } finally {
      setLoadingData(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleApprove = async (requestId) => {
    setActionInProgress(requestId);
    try {
      await approveRequest(requestId);
      setSuccessMessage('Richiesta approvata con successo');
      await loadData();
    } catch (err) {
      // Error is shown in snackbar
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectClick = (request) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!selectedRequest) return;

    setActionInProgress(selectedRequest.id);
    try {
      await rejectRequest(selectedRequest.id, rejectionReason);
      setSuccessMessage('Richiesta rifiutata');
      setRejectDialogOpen(false);
      setSelectedRequest(null);
      setRejectionReason('');
      await loadData();
    } catch (err) {
      // Error is shown in snackbar
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCloseRejectDialog = () => {
    setRejectDialogOpen(false);
    setSelectedRequest(null);
    setRejectionReason('');
  };

  const handleCloseSuccess = () => {
    setSuccessMessage(null);
  };

  const calculateDays = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  };

  const filteredByTab = useMemo(() => {
    if (tabValue === 0) return allRequests.filter((r) => r.status === 'PENDING');
    if (tabValue === 1) return allRequests.filter((r) => r.status === 'APPROVED');
    if (tabValue === 2) return allRequests.filter((r) => r.status === 'REJECTED');
    return allRequests;
  }, [allRequests, tabValue]);

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4, px: 2 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
          <Box>
            <Typography variant="h2" sx={{ mb: 1 }}>
              Gestione Ferie
            </Typography>
            <Typography variant="body1" sx={{ color: '#6B625A' }}>
              Gestisci richieste di ferie, saldi dipendenti e storico approvazioni
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/dashboard')}
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

        {/* Error Alert */}
        {error && (
          <Alert severity="error" onClose={clearError} sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Success Message */}
        {successMessage && (
          <Alert severity="success" onClose={handleCloseSuccess} sx={{ mb: 3 }}>
            {successMessage}
          </Alert>
        )}

        {/* Tabs */}
        <Paper sx={{ mb: 3, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="leave management tabs"
            sx={{ backgroundColor: '#F5F2ED' }}
          >
            <Tab label="In Sospeso" id="leave-tab-0" aria-controls="leave-tabpanel-0" />
            <Tab label="Approvate" id="leave-tab-1" aria-controls="leave-tabpanel-1" />
            <Tab label="Rifiutate" id="leave-tab-2" aria-controls="leave-tabpanel-2" />
            <Tab label="Storico" id="leave-tab-3" aria-controls="leave-tabpanel-3" />
            <Tab label="Saldi" id="leave-tab-4" aria-controls="leave-tabpanel-4" />
          </Tabs>
        </Paper>

        {/* Pending Requests Tab */}
        <TabPanel value={tabValue} index={0}>
          {loadingData ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : filteredByTab.length === 0 ? (
            <Alert severity="success">Nessuna richiesta in sospeso</Alert>
          ) : (
            <Stack spacing={2}>
              {filteredByTab.map((request) => {
                const numDays = calculateDays(request.start_date, request.end_date);
                const startDate = new Date(request.start_date);
                const endDate = new Date(request.end_date);

                return (
                  <Paper
                    key={request.id}
                    sx={{
                      p: 2,
                      backgroundColor: '#F9F7F3',
                      border: '1px solid #E8DFD5',
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {request.employee_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#6B625A' }}>
                            {LEAVE_TYPE_LABELS[request.leave_type]} • {numDays}{' '}
                            {numDays === 1 ? 'giorno' : 'giorni'}
                          </Typography>
                        </Box>
                        <Chip
                          label={STATUS_LABELS[request.status]}
                          size="small"
                          color={STATUS_COLORS[request.status]}
                          variant="filled"
                        />
                      </Box>

                      <Box sx={{ display: 'flex', gap: 2, fontSize: '0.875rem' }}>
                        <Typography variant="caption">
                          <strong>Inizio:</strong> {startDate.toLocaleDateString('it-IT')}
                        </Typography>
                        <Typography variant="caption">
                          <strong>Fine:</strong> {endDate.toLocaleDateString('it-IT')}
                        </Typography>
                      </Box>

                      {request.motivation && (
                        <Box sx={{ backgroundColor: '#FFF', p: 1, borderRadius: 0.5 }}>
                          <Typography variant="caption" sx={{ color: '#6B625A' }}>
                            <strong>Nota:</strong> {request.motivation}
                          </Typography>
                        </Box>
                      )}

                      <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
                        <Button
                          variant="contained"
                          size="small"
                          sx={{
                            backgroundColor: '#2D7049',
                            '&:hover': { backgroundColor: '#215a37' },
                            '&:disabled': { backgroundColor: '#ccc' },
                          }}
                          onClick={() => handleApprove(request.id)}
                          disabled={actionInProgress === request.id || loading}
                        >
                          {actionInProgress === request.id ? (
                            <CircularProgress size={16} sx={{ color: 'white' }} />
                          ) : (
                            'Approva'
                          )}
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          onClick={() => handleRejectClick(request)}
                          disabled={actionInProgress === request.id || loading}
                        >
                          Rifiuta
                        </Button>
                      </Box>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </TabPanel>

        {/* Approved Requests Tab */}
        <TabPanel value={tabValue} index={1}>
          {loadingData ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : filteredByTab.length === 0 ? (
            <Alert severity="info">Nessuna richiesta approvata</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#F5F2ED' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Dipendente</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Tipo</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Inizio</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Fine</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Giorni
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Data Richiesta</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredByTab.map((request) => {
                    const numDays = calculateDays(request.start_date, request.end_date);
                    const startDate = new Date(request.start_date);
                    const endDate = new Date(request.end_date);
                    const createdDate = new Date(request.created_at);

                    return (
                      <TableRow key={request.id} hover>
                        <TableCell>{request.employee_name}</TableCell>
                        <TableCell>{LEAVE_TYPE_LABELS[request.leave_type]}</TableCell>
                        <TableCell>{startDate.toLocaleDateString('it-IT')}</TableCell>
                        <TableCell>{endDate.toLocaleDateString('it-IT')}</TableCell>
                        <TableCell align="center">{numDays}</TableCell>
                        <TableCell>{createdDate.toLocaleDateString('it-IT')}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        {/* Rejected Requests Tab */}
        <TabPanel value={tabValue} index={2}>
          {loadingData ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : filteredByTab.length === 0 ? (
            <Alert severity="info">Nessuna richiesta rifiutata</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#F5F2ED' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Dipendente</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Tipo</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Inizio</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Fine</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Giorni
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Data Richiesta</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredByTab.map((request) => {
                    const numDays = calculateDays(request.start_date, request.end_date);
                    const startDate = new Date(request.start_date);
                    const endDate = new Date(request.end_date);
                    const createdDate = new Date(request.created_at);

                    return (
                      <TableRow key={request.id} hover>
                        <TableCell>{request.employee_name}</TableCell>
                        <TableCell>{LEAVE_TYPE_LABELS[request.leave_type]}</TableCell>
                        <TableCell>{startDate.toLocaleDateString('it-IT')}</TableCell>
                        <TableCell>{endDate.toLocaleDateString('it-IT')}</TableCell>
                        <TableCell align="center">{numDays}</TableCell>
                        <TableCell>{createdDate.toLocaleDateString('it-IT')}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        {/* All History Tab */}
        <TabPanel value={tabValue} index={3}>
          {loadingData ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : allRequests.length === 0 ? (
            <Alert severity="info">Nessuna richiesta</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#F5F2ED' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Dipendente</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Tipo</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Inizio</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Fine</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Giorni
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Data Richiesta</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allRequests.map((request) => {
                    const numDays = calculateDays(request.start_date, request.end_date);
                    const startDate = new Date(request.start_date);
                    const endDate = new Date(request.end_date);
                    const createdDate = new Date(request.created_at);

                    return (
                      <TableRow key={request.id} hover>
                        <TableCell>{request.employee_name}</TableCell>
                        <TableCell>{LEAVE_TYPE_LABELS[request.leave_type]}</TableCell>
                        <TableCell>{startDate.toLocaleDateString('it-IT')}</TableCell>
                        <TableCell>{endDate.toLocaleDateString('it-IT')}</TableCell>
                        <TableCell align="center">{numDays}</TableCell>
                        <TableCell>
                          <Chip
                            label={STATUS_LABELS[request.status]}
                            size="small"
                            color={STATUS_COLORS[request.status]}
                            variant="filled"
                          />
                        </TableCell>
                        <TableCell>{createdDate.toLocaleDateString('it-IT')}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        {/* Saldi Tab */}
        <TabPanel value={tabValue} index={4}>
          {loadingData ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : Object.keys(saldi).length === 0 ? (
            <Alert severity="info">Nessun saldo disponibile</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#F5F2ED' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Dipendente</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Ferie 1
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Ferie 2
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Ferie 3
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Malattia
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(saldi).map(([empId, saldiData]) => {
                    // Il nome ora arriva dal backend (JOIN employees) — il
                    // vecchio lookup su allRequests falliva per dipendenti
                    // senza richieste. Fallback su ID troncato solo se il
                    // dipendente è stato cancellato (LEFT JOIN → name null).
                    const empName = saldiData.name || `Employee ${empId.substring(0, 8)}`;

                    return (
                      <TableRow key={empId} hover>
                        <TableCell>{empName}</TableCell>
                        <TableCell align="center">{saldiData.FERIE_1 || 0}</TableCell>
                        <TableCell align="center">{saldiData.FERIE_2 || 0}</TableCell>
                        <TableCell align="center">{saldiData.FERIE_3 || 0}</TableCell>
                        <TableCell align="center">{saldiData.MALATTIA || 0}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>
      </Box>

      {/* Reject Reason Dialog */}
      <Dialog open={rejectDialogOpen} onClose={handleCloseRejectDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Rifiuta Richiesta</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            multiline
            rows={4}
            fullWidth
            label="Motivo del rifiuto (opzionale)"
            placeholder="Inserisci il motivo..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            helperText={`${rejectionReason.length}/500`}
            inputProps={{ maxLength: 500 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRejectDialog}>Annulla</Button>
          <Button
            onClick={handleRejectConfirm}
            variant="contained"
            color="error"
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : 'Rifiuta'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};
