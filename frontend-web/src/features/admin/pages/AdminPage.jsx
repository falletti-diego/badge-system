import React, { useState } from 'react';
import { Box, Typography, Tabs, Tab, Divider, Button, Stack } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { ClientsTab } from '../tabs/ClientsTab';
import { SitesTab } from '../tabs/SitesTab';
import { EmployeesTab } from '../tabs/EmployeesTab';
import { ViewersTab } from '../tabs/ViewersTab';
import { SettingsTab } from '../tabs/SettingsTab';
import { ConsentTab } from '../tabs/ConsentTab';
import { DpaTab } from '../tabs/DpaTab';

export function AdminPage() {
  const [tab, setTab] = useState(0);
  const navigate = useNavigate();
  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={1}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/dashboard')}
          variant="outlined"
          size="small"
        >
          Dashboard
        </Button>
        <Typography variant="h3">Pannello Admin</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Gestisci clienti, sedi, dipendenti e accessi commercialisti.
      </Typography>
      <Divider sx={{ mb: 3 }} />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Clienti" />
        <Tab label="Sedi" />
        <Tab label="Dipendenti" />
        <Tab label="Commercialisti" />
        <Tab label="Impostazioni" />
        <Tab label="Consensi GPS" />
        <Tab label="DPA" />
      </Tabs>

      {tab === 0 && <ClientsTab />}
      {tab === 1 && <SitesTab />}
      {tab === 2 && <EmployeesTab />}
      {tab === 3 && <ViewersTab />}
      {tab === 4 && <SettingsTab />}
      {tab === 5 && <ConsentTab />}
      {tab === 6 && <DpaTab />}
    </Box>
  );
}
