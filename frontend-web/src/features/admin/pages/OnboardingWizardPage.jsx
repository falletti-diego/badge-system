import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Paper,
  Button,
  Stepper,
  Step,
  StepLabel,
  Alert,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  Link,
} from '@mui/material';
import { useOnboarding } from '../hooks/useOnboarding';

const STEPS = ['Carica Excel', 'Anteprima', 'Riepilogo'];

export const OnboardingWizardPage = () => {
  const { preview, apply, resendCredentials, loading, error, clearError } = useOnboarding();

  const [activeStep, setActiveStep] = useState(0);
  const [file, setFile] = useState(null);
  const [previewResult, setPreviewResult] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [tempPasswords, setTempPasswords] = useState({});

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
  };

  const handleUpload = async () => {
    if (!file) return;
    clearError();
    try {
      const result = await preview(file);
      setPreviewResult(result);
      setActiveStep(1);
    } catch (err) {
      // error already surfaced via hook's `error` state
    }
  };

  const handleConfirm = async () => {
    clearError();
    try {
      const result = await apply(file);
      setApplyResult(result);
      setActiveStep(2);
    } catch (err) {
      // error already surfaced via hook's `error` state
    }
  };

  const handleResend = async (employeeId) => {
    try {
      const result = await resendCredentials(employeeId);
      setTempPasswords((prev) => ({ ...prev, [employeeId]: result.temp_password }));
    } catch (err) {
      // error already surfaced via hook's `error` state
    }
  };

  const handleStartOver = () => {
    setActiveStep(0);
    setFile(null);
    setPreviewResult(null);
    setApplyResult(null);
    setTempPasswords({});
    clearError();
  };

  const hasBlockingErrors = previewResult?.errors?.length > 0;

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Typography variant="h2" sx={{ mb: 1 }}>
          Onboarding cliente
        </Typography>
        <Typography variant="body1" sx={{ color: '#6B625A', mb: 3 }}>
          Carica il file Excel sedi/dipendenti/saldi per popolare o aggiornare i dati.
        </Typography>

        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" onClose={clearError} sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {activeStep === 0 && (
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button variant="outlined" component="label">
                Seleziona file Excel
                <input
                  type="file"
                  hidden
                  aria-label="Carica file Excel"
                  accept=".xlsx"
                  onChange={handleFileChange}
                />
              </Button>
              {file && <Typography variant="body2">{file.name}</Typography>}
              <Button
                variant="contained"
                disabled={!file || loading}
                onClick={handleUpload}
                sx={{ alignSelf: 'flex-start' }}
              >
                {loading ? <CircularProgress size={20} /> : 'Continua'}
              </Button>
            </Box>
          </Paper>
        )}

        {activeStep === 1 && previewResult && (
          <Paper sx={{ p: 3 }}>
            {previewResult.errors.length > 0 ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                <List dense>
                  {previewResult.errors.map((msg, idx) => (
                    <ListItem key={idx} disableGutters>
                      <ListItemText primary={msg} />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            ) : (
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                <Chip label={`Sedi: ${previewResult.summary.sedi}`} />
                <Chip label={`Dipendenti creati: ${previewResult.summary.dipendenti_creati}`} color="success" />
                <Chip label={`Dipendenti aggiornati: ${previewResult.summary.dipendenti_aggiornati}`} />
                <Chip label={`Saldi: ${previewResult.summary.saldi}`} />
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button onClick={handleStartOver}>Indietro</Button>
              <Button
                variant="contained"
                disabled={hasBlockingErrors || loading}
                onClick={handleConfirm}
              >
                {loading ? <CircularProgress size={20} /> : 'Conferma e importa'}
              </Button>
            </Box>
          </Paper>
        )}

        {activeStep === 2 && applyResult && (
          <Paper sx={{ p: 3 }}>
            <Alert severity="success" sx={{ mb: 2 }}>
              Importazione completata: {applyResult.summary.dipendenti_creati} dipendenti creati,{' '}
              {applyResult.summary.dipendenti_aggiornati} aggiornati.
            </Alert>

            {applyResult.failedEmails.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Email di benvenuto non inviate
                </Typography>
                <List dense>
                  {applyResult.failedEmails.map((entry) => (
                    <ListItem key={entry.id} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <ListItemText primary={entry.email} />
                      {tempPasswords[entry.id] ? (
                        <Chip label={tempPasswords[entry.id]} color="success" />
                      ) : (
                        <Button size="small" onClick={() => handleResend(entry.id)} disabled={loading}>
                          Rigenera credenziali
                        </Button>
                      )}
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Link component={RouterLink} to="/admin/sites">
                Vai alle sedi
              </Link>
              <Button onClick={handleStartOver}>Nuovo import</Button>
            </Box>
          </Paper>
        )}
      </Box>
    </Container>
  );
};
