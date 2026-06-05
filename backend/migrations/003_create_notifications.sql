-- Migration 003: Create notifications table for employee shift change alerts
-- Applied: 2026-06-05

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'shift_updated',
  message TEXT NOT NULL,
  shift_date TEXT,
  new_shift TEXT,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_employee_id ON notifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_employee_unread ON notifications(employee_id, read) WHERE read = false;
