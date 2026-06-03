/**
 * Dashboard Page — Main Container
 * Displays presences, KPI cards, filters, and export functionality
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Box, Alert, AppBar, Toolbar, Button } from '@mui/material';
import { usePresences } from '../hooks/usePresences';
import KpiCards from '../components/KpiCards';
import FilterBar from '../components/FilterBar';
import PresencesTable from '../components/PresencesTable';
import ExportButton from '../components/ExportButton';
import authService from '../../../services/authService';

const DashboardPage = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    site_id: null,
    employee_id: null,
    date_from: null,
    date_to: null,
    limit: 50,
    offset: 0,
  });

  const handleLogout = async () => {
    await authService.logout();
    navigate('/login');
  };

  // Memoize filters to prevent infinite refetch loops
  const memoizedFilters = useMemo(() => filters, [
    filters.site_id,
    filters.employee_id,
    filters.date_from,
    filters.date_to,
    filters.limit,
    filters.offset,
  ]);

  const { data, stats, loading, error, refetch } = usePresences(memoizedFilters);

  const handleFilterChange = (newFilters) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      offset: 0, // Reset to first page
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      site_id: null,
      employee_id: null,
      date_from: null,
      date_to: null,
      limit: 50,
      offset: 0,
    });
  };

  const handlePaginationChange = (newOffset) => {
    setFilters((prev) => ({
      ...prev,
      offset: newOffset,
    }));
  };

  const handleRetry = () => {
    refetch();
  };

  return (
    <div className="min-h-screen bg-linen">
      {/* Navbar */}
      <AppBar position="static" sx={{ backgroundColor: '#1E3A5F' }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <h1 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>Badge System</h1>
          <Button
            color="inherit"
            onClick={handleLogout}
            sx={{
              textTransform: 'none',
              fontSize: '14px',
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,0.1)',
              },
            }}
          >
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ paddingTop: '40px', paddingBottom: '40px' }}>
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-cormorant font-bold text-ink mb-2">Presences Dashboard</h1>
          <p className="text-stone-600">Real-time check-ins and attendance tracking</p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert
            severity="error"
            onClose={handleRetry}
            sx={{ marginBottom: '24px' }}
            action={
              <button onClick={handleRetry} style={{ color: '#C0392B', fontWeight: 500 }}>
                Retry
              </button>
            }
          >
            {error}
          </Alert>
        )}

        {/* KPI Cards */}
        <KpiCards stats={stats} />

        {/* Filters */}
        <FilterBar onFilter={handleFilterChange} onClear={handleClearFilters} />

        {/* Export Button */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
          <ExportButton filters={filters} />
        </Box>

        {/* Presences Table */}
        <PresencesTable
          data={data}
          loading={loading}
          currentOffset={filters.offset}
          pageSize={filters.limit}
          onPaginationChange={handlePaginationChange}
        />
      </Container>
    </div>
  );
};

export default DashboardPage;
