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
import { ManagerLeaveApprovalPanel } from '../../leave/components/ManagerLeaveApprovalPanel';
import authService from '../../../services/authService';

const DashboardPage = () => {
  const navigate = useNavigate();

  // Get user context for auto-filtering
  const userEmployeeId = authService.getEmployeeId();
  const userSiteId = authService.getSiteId();
  const userRole = authService.getUserRole();
  const isEmployee = authService.isEmployee();

  const [filters, setFilters] = useState({
    site_id: userSiteId ? userSiteId : null, // Auto-filter for managers with assigned store
    employee_id: isEmployee ? userEmployeeId : null, // Auto-filter for employees
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
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>Badge System</h1>

          <Box sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* Planning Button - Show for managers and admins */}
            {(userRole === 'manager' || userRole === 'admin') && (
              <Button
                color="inherit"
                onClick={() => navigate('/planning')}
                sx={{
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                }}
              >
                📅 Planning
              </Button>
            )}

            {/* Corrections Button - Show for managers and admins */}
            {(userRole === 'manager' || userRole === 'admin') && (
              <Button
                color="inherit"
                onClick={() => navigate('/corrections')}
                sx={{
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                }}
              >
                ✏️ Correzioni
              </Button>
            )}

            {/* Manager Leave Request - Show for managers */}
            {userRole === 'manager' && (
              <Button
                color="inherit"
                onClick={() => navigate('/leave/my-request')}
                sx={{
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                }}
              >
                📋 Le Mie Ferie
              </Button>
            )}

            {/* Sites & QR Code - Admin only */}
            {userRole === 'admin' && (
              <Button
                color="inherit"
                onClick={() => navigate('/admin/sites')}
                sx={{
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                }}
              >
                🏪 Sedi & QR
              </Button>
            )}

            {/* Admin panel - Admin only */}
            {userRole === 'admin' && (
              <Button
                color="inherit"
                onClick={() => navigate('/admin')}
                sx={{
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                }}
              >
                ⚙️ Admin
              </Button>
            )}

            {/* Admin Leave Management - Admin only */}
            {userRole === 'admin' && (
              <Button
                color="inherit"
                onClick={() => navigate('/admin/leave')}
                sx={{
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                }}
              >
                📋 Ferie Admin
              </Button>
            )}

            {/* Summary link - Show for admin, manager, viewer */}
            {(userRole === 'admin' || userRole === 'manager' || userRole === 'viewer') && (
              <Button
                color="inherit"
                onClick={() => navigate('/summary')}
                sx={{
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                }}
              >
                📊 Riepilogo
              </Button>
            )}

            {/* Employee Schedule Link - Show for employees */}
            {userRole === 'employee' && (
              <Button
                color="inherit"
                onClick={() => navigate('/planning/my-schedule')}
                sx={{
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.1)',
                  },
                }}
              >
                📆 I Miei Turni
              </Button>
            )}

            {/* Employee Leave Request Link - Show for employees */}
            {userRole === 'employee' && (
              <Button
                color="inherit"
                onClick={() => navigate('/leave/request')}
                sx={{
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.1)',
                  },
                }}
              >
                📋 Ferie
              </Button>
            )}

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
          </Box>
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

        {/* Manager Leave Approval Panel - Show for managers only */}
        {userRole === 'manager' && (
          <Box sx={{ marginBottom: '24px', marginTop: '24px' }}>
            <ManagerLeaveApprovalPanel />
          </Box>
        )}

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
