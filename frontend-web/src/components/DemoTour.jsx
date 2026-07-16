import { useEffect, useState } from 'react';
import { Popper, Paper, Typography, Button, Box, Fade } from '@mui/material';
import authService from '../services/authService';

const TOUR_SEEN_KEY = 'badge_demo_tour_seen';

// Anchored via document.getElementById — the ids below are set on wrapping
// elements in DashboardPage.jsx (KPI Cards, Grafici Trend, Export CSV) and
// FilterBar.jsx (Sede dropdown). All four only exist together on
// DashboardPage, so this component is mounted there (not from NavBar, unlike
// DemoBanner) — see plan Task 8.
const STEPS = [
  {
    id: 'demo-tour-kpi-cards',
    title: 'Presenze in tempo reale',
    text: 'Qui vedi il colpo d\'occhio del mese: presenze, ore lavorate e assenteismo aggiornati in tempo reale.',
    placement: 'bottom',
  },
  {
    id: 'demo-tour-trend',
    title: 'Grafici Trend',
    text: 'L\'andamento settimana per settimana — utile per capire se le cose stanno migliorando o peggiorando.',
    placement: 'bottom',
  },
  {
    id: 'demo-tour-export',
    title: 'Export CSV',
    text: 'Un click ed esporti tutto in CSV, pronto per il commercialista o per il tuo gestionale.',
    placement: 'top',
  },
  {
    id: 'demo-tour-site-filter',
    title: 'Filtra per sede',
    text: 'Con più sedi, puoi filtrare la vista per concentrarti su un singolo negozio.',
    placement: 'bottom',
  },
];

/**
 * DemoTour (Task 8 of 9)
 *
 * 3-4 sequential MUI Popper tooltips shown once per demo session (guarded
 * by localStorage[badge_demo_tour_seen]), skippable at any point. Only
 * rendered/started for an active demo session (authService.isDemo()).
 *
 * Anchoring: each target is looked up by document.getElementById at mount
 * and on step-change, rather than via refs, since the 4 target elements
 * live in sibling components (DashboardPage, FilterBar) that DemoTour has
 * no direct access to — a stable DOM id is the simplest anchor across that
 * boundary. If a target id isn't present in the DOM (e.g. this step doesn't
 * apply to the current role), that step is skipped automatically.
 */
export default function DemoTour() {
  const [stepIndex, setStepIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  const isDemo = authService.isDemo();
  const alreadySeen = typeof window !== 'undefined' && localStorage.getItem(TOUR_SEEN_KEY) === 'true';

  useEffect(() => {
    if (!isDemo || alreadySeen) return;
    setStarted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!started) return;
    const step = STEPS[stepIndex];
    if (!step) return;
    const el = document.getElementById(step.id);
    if (!el) {
      // Target not present for this session (e.g. role without a trend
      // chart) — skip straight to the next step.
      if (stepIndex < STEPS.length - 1) {
        setStepIndex((i) => i + 1);
      } else {
        finish();
      }
      return;
    }
    setAnchorEl(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, stepIndex]);

  const finish = () => {
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
    setStarted(false);
    setAnchorEl(null);
  };

  const handleNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      finish();
    }
  };

  const handleSkip = () => {
    finish();
  };

  if (!isDemo || !started || !anchorEl) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <Popper open anchorEl={anchorEl} placement={step.placement} transition sx={{ zIndex: 1500 }}>
      {({ TransitionProps }) => (
        <Fade {...TransitionProps} timeout={200}>
          <Paper
            elevation={6}
            sx={{ p: 2, maxWidth: 300, border: '1px solid var(--color-gold-500, #C9A227)' }}
            data-testid="demo-tour-step"
          >
            <Typography sx={{ fontWeight: 700, fontSize: '14px', mb: 0.5 }}>{step.title}</Typography>
            <Typography sx={{ fontSize: '13px', color: '#6B625A', mb: 1.5 }}>{step.text}</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button size="small" onClick={handleSkip} sx={{ textTransform: 'none' }}>
                Salta
              </Button>
              <Button size="small" variant="contained" onClick={handleNext} sx={{ textTransform: 'none' }}>
                {isLast ? 'Fine' : 'Avanti'}
              </Button>
            </Box>
          </Paper>
        </Fade>
      )}
    </Popper>
  );
}
