import React, { useState } from 'react';
import {
  IconButton,
  Badge,
  Popover,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  Divider,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useNotifications } from '../hooks/useNotifications';

export const NotificationBell = ({ enabled = true }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const { notifications, unreadCount, markAllRead } = useNotifications(enabled);

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleMarkAllRead = async () => {
    await markAllRead();
  };

  const open = Boolean(anchorEl);
  const visibleNotifications = notifications.slice(0, 10);

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleOpen}
        sx={{ padding: '6px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}
      >
        <Badge badgeContent={unreadCount > 0 ? unreadCount : null} color="error" max={9}>
          <NotificationsIcon sx={{ fontSize: '22px' }} />
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { width: 320, maxHeight: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' } }}
      >
        {/* Header */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: '#F9F8F6',
        }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2A2520' }}>
            Notifiche {unreadCount > 0 && (
              <Box component="span" sx={{ color: '#C0392B', fontSize: '12px', ml: 0.5 }}>
                ({unreadCount} nuove)
              </Box>
            )}
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              onClick={handleMarkAllRead}
              sx={{ textTransform: 'none', fontSize: '11px', color: '#1E3A5F', padding: '2px 6px' }}
            >
              Segna tutte come lette
            </Button>
          )}
        </Box>

        {/* List */}
        {visibleNotifications.length === 0 ? (
          <Box sx={{ padding: '32px 16px', textAlign: 'center' }}>
            <Typography variant="body2" color="textSecondary">
              Nessuna notifica
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ padding: 0, overflowY: 'auto', maxHeight: 340 }}>
            {visibleNotifications.map((n, idx) => (
              <React.Fragment key={n.id}>
                <ListItem
                  sx={{
                    backgroundColor: n.read ? 'transparent' : '#EFF6FF',
                    padding: '10px 16px',
                    alignItems: 'flex-start',
                  }}
                >
                  {!n.read && (
                    <Box sx={{
                      width: 6, height: 6, borderRadius: '50%', backgroundColor: '#1E3A5F',
                      marginTop: '6px', marginRight: '8px', flexShrink: 0,
                    }} />
                  )}
                  <ListItemText
                    primary={n.message}
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontWeight: n.read ? 400 : 600,
                      fontSize: '13px',
                      color: '#2A2520',
                      sx: { marginLeft: n.read ? '14px' : 0 },
                    }}
                    secondary={new Date(n.created_at).toLocaleString('it-IT', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                    secondaryTypographyProps={{
                      variant: 'caption',
                      color: 'text.secondary',
                      sx: { marginLeft: n.read ? '14px' : 0 },
                    }}
                  />
                </ListItem>
                {idx < visibleNotifications.length - 1 && (
                  <Divider sx={{ margin: 0 }} />
                )}
              </React.Fragment>
            ))}
          </List>
        )}
      </Popover>
    </>
  );
};
