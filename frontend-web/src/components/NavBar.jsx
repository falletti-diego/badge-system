import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Box,
  Typography,
  Popover,
  MenuItem,
  Divider,
  IconButton,
  Avatar,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import authService from '../services/authService';
import { getInitials } from '../utils/getInitials';
import DemoBanner from './DemoBanner';

export const NavBar = ({ title, children }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);

  const initials = getInitials(user?.name);
  const open = Boolean(anchorEl);

  const handleAvatarClick = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleChangePassword = () => {
    handleClose();
    navigate('/change-password', { state: { voluntary: true } });
  };

  const handleLogout = async () => {
    handleClose();
    try {
      await authService.logout();
    } catch (_) {}
    navigate('/login');
  };

  return (
    <>
      <AppBar position="static" sx={{ backgroundColor: '#1E3A5F' }} className="no-print">
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            component="h1"
            sx={{ color: 'white', fontSize: '20px', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            {title}
          </Typography>

          <Box sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {children}

            <IconButton
              onClick={handleAvatarClick}
              size="small"
              aria-label="Apri menu utente"
              sx={{ p: 0 }}
            >
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: 'transparent',
                  border: '2px solid rgba(255,255,255,0.75)',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: '"Inter", "DM Sans", sans-serif',
                  letterSpacing: '0.5px',
                  transition: 'border-color 0.15s ease, transform 0.15s ease',
                  '&:hover': {
                    borderColor: 'rgba(255,255,255,1)',
                    transform: 'scale(1.05)',
                  },
                }}
              >
                {initials}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            width: 240,
            borderRadius: '12px',
            boxShadow: '0 12px 40px rgba(30,58,95,0.22)',
            overflow: 'hidden',
            mt: 0.5,
          },
        }}
      >
        <Box
          sx={{
            backgroundColor: '#1E3A5F',
            height: 72,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
          }}
        >
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: 'transparent',
              border: '2px solid rgba(255,255,255,0.75)',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              fontFamily: '"Inter", "DM Sans", sans-serif',
              flexShrink: 0,
            }}
          >
            {initials}
          </Avatar>
          <Box sx={{ overflow: 'hidden' }}>
            <Typography
              sx={{
                color: 'white',
                fontSize: '14px',
                fontWeight: 600,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.name || '—'}
            </Typography>
            <Typography
              sx={{
                color: 'rgba(255,255,255,0.6)',
                fontSize: '11px',
                textTransform: 'capitalize',
              }}
            >
              {user?.email || ''}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ backgroundColor: 'white' }}>
          <Box sx={{ px: 2, py: 1 }}>
            <Typography sx={{ fontSize: '11px', color: '#64748B', textTransform: 'capitalize' }}>
              {user?.role || ''}
            </Typography>
          </Box>

          <Divider />

          <MenuItem
            onClick={handleChangePassword}
            sx={{ py: 1.5, fontSize: '14px', color: '#1E3A5F', fontWeight: 500 }}
          >
            🔑&nbsp;&nbsp;Cambia password
          </MenuItem>

          <Divider />

          <MenuItem
            onClick={handleLogout}
            sx={{ py: 1.5, fontSize: '14px', color: '#DC2626', fontWeight: 500 }}
          >
            🚪&nbsp;&nbsp;Esci
          </MenuItem>
        </Box>
      </Popover>

      <DemoBanner />
    </>
  );
};
