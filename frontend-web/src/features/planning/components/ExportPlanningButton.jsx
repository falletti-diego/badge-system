import React, { useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  CircularProgress,
  Tooltip
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import apiClient from '../../../services/apiClient';

export const ExportPlanningButton = ({ siteId, month, year, siteName = 'Planning' }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [exporting, setExporting] = useState(false);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleExport = async (format) => {
    setExporting(true);
    try {
      const response = await apiClient.get(
        `/api/shifts/${siteId}/export`,
        {
          params: { month, year, format },
          responseType: 'blob'
        }
      );

      // Create blob and download
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `planning_${siteName}_${month}_${year}.${format === 'pdf' ? 'pdf' : 'csv'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      handleClose();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Esportazione fallita: ' + (error.response?.data?.message || error.message));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Tooltip title="Esporta planning come PDF o CSV">
        <Button
          onClick={handleClick}
          variant="outlined"
          startIcon={<DownloadIcon />}
          disabled={exporting}
        >
          {exporting ? <CircularProgress size={20} /> : '📥 Esporta'}
        </Button>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
      >
        <MenuItem onClick={() => handleExport('pdf')}>
          Esporta come PDF
        </MenuItem>
        <MenuItem onClick={() => handleExport('csv')}>
          Esporta come CSV
        </MenuItem>
      </Menu>
    </>
  );
};
