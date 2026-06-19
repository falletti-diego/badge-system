import React, { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Box,
  Typography,
  AppBar,
  Toolbar,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Chip,
  Divider,
} from '@mui/material';
import QRCode from 'react-qr-code';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import authService from '../../../services/authService';
import apiClient from '../../../services/apiClient';

export const SitesPage = () => {
  const navigate = useNavigate();
  const { loading: userLoading } = useAuth();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/v1/sites');
      setSites(response.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Errore nel caricamento delle sedi');
    } finally {
      setLoading(false);
    }
  }, []);

  // Wait for auth to resolve before fetching — avoids unauthenticated request on mount
  useEffect(() => {
    if (!userLoading) {
      fetchSites();
    }
  }, [userLoading, fetchSites]);

  const handleLogout = async () => {
    await authService.logout();
    navigate('/login');
  };

  // Download QR as PNG by rendering SVG → canvas
  const downloadQRPng = (siteId, siteName) => {
    const svgEl = document.getElementById(`qr-svg-${siteId}`);
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `qr-${siteName.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = pngUrl;
      link.click();
    };
    img.src = url;
  };

  if (userLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <div className="min-h-screen bg-linen">
      {/* Navbar */}
      <AppBar position="static" sx={{ backgroundColor: '#1E3A5F' }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <h1 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>🏪 Sedi & QR Code</h1>
          <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button
              color="inherit"
              onClick={() => navigate('/dashboard')}
              sx={{ textTransform: 'none', fontSize: '14px' }}
            >
              ← Dashboard
            </Button>
            <Button
              color="inherit"
              onClick={handleLogout}
              sx={{ textTransform: 'none', fontSize: '14px' }}
            >
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ paddingY: '32px' }}>
        {/* Header */}
        <Box sx={{ marginBottom: '32px' }}>
          <Typography variant="h3" sx={{ fontFamily: 'Cormorant', fontWeight: 'bold', marginBottom: '8px' }}>
            🏪 Sedi & QR Code
          </Typography>
          <Typography variant="body1" color="textSecondary">
            QR code da stampare e affiggere in ogni sede. I dipendenti li scansionano per registrare la presenza.
          </Typography>
        </Box>

        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <CircularProgress />
          </Box>
        )}

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ marginBottom: '20px' }}>
            {error}
          </Alert>
        )}

        {/* Sites list */}
        {!loading && sites.length === 0 && (
          <Alert severity="info">Nessuna sede trovata per questo account.</Alert>
        )}

        {!loading && sites.map((site) => (
          <Card key={site.id} sx={{ marginBottom: '24px', borderLeft: '4px solid #1E3A5F' }}>
            <CardContent sx={{ padding: '24px' }}>
              {/* Site header */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: '#2A2520', marginBottom: '4px' }}>
                    {site.name}
                  </Typography>
                  {site.location && (
                    <Typography variant="body2" color="textSecondary">
                      📍 {site.location}
                    </Typography>
                  )}
                </Box>
                <Chip
                  label="Attiva"
                  size="small"
                  sx={{ backgroundColor: '#D1FAE5', color: '#065F46', fontWeight: 600 }}
                />
              </Box>

              <Divider sx={{ marginBottom: '20px' }} />

              {/* QR code + download */}
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: '32px', alignItems: { xs: 'center', sm: 'flex-start' } }}>
                {/* QR Code display */}
                <Box sx={{ flexShrink: 0, padding: '16px', backgroundColor: '#FFFFFF', border: '2px solid #E5E7EB', borderRadius: '8px' }}>
                  <QRCode
                    id={`qr-svg-${site.id}`}
                    value={site.qr_code_content}
                    size={180}
                    level="H"
                    style={{ display: 'block' }}
                  />
                </Box>

                {/* Info + actions */}
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, marginBottom: '8px', color: '#6B7280' }}>
                    CONTENUTO QR
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block',
                      backgroundColor: '#F3F4F6',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                      marginBottom: '20px',
                      color: '#374151',
                      fontSize: '11px',
                    }}
                  >
                    {site.qr_code_content}
                  </Typography>

                  <Typography variant="body2" color="textSecondary" sx={{ marginBottom: '16px', fontSize: '13px' }}>
                    Stampa il QR code e affiggi nei punti di ingresso della sede.
                    Puoi appenderne più copie: tutti puntano alla stessa sede.
                  </Typography>

                  <Button
                    variant="contained"
                    onClick={() => downloadQRPng(site.id, site.name)}
                    sx={{
                      backgroundColor: '#1E3A5F',
                      textTransform: 'none',
                      fontWeight: 600,
                      '&:hover': { backgroundColor: '#162d4a' },
                    }}
                  >
                    ⬇ Scarica PNG
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}

        {/* Instructions card */}
        {!loading && sites.length > 0 && (
          <Card sx={{ backgroundColor: '#F5F2ED', border: '1px solid #E5E7EB' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, marginBottom: '12px' }}>
                💡 Come usare i QR code
              </Typography>
              <Box component="ol" sx={{ margin: 0, paddingLeft: '20px' }}>
                {[
                  'Scarica il QR code come PNG per ogni sede',
                  'Stampalo in formato A4 o A5 e affiggi vicino all\'ingresso',
                  'Puoi stampare più copie: tutti puntano alla stessa sede',
                  'I dipendenti scansionano il QR con la app Badge per registrare la presenza',
                  'Il sistema registra automaticamente ora di arrivo e dipendente',
                ].map((step, i) => (
                  <Typography key={i} component="li" variant="body2" sx={{ marginBottom: '6px' }}>
                    {step}
                  </Typography>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}
      </Container>
    </div>
  );
};
