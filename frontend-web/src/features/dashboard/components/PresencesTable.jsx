/**
 * Presences Table Component
 * Displays check-ins in a data table with sorting and pagination
 */

import React, { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Button, Box, Chip, Tooltip } from '@mui/material';

/**
 * Pairs IN and OUT records in the loaded rows and returns a Map of
 * OUT-row-id → duration string (e.g. "7h 30m").
 * Only works within the currently loaded page — falls back to '—' for
 * OUTs whose matching IN is on a different page.
 */
function computeOreMap(rows) {
  const map = new Map();
  // Group by employee, sort by timestamp, then pair greedily
  const byEmployee = new Map();
  for (const row of rows) {
    if (!byEmployee.has(row.employee_id)) byEmployee.set(row.employee_id, []);
    byEmployee.get(row.employee_id).push(row);
  }
  for (const empRows of byEmployee.values()) {
    const sorted = [...empRows].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    let i = 0;
    while (i < sorted.length) {
      if (sorted[i].type !== 'IN') { i++; continue; }
      const inRow = sorted[i];
      let j = i + 1;
      while (j < sorted.length && sorted[j].type !== 'OUT') j++;
      if (j < sorted.length) {
        const minutes = (new Date(sorted[j].timestamp) - new Date(inRow.timestamp)) / 60000;
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        map.set(sorted[j].id, m === 0 ? `${h}h` : `${h}h ${m}m`);
        i = j + 1;
      } else {
        i++;
      }
    }
  }
  return map;
}

const PresencesTable = ({ data = { rows: [], total: 0 }, loading = false, currentOffset = 0, pageSize = 50, onPaginationChange = () => {} }) => {
  const [sorting, setSorting] = useState({ column: 'timestamp', direction: 'desc' });

  // Sort data
  const sortedData = useMemo(() => {
    const sorted = [...data.rows];

    if (sorting.column && sorting.direction) {
      sorted.sort((a, b) => {
        const aVal = a[sorting.column];
        const bVal = b[sorting.column];

        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        if (typeof aVal === 'string') {
          return sorting.direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }

        if (sorting.direction === 'asc') return aVal - bVal;
        return bVal - aVal;
      });
    }

    return sorted;
  }, [data.rows, sorting]);

  const handleSort = (column) => {
    setSorting((prev) => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleNextPage = () => {
    const newOffset = currentOffset + pageSize;
    if (newOffset < data.total) {
      onPaginationChange(newOffset);
    }
  };

  const handlePrevPage = () => {
    const newOffset = Math.max(0, currentOffset - pageSize);
    onPaginationChange(newOffset);
  };

  const currentPage = Math.floor(currentOffset / pageSize) + 1;
  const totalPages = Math.ceil(data.total / pageSize);

  const oreMap = useMemo(() => computeOreMap(data.rows), [data.rows]);

  const columns = [
    { key: 'employee_name', label: 'Employee Name', sortable: true },
    { key: 'employee_email', label: 'Email', sortable: true, hideMobile: true },
    { key: 'site_name', label: 'Site', sortable: true },
    { key: 'timestamp', label: 'Check-in Time', sortable: true },
    { key: 'type', label: 'Type', sortable: true },
    { key: 'ore', label: 'Ore', sortable: false },
    { key: 'modified_at', label: 'Last Modified', sortable: true, hideMobile: true },
  ];

  const SortIndicator = ({ column }) => {
    if (sorting.column !== column) return null;
    return sorting.direction === 'asc' ? ' ▲' : ' ▼';
  };

  if (loading) {
    return (
      <Paper sx={{ padding: '40px', textAlign: 'center' }}>
        <p className="text-stone-600">Loading presences...</p>
      </Paper>
    );
  }

  if (!sortedData || sortedData.length === 0) {
    return (
      <Paper sx={{ padding: '40px', textAlign: 'center' }}>
        <p className="text-stone-600">No check-ins found. Try adjusting your filters.</p>
      </Paper>
    );
  }

  return (
    <div>
      <TableContainer component={Paper} sx={{ marginBottom: '20px' }}>
        <Table size="small">
          <TableHead sx={{ backgroundColor: '#F5F2ED' }}>
            <TableRow>
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  sx={{
                    fontWeight: 600,
                    color: '#2A2520',
                    cursor: col.sortable ? 'pointer' : 'default',
                    backgroundColor: '#F5F2ED',
                  }}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  {col.label}
                  {col.sortable && <SortIndicator column={col.key} />}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedData.map((row) => (
              <TableRow
                key={row.id}
                sx={{
                  '&:hover': { backgroundColor: '#FAFAF8' },
                  borderBottom: '1px solid #EDE9E2',
                }}
              >
                <TableCell sx={{ color: '#2A2520' }}>{row.employee_name || '—'}</TableCell>
                <TableCell sx={{ color: '#2A2520', display: { xs: 'none', md: 'table-cell' } }}>
                  {row.employee_email || '—'}
                </TableCell>
                <TableCell sx={{ color: '#2A2520' }}>{row.site_name || '—'}</TableCell>
                <TableCell sx={{ color: '#2A2520' }}>
                  {row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}
                  {row.is_offline && (
                    <Tooltip title="Timbratura registrata senza rete e sincronizzata in seguito">
                      <Chip label="Offline" size="small" color="warning" sx={{ ml: 1, height: '20px', fontSize: '0.7rem' }} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  <Box
                    component="span"
                    sx={{
                      px: 2,
                      py: 0.5,
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      backgroundColor: row.type === 'IN' ? '#EEF6F1' : '#FEF6EC',
                      color: row.type === 'IN' ? '#2D7049' : '#B45309',
                      display: 'inline-block',
                    }}
                  >
                    {row.type || '—'}
                  </Box>
                </TableCell>
                <TableCell sx={{ color: '#6B625A', fontSize: '0.85rem' }}>
                  {row.type === 'OUT' ? (oreMap.get(row.id) || '—') : '—'}
                </TableCell>
                <TableCell sx={{ color: '#999999', display: { xs: 'none', md: 'table-cell' } }}>
                  {row.modified_at ? new Date(row.modified_at).toLocaleString() : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination Controls */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="text-sm text-stone-600">
          Page {currentPage} of {totalPages} (Total: {data.total})
        </p>
        <div className="flex gap-2">
          <Button
            size="small"
            variant="outlined"
            onClick={handlePrevPage}
            disabled={currentOffset === 0}
            sx={{ borderColor: '#1E3A5F', color: '#1E3A5F' }}
          >
            ← Prev
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={handleNextPage}
            disabled={currentOffset + pageSize >= data.total}
            sx={{ borderColor: '#1E3A5F', color: '#1E3A5F' }}
          >
            Next →
          </Button>
        </div>
      </Box>
    </div>
  );
};

export default PresencesTable;
