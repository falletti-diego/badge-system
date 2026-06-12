-- Migration 022: Create Leave Management Tables
-- Tables: leaves, leave_requests, leave_saldi
-- Created: 2026-06-12

-- ============================================
-- TABLE: Leaves (Types of Leave - Reference Data)
-- ============================================
CREATE TABLE IF NOT EXISTS leaves (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  requires_approval BOOLEAN DEFAULT false,
  requires_certificate BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO leaves (code, name, requires_approval, requires_certificate)
VALUES
  ('FERIE_1', 'Ferie 1', true, false),
  ('FERIE_2', 'Ferie 2', true, false),
  ('FERIE_3', 'Ferie 3', true, false),
  ('MALATTIA', 'Malattia', false, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- TABLE: LeaveRequests (Employee Leave Requests)
-- ============================================
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type VARCHAR(50) NOT NULL REFERENCES leaves(code),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  num_days INT NOT NULL,
  motivation TEXT,
  certificate_url VARCHAR(255),
  status VARCHAR(20) DEFAULT 'PENDING',
  approved_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CHECK (end_date >= start_date),
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'))
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_date_range ON leave_requests(start_date, end_date);

-- ============================================
-- TABLE: LeaveSaldi (Leave Balance Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS leave_saldi (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type VARCHAR(50) NOT NULL REFERENCES leaves(code),
  year INT NOT NULL,
  total_days INT NOT NULL,
  used_days INT DEFAULT 0,
  remaining_days INT GENERATED ALWAYS AS (total_days - used_days) STORED,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, leave_type, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_saldi_user_year ON leave_saldi(user_id, year);
