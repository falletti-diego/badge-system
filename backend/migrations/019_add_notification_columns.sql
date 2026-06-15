-- Migration 019: Add missing columns to notifications table
-- Backfills schema drift: type, shift_date, new_shift, site_id were in 003 but not applied

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'shift_updated',
  ADD COLUMN IF NOT EXISTS shift_date TEXT,
  ADD COLUMN IF NOT EXISTS new_shift TEXT,
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
