-- Migration 010: Geofencing support (FASE 10)
-- Adds GPS coordinates + radius control to sites, stores check-in coordinates

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS geofence_radius_meters INT DEFAULT 150,
  ADD COLUMN IF NOT EXISTS geofence_enabled BOOLEAN DEFAULT false;

ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS checkin_latitude DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS checkin_longitude DECIMAL(9,6);
