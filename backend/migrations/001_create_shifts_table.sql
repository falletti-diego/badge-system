-- Migration: Create shifts table for Planning/Scheduling
-- Date: 2026-06-04
-- Description: Add shifts table with JSONB for shift scheduling

-- Create shifts table
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  shifts_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, site_id, month, year)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_shifts_client_id ON shifts(client_id);
CREATE INDEX IF NOT EXISTS idx_shifts_site_id ON shifts(site_id);
CREATE INDEX IF NOT EXISTS idx_shifts_client_site_month ON shifts(client_id, site_id, month, year);

-- Verify table creation
SELECT COUNT(*) as shifts_table_exists
FROM information_schema.tables
WHERE table_name = 'shifts' AND table_schema = 'public';
