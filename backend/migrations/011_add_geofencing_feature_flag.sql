-- Migration 011: Add client-level geofencing feature flag
-- DEFAULT true = backward compatible (existing clients keep geofencing available)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS geofencing_feature_enabled BOOLEAN NOT NULL DEFAULT true;
