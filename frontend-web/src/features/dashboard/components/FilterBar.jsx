/**
 * Filter Bar Component
 * Date range, site, and employee filters for presences table
 */

import React, { useState } from 'react';
import { Card, TextField, Button, Box, MenuItem } from '@mui/material';
import { useFetch } from '../../admin/components/useFetch';

const FilterBar = ({ onFilter = () => {}, onClear = () => {}, userRole, userSiteId }) => {
  const isSiteLocked = userRole === 'manager';

  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    site_id: isSiteLocked && userSiteId ? userSiteId : '',
    employee_id: '',
  });

  const [error, setError] = useState('');

  const { data: sites } = useFetch('/api/v1/sites');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
  };

  const handleApplyFilters = () => {
    // Validation: Compare dates as strings to avoid timezone issues
    if (filters.date_from && filters.date_to) {
      // Parse date strings (YYYY-MM-DD format from input type="date")
      const [fromY, fromM, fromD] = filters.date_from.split('-');
      const [toY, toM, toD] = filters.date_to.split('-');

      const from = new Date(parseInt(fromY), parseInt(fromM) - 1, parseInt(fromD));
      const to = new Date(parseInt(toY), parseInt(toM) - 1, parseInt(toD));

      if (from > to) {
        setError('Start date must be before end date');
        return;
      }

      const diffMs = to - from;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 90) {
        setError('Date range cannot exceed 90 days');
        return;
      }
    }

    onFilter(filters);
  };

  const handleClearFilters = () => {
    setFilters({
      date_from: '',
      date_to: '',
      site_id: isSiteLocked && userSiteId ? userSiteId : '',
      employee_id: '',
    });
    setError('');
    onClear();
  };

  return (
    <Card sx={{ padding: '20px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <TextField
          label="From Date"
          type="date"
          name="date_from"
          value={filters.date_from}
          onChange={handleInputChange}
          InputLabelProps={{ shrink: true }}
          size="small"
          fullWidth
        />

        <TextField
          label="To Date"
          type="date"
          name="date_to"
          value={filters.date_to}
          onChange={handleInputChange}
          InputLabelProps={{ shrink: true }}
          size="small"
          fullWidth
        />

        <div id="demo-tour-site-filter">
          <TextField
            select
            label="Sede"
            name="site_id"
            value={filters.site_id}
            onChange={handleInputChange}
            size="small"
            fullWidth
            disabled={isSiteLocked}
          >
            {!isSiteLocked && <MenuItem value="">Tutte le sedi</MenuItem>}
            {sites.map((site) => (
              <MenuItem key={site.id} value={site.id}>
                {site.name}
              </MenuItem>
            ))}
          </TextField>
        </div>

        <TextField
          label="Employee (optional)"
          name="employee_id"
          value={filters.employee_id}
          onChange={handleInputChange}
          placeholder="Employee ID or name"
          size="small"
          fullWidth
        />
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <Box sx={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          onClick={handleClearFilters}
          sx={{
            borderColor: '#999999',
            color: '#999999',
            '&:hover': { borderColor: '#666666', color: '#666666' },
          }}
        >
          Clear Filters
        </Button>
        <Button
          variant="contained"
          onClick={handleApplyFilters}
          sx={{
            backgroundColor: '#1E3A5F',
            '&:hover': { backgroundColor: '#132543' },
          }}
        >
          Apply Filters
        </Button>
      </Box>
    </Card>
  );
};

export default FilterBar;
