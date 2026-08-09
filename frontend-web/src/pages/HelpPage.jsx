import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Button, Typography,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { NavBar } from '../components/NavBar';
import authService from '../services/authService';
import { FAQ_ITEMS, isVisible } from '../data/faq';

export default function HelpPage() {
  const navigate = useNavigate();
  const userRole = authService.getUserRole();
  const visibleItems = FAQ_ITEMS.filter((item) => isVisible(item, userRole));

  return (
    <div className="min-h-screen bg-linen">
      <NavBar title="Badge System">
        <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none', fontSize: '14px' }}>
          ← Dashboard
        </Button>
      </NavBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E3A5F', mb: 3 }}>
          ❓ Guida — Domande Frequenti
        </Typography>

        {visibleItems.map((item) => (
          <Accordion key={item.id} sx={{ mb: 1 }} TransitionProps={{ unmountOnExit: true }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 600 }}>{item.question}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography sx={{ color: '#6B625A' }}>{item.answer}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Container>
    </div>
  );
}
