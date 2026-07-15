import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Box, TextField, Button, Typography, Alert, CircularProgress } from '@mui/material';
import apiClient from '../services/apiClient';
import authService from '../services/authService';
import logger from '../utils/logger';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SCREENSHOTS = [
  { key: 'dashboard', title: 'Dashboard', caption: 'Presenze in tempo reale, KPI del mese, filtri per sede' },
  { key: 'trend', title: 'Grafici Trend', caption: 'Andamento presenze e ore lavorate settimana per settimana' },
  { key: 'export', title: 'Export', caption: 'Esporta tutto in CSV con un click, pronto per il commercialista' },
];

/**
 * Public landing page for the self-service demo (Task 7 of 9).
 *
 * Collects only an email, calls POST /demo/start, and — on success — stores
 * the returned session via authService.setSession(...) (the same helper
 * login() uses) before navigating to /dashboard. Errors (rate limit, demo
 * cap reached, already-registered email) are rendered inline on this page;
 * this route intentionally never redirects to a generic error page.
 */
export default function TryDemoPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [resumed, setResumed] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    logger.debug('TryDemoPage', 'handleSubmit triggered', { email });
    setApiError(null);
    setResumed(false);

    if (!email) {
      setEmailError('Inserisci la tua email');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setEmailError('Formato email non valido');
      return;
    }
    setEmailError(null);

    setLoading(true);
    try {
      const response = await apiClient.post('/api/v1/demo/start', { email });
      const { resumed: wasResumed, ...session } = response.data.data;

      logger.info('TryDemoPage', 'demo start successful', { email, resumed: wasResumed });
      authService.setSession(session);

      if (wasResumed) {
        // Brief confirmation before navigating away — the user gets to see
        // the "Bentornato" message rather than an instant, silent redirect.
        setResumed(true);
        setTimeout(() => navigate('/dashboard'), 1200);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      logger.error('TryDemoPage', 'demo start failed', err);
      const data = err.response?.data;
      let message;
      if (data?.error === 'RATE_LIMIT_EXCEEDED') {
        message = 'Troppi tentativi da questo indirizzo — riprova tra un po\'.';
      } else if (data?.error === 'TOO_MANY_ACTIVE_DEMOS') {
        message = 'Ci sono già troppe demo attive in questo momento — riprova più tardi o contattaci.';
      } else if (data?.error === 'EMAIL_ALREADY_REGISTERED') {
        message = data.message || 'Questo indirizzo è già registrato — contattaci se hai bisogno di aiuto.';
      } else if (data?.message) {
        message = data.message;
      } else if (data?.details?.length) {
        message = data.details[0].message;
      } else if (err.request) {
        message = 'Errore di rete — controlla la connessione e riprova.';
      } else {
        message = 'Qualcosa è andato storto — riprova tra un momento.';
      }
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      {/* Hero */}
      <Box
        sx={{
          bgcolor: 'var(--color-navy-900)',
          color: 'var(--color-linen)',
          py: { xs: 6, md: 10 },
          px: 2,
        }}
      >
        <Container maxWidth="md">
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: { xs: 3, md: 4 },
              animation: 'demoHeroFadeIn 0.6s ease-out',
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
              '@keyframes demoHeroFadeIn': {
                from: { opacity: 0 },
                to: { opacity: 1 },
              },
            }}
          >
            <Typography
              component="h1"
              sx={{
                fontFamily: 'var(--font-serif)',
                fontWeight: 600,
                fontSize: { xs: '2.5rem', sm: '3.5rem', md: '5rem' },
                lineHeight: 1.05,
              }}
            >
              Vedi le presenze del tuo negozio prima ancora di parlarci
            </Typography>

            <Typography
              sx={{
                fontFamily: 'var(--font-sans)',
                fontSize: { xs: '1rem', md: '1.125rem' },
                color: 'var(--color-linen)',
                opacity: 0.85,
                maxWidth: '38rem',
              }}
            >
              Una demo completa con dati realistici, pronta in pochi secondi. Nessuna carta,
              nessun impegno.
            </Typography>

            {/* Signature element: real-ish live KPI teaser from the fixed demo dataset */}
            <Box
              sx={{
                border: '1px solid rgba(245, 242, 237, 0.25)',
                borderRadius: 2,
                px: 4,
                py: 2,
                display: 'inline-block',
              }}
            >
              <Typography
                sx={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: { xs: '2rem', md: '2.5rem' },
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                127
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.85rem',
                  opacity: 0.75,
                  mt: 0.5,
                }}
              >
                presenze registrate questo mese
              </Typography>
            </Box>

            {/* Form */}
            <Box
              component="form"
              noValidate
              onSubmit={handleSubmit}
              sx={{
                width: '100%',
                maxWidth: '26rem',
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 1.5,
                mt: 1,
              }}
            >
              <TextField
                label="La tua email"
                type="email"
                placeholder="tu@azienda.it"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                error={!!emailError}
                helperText={emailError}
                disabled={loading}
                fullWidth
                variant="outlined"
                size="medium"
                sx={{
                  bgcolor: 'var(--color-linen)',
                  borderRadius: 1,
                  '& .MuiInputBase-root': { bgcolor: 'var(--color-linen)' },
                }}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                sx={{
                  bgcolor: 'var(--color-gold-500)',
                  color: 'var(--color-navy-900)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  px: 3,
                  '&:hover': { bgcolor: 'var(--color-gold-500)', opacity: 0.9 },
                  '&:disabled': { bgcolor: 'var(--color-gold-500)', opacity: 0.5 },
                }}
              >
                {loading ? <CircularProgress size={22} sx={{ color: 'var(--color-navy-900)' }} /> : 'Entra nella demo →'}
              </Button>
            </Box>

            {/* GDPR micro-copy — honest sentence, not a consent checkbox */}
            <Typography
              sx={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.8rem',
                opacity: 0.7,
                maxWidth: '26rem',
              }}
            >
              La useremo solo per questa demo (max 14 giorni in tutto), niente spam.
            </Typography>

            {resumed && (
              <Alert severity="success" sx={{ width: '100%', maxWidth: '26rem' }}>
                Bentornato! La tua demo è ancora attiva.
              </Alert>
            )}

            {apiError && (
              <Alert severity="error" sx={{ width: '100%', maxWidth: '26rem' }} onClose={() => setApiError(null)}>
                {apiError}
              </Alert>
            )}
          </Box>
        </Container>
      </Box>

      {/* Cosa vedrai */}
      <Box
        sx={{
          bgcolor: 'var(--color-linen)',
          color: 'var(--color-ink)',
          py: { xs: 5, md: 8 },
          px: 2,
        }}
      >
        <Container maxWidth="lg">
          <Typography
            component="h2"
            sx={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 600,
              fontSize: { xs: '1.75rem', md: '2.25rem' },
              textAlign: 'center',
              mb: { xs: 3, md: 5 },
            }}
          >
            Cosa vedrai
          </Typography>

          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              gap: 3,
            }}
          >
            {SCREENSHOTS.map((shot) => (
              <Box
                key={shot.key}
                sx={{
                  flex: 1,
                  border: '1px solid var(--color-bone)',
                  borderRadius: 2,
                  overflow: 'hidden',
                  bgcolor: '#fff',
                }}
              >
                {/*
                  Placeholder — no real product screenshots are checked into
                  the repo yet. Swap this Box for an <img> of the actual
                  Dashboard/Grafici Trend/Export screens once captured.
                */}
                <Box
                  sx={{
                    height: 160,
                    bgcolor: 'var(--color-parchment)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-stone)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '0.85rem',
                  }}
                >
                  {shot.title} — anteprima
                </Box>
                <Box sx={{ p: 2 }}>
                  <Typography sx={{ fontFamily: 'var(--font-sans)', fontWeight: 600, mb: 0.5 }}>
                    {shot.title}
                  </Typography>
                  <Typography sx={{ fontFamily: 'var(--font-sans)', fontSize: '0.875rem', color: 'var(--color-stone)' }}>
                    {shot.caption}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
