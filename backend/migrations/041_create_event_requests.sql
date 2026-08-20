-- Migration 041: Create event_requests table (Eventi/Training)
-- A single-day request with a time range (start_time/end_time), unlike
-- leave_requests (day-range, no time-of-day). Approved requests are joined
-- at query time into presences (see presences.js) — never materialized
-- into checkins.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS event_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  approved_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CHECK (end_time > start_time),
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_event_requests_user_id ON event_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_event_requests_status ON event_requests(status);
CREATE INDEX IF NOT EXISTS idx_event_requests_client_status ON event_requests(client_id, status);
CREATE INDEX IF NOT EXISTS idx_event_requests_user_date ON event_requests(user_id, event_date);
