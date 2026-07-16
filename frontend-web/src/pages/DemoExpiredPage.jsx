import { Box, Container, Typography, Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

/**
 * DemoExpiredPage (Task 8 of 9)
 *
 * Shown at /demo-expired — public, outside ProtectedRoute (see App.jsx),
 * and exempted from PasswordChangeGuard's force-redirect (same reasoning as
 * /prova-demo: this page must stay reachable by a visitor even with a stale
 * must_change_password flag in localStorage).
 *
 * Reached when: (a) a demo session's token refresh discovers the trial has
 * expired (POST /auth/refresh returns DEMO_EXPIRED), or (b) POST
 * /demo/switch-role or /demo/contact hit the same DEMO_EXPIRED check on
 * their own request before a refresh is even attempted — both paths funnel
 * through apiClient.js's response interceptor, which redirects here instead
 * of /login specifically for this error code (see apiClient.js).
 *
 * By the time this page renders, the demo session's tokens have already
 * been cleared — there is no valid session left to authenticate a call to
 * POST /demo/contact, so this page does NOT reuse DemoContactModal. Instead
 * it offers two unauthenticated ways to re-engage: a link back to
 * /prova-demo (a returning visitor re-entering the same email hits the
 * resume path, extending their trial — Task 3) and a plain mailto: link.
 *
 * Visual style deliberately mirrors TryDemoPage.jsx's hero (navy-900 /
 * gold) — same public demo funnel family.
 */
export default function DemoExpiredPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'var(--color-navy-900)',
        color: 'var(--color-linen)',
        display: 'flex',
        alignItems: 'center',
        py: { xs: 6, md: 10 },
        px: 2,
      }}
    >
      <Container maxWidth="sm">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 3,
          }}
        >
          <Typography
            component="h1"
            sx={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 600,
              fontSize: { xs: '2rem', md: '2.75rem' },
              lineHeight: 1.15,
            }}
          >
            La tua demo è scaduta
          </Typography>

          <Typography
            sx={{
              fontFamily: 'var(--font-sans)',
              fontSize: { xs: '1rem', md: '1.05rem' },
              opacity: 0.85,
              maxWidth: '30rem',
            }}
          >
            La prova gratuita del Badge System dura fino a 14 giorni. Puoi iniziare una nuova
            demo in qualsiasi momento — se usi la stessa email, ripartirai da dove avevi
            lasciato.
          </Typography>

          <Button
            component={RouterLink}
            to="/prova-demo"
            variant="contained"
            size="large"
            sx={{
              bgcolor: 'var(--color-gold-500)',
              color: 'var(--color-navy-900)',
              fontWeight: 700,
              px: 4,
              '&:hover': { bgcolor: 'var(--color-gold-500)', opacity: 0.9 },
            }}
          >
            Inizia una nuova demo →
          </Button>

          <Typography
            sx={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.9rem',
              opacity: 0.75,
            }}
          >
            Oppure scrivici direttamente a{' '}
            <Box
              component="a"
              href="mailto:info@dataxiom.it"
              sx={{ color: 'var(--color-gold-500)', textDecoration: 'underline' }}
            >
              info@dataxiom.it
            </Box>
            .
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
