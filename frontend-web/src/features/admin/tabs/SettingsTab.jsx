import React, { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress,
  Card, CardContent, Switch, FormControlLabel,
} from '@mui/material';
import apiClient from '../../../services/apiClient';
import authService from '../../../services/authService';
import { ConfirmSaveDialog } from '../components/ConfirmSaveDialog';

export function SettingsTab() {
  const [mealHours, setMealHours] = useState('');
  const [geofencingEnabled, setGeofencingEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [msg, setMsg] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(false);

  const user = authService.getUser();
  const clientId = user?.client_id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/api/admin/clients');
        if (!cancelled && res.data.data && res.data.data.length > 0) {
          const client = res.data.data.find(c => c.id === clientId) || res.data.data[0];
          setMealHours(client.meal_voucher_hours !== undefined && client.meal_voucher_hours !== null
            ? String(client.meal_voucher_hours) : '5');
          setGeofencingEnabled(client.geofencing_feature_enabled !== false);
        }
      } catch {
        // ignore — user can still type in the field
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const handleSave = () => {
    setConfirmDialog(true);
  };

  const handleConfirmSave = async () => {
    const parsed = parseFloat(mealHours);
    if (isNaN(parsed) || parsed < 0 || parsed > 24) {
      setMsg({ type: 'error', text: 'Inserisci un valore tra 0 e 24 ore.' });
      setConfirmDialog(false);
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      await apiClient.put('/api/admin/settings', {
        meal_voucher_hours: parsed,
        geofencing_feature_enabled: geofencingEnabled,
      });
      setMsg({ type: 'success', text: 'Impostazioni salvate.' });
      setConfirmDialog(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
      setConfirmDialog(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        {fetching ? (
          <CircularProgress size={24} />
        ) : (
          <>
            {/* GEOFENCING SECTION (FIRST) */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight={700} mb={1}>📍 Geofencing</Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Se attivo, i dipendenti possono effettuare il check-in solo quando si trovano
                fisicamente nelle vicinanze della sede (configurabile per ogni sede).
                Se disattivato, il controllo GPS viene ignorato per tutte le sedi.
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={geofencingEnabled}
                    onChange={(e) => setGeofencingEnabled(e.target.checked)}
                    color="primary"
                  />
                }
                label={geofencingEnabled ? 'Geofencing attivo' : 'Geofencing disattivato'}
              />
              {!geofencingEnabled && (
                <Alert severity="info" sx={{ mt: 1, maxWidth: 500 }}>
                  Il controllo GPS è disabilitato. I dipendenti possono fare check-in da qualsiasi posizione.
                </Alert>
              )}
            </Box>

            {/* MEAL VOUCHERS SECTION (SECOND) */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight={700} mb={1}>📋 Buoni Pasto</Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Il sistema assegna automaticamente un buono pasto per ogni giornata in cui il dipendente
                lavora almeno il numero di ore configurato qui.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, maxWidth: 400 }}>
                <TextField
                  label="Ore minime per buono pasto"
                  type="number"
                  value={mealHours}
                  onChange={(e) => setMealHours(e.target.value)}
                  inputProps={{ min: 0, max: 24, step: 0.5 }}
                  size="small"
                  helperText="Es: 5 = buono pasto se ≥ 5h lavorate"
                  sx={{ flexGrow: 1 }}
                />
              </Box>
            </Box>

            {/* SAVE BUTTON */}
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={loading}
              sx={{ backgroundColor: '#1E3A5F', mt: 2 }}
            >
              {loading ? <CircularProgress size={18} /> : 'Salva'}
            </Button>
          </>
        )}

        {msg && <Alert severity={msg.type} sx={{ mt: 2, maxWidth: 500 }}>{msg.text}</Alert>}

        {/* CONFIRMATION DIALOG */}
        <ConfirmSaveDialog
          open={confirmDialog}
          title="Conferma salvataggio impostazioni"
          description="Vuoi salvare le modifiche alle impostazioni di geofencing e buoni pasto?"
          onConfirm={handleConfirmSave}
          onCancel={() => setConfirmDialog(false)}
          loading={loading}
        />
      </CardContent>
    </Card>
  );
}
