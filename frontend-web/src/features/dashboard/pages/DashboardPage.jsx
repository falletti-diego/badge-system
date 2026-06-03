/**
 * Dashboard Page — Main Container
 * Displays presences, KPI cards, filters, and export functionality
 */

import React, { useState, useMemo } from 'react';
import { Container, Box, Alert } from '@mui/material';
import { usePresences } from '../hooks/usePresences';
import KpiCards from '../components/KpiCards';
import FilterBar from '../components/FilterBar';
import PresencesTable from '../components/PresencesTable';
import ExportButton from '../components/ExportButton';

const DashboardPage = () => {
  const [filters, setFilters] = useState({
    site_id: null,
    employee_id: null,
    date_from: null,
    date_to: null,
    limit: 50,
    offset: 0,
  });

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
