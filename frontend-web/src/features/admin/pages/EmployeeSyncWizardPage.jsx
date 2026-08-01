import React, { useState, useRef } from 'react';
import { Box, Typography, Button, Alert, CircularProgress, Card, CardContent, Stack, List, ListItem, ListItemText, Chip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useEmployeeSync } from '../hooks/useEmployeeSync';

const SECTION_LABELS = {
  nuovi: 'Nuovi',
  riattivati: 'Riattivati',
  rimossi: 'Rimossi',
  modificati: 'Modificati',
};

export function EmployeeSyncWizardPage({ clientId }) {
  const { downloadTemplate, preview, apply, loading, error } = useEmployeeSync();
  const [file, setFile] = useState(null);
  const [diff, setDiff] = useState(null);
  const [applied, setApplied] = useState(false);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setApplied(false);
    const result = await preview(f, clientId);
    setDiff(result);
  };

  const handleConfirm = async () => {
    await apply(file, clientId);
    setApplied(true);
    setDiff(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const hasBlockingErrors = diff?.errors?.length > 0;

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Aggiorna Dipendenti
        </Typography>
        <Stack direction="row" spacing={2} mb={2}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadTemplate(clientId)}>
            Scarica template
          </Button>
          <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} disabled={loading}>
            {loading ? <CircularProgress size={18} /> : 'Carica file'}
            <input
              ref={fileRef}
              type="file"
              hidden
              aria-label="Carica file"
              accept=".xlsx"
              onChange={handleUpload}
            />
          </Button>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}
        {applied && <Alert severity="success">Modifiche applicate con successo.</Alert>}

        {diff && (
          <Stack spacing={2}>
            {diff.errors?.length > 0 && <Alert severity="error">{diff.errors.join(' — ')}</Alert>}
            {['nuovi', 'riattivati', 'rimossi', 'modificati'].map(
              (key) =>
                diff[key]?.length > 0 && (
                  <Box key={key}>
                    <Typography variant="subtitle2">
                      {SECTION_LABELS[key]} <Chip size="small" label={diff[key].length} />
                    </Typography>
                    <List dense>
                      {diff[key].map((r) => (
                        <ListItem key={r.email}>
                          <ListItemText primary={r.email} secondary={r.name} />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )
            )}
            {diff.anomalie?.length > 0 && (
              <Alert severity="warning">
                <Typography variant="subtitle2" gutterBottom>
                  Anomalie <Chip size="small" label={diff.anomalie.length} />
                </Typography>
                <Typography variant="body2" gutterBottom>
                  Assenti dal file caricato rispetto al template scaricato. Nessuna azione automatica, verifica se
                  intenzionale.
                </Typography>
                <List dense sx={{ maxHeight: 240, overflowY: 'auto' }}>
                  {diff.anomalie.map((a) => (
                    <ListItem key={a.email}>
                      <ListItemText primary={a.email} secondary={a.name} />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            )}
            <Box>
              <Button variant="contained" onClick={handleConfirm} disabled={loading || hasBlockingErrors}>
                Conferma tutte le modifiche
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
