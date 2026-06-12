-- Badge System Database Schema
-- PostgreSQL 14+
-- Created: 2026-06-01

-- Drop existing database if exists (clean slate)
DROP DATABASE IF EXISTS badge_system;

-- Create database
CREATE DATABASE badge_system
  ENCODING 'UTF8'
  LC_COLLATE 'en_US.UTF-8'
  LC_CTYPE 'en_US.UTF-8'
  TEMPLATE template0;

-- Connect to new database
\c badge_system

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: Clients (SaaS Tenants)
-- ============================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'starter',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index on email for lookups
CREATE INDEX idx_clients_email ON clients(email);

-- ============================================
-- TABLE: Sites (Physical Locations)
-- ============================================
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(200),
  qr_code_content VARCHAR(500) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_sites_client_id ON sites(client_id);
CREATE INDEX idx_sites_qr_code ON sites(qr_code_content);

-- ============================================
-- TABLE: Employees (Retail Workers)
-- ============================================
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  assigned_sites UUID[] DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, email)
);

-- Indexes for common queries
CREATE INDEX idx_employees_client_id ON employees(client_id);
CREATE INDEX idx_employees_email ON employees(email);

-- ============================================
-- TABLE: CheckIns (Attendance Records)
-- ============================================
CREATE TYPE checkin_type AS ENUM ('IN', 'OUT');

CREATE TABLE checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  type checkin_type NOT NULL,
  created_by UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  modified_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_checkins_employee_id ON checkins(employee_id);
CREATE INDEX idx_checkins_site_id ON checkins(site_id);
CREATE INDEX idx_checkins_timestamp ON checkins(timestamp);
CREATE INDEX idx_checkins_type ON checkins(type);
CREATE INDEX idx_checkins_employee_timestamp ON checkins(employee_id, timestamp DESC);

-- ============================================
-- TABLE: AuditLog (Compliance & Audit Trail)
-- ============================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action VARCHAR(50) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  user_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for compliance queries
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);

-- ============================================
-- TEST DATA: Clients
-- ============================================
INSERT INTO clients (id, name, email, plan) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Dataxiom MVP', 'dataxiom@example.com', 'starter'),
  ('550e8400-e29b-41d4-a716-446655440002', 'Retail Chain Alpha', 'alpha@retailchain.it', 'starter'),
  ('550e8400-e29b-41d4-a716-446655440003', 'SuperMarket Beta', 'beta@supermarket.it', 'starter');

-- ============================================
-- TEST DATA: Sites
-- ============================================
INSERT INTO sites (id, client_id, name, location, qr_code_content) VALUES
  ('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', 'Milano Store', 'Via Torino, 50 - Milano', 'QR_BADGE_MILANO_001'),
  ('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440001', 'Roma Store', 'Via Veneto, 100 - Roma', 'QR_BADGE_ROMA_001'),
  ('550e8400-e29b-41d4-a716-446655440012', '550e8400-e29b-41d4-a716-446655440001', 'Torino Store', 'Corso Vittorio, 250 - Torino', 'QR_BADGE_TORINO_001'),
  ('550e8400-e29b-41d4-a716-446655440013', '550e8400-e29b-41d4-a716-446655440002', 'Palermo Location', 'Via Maqueda, 75 - Palermo', 'QR_BADGE_PALERMO_001'),
  ('550e8400-e29b-41d4-a716-446655440014', '550e8400-e29b-41d4-a716-446655440002', 'Catania Location', 'Corso Italia, 120 - Catania', 'QR_BADGE_CATANIA_001');

-- ============================================
-- TEST DATA: Employees (20 records)
-- ============================================
INSERT INTO employees (id, client_id, email, name, phone, assigned_sites) VALUES
  ('550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440001', 'marco.rossi@employee.it', 'Marco Rossi', '+39 3401234567', ARRAY['550e8400-e29b-41d4-a716-446655440010'::uuid, '550e8400-e29b-41d4-a716-446655440011'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440001', 'giulia.bianchi@employee.it', 'Giulia Bianchi', '+39 3401234568', ARRAY['550e8400-e29b-41d4-a716-446655440010'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440001', 'luca.verdi@employee.it', 'Luca Verdi', '+39 3401234569', ARRAY['550e8400-e29b-41d4-a716-446655440011'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440001', 'alice.neri@employee.it', 'Alice Neri', '+39 3401234570', ARRAY['550e8400-e29b-41d4-a716-446655440012'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440104', '550e8400-e29b-41d4-a716-446655440001', 'carlo.rossi@employee.it', 'Carlo Rossi', '+39 3401234571', ARRAY['550e8400-e29b-41d4-a716-446655440012'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440105', '550e8400-e29b-41d4-a716-446655440001', 'sara.gallo@employee.it', 'Sara Gallo', '+39 3401234572', ARRAY['550e8400-e29b-41d4-a716-446655440010'::uuid, '550e8400-e29b-41d4-a716-446655440011'::uuid, '550e8400-e29b-41d4-a716-446655440012'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440106', '550e8400-e29b-41d4-a716-446655440001', 'davide.franco@employee.it', 'Davide Franco', '+39 3401234573', ARRAY['550e8400-e29b-41d4-a716-446655440010'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440107', '550e8400-e29b-41d4-a716-446655440001', 'elena.costa@employee.it', 'Elena Costa', '+39 3401234574', ARRAY['550e8400-e29b-41d4-a716-446655440011'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440108', '550e8400-e29b-41d4-a716-446655440002', 'giovanni.marino@employee.it', 'Giovanni Marino', '+39 3401234575', ARRAY['550e8400-e29b-41d4-a716-446655440013'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440109', '550e8400-e29b-41d4-a716-446655440002', 'valentina.moretti@employee.it', 'Valentina Moretti', '+39 3401234576', ARRAY['550e8400-e29b-41d4-a716-446655440013'::uuid, '550e8400-e29b-41d4-a716-446655440014'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440110', '550e8400-e29b-41d4-a716-446655440002', 'fabio.rizzo@employee.it', 'Fabio Rizzo', '+39 3401234577', ARRAY['550e8400-e29b-41d4-a716-446655440014'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440111', '550e8400-e29b-41d4-a716-446655440002', 'martina.gera@employee.it', 'Martina Gera', '+39 3401234578', ARRAY['550e8400-e29b-41d4-a716-446655440013'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440112', '550e8400-e29b-41d4-a716-446655440003', 'tommaso.leone@employee.it', 'Tommaso Leone', '+39 3401234579', ARRAY['550e8400-e29b-41d4-a716-446655440010'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440113', '550e8400-e29b-41d4-a716-446655440003', 'francesca.villa@employee.it', 'Francesca Villa', '+39 3401234580', ARRAY['550e8400-e29b-41d4-a716-446655440010'::uuid, '550e8400-e29b-41d4-a716-446655440011'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440114', '550e8400-e29b-41d4-a716-446655440003', 'antonio.gallo@employee.it', 'Antonio Gallo', '+39 3401234581', ARRAY['550e8400-e29b-41d4-a716-446655440012'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440115', '550e8400-e29b-41d4-a716-446655440003', 'isabella.rossi@employee.it', 'Isabella Rossi', '+39 3401234582', ARRAY['550e8400-e29b-41d4-a716-446655440011'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440116', '550e8400-e29b-41d4-a716-446655440001', 'paolo.sordo@employee.it', 'Paolo Sordo', '+39 3401234583', ARRAY['550e8400-e29b-41d4-a716-446655440012'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440117', '550e8400-e29b-41d4-a716-446655440002', 'roberta.fio@employee.it', 'Roberta Fio', '+39 3401234584', ARRAY['550e8400-e29b-41d4-a716-446655440014'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440118', '550e8400-e29b-41d4-a716-446655440003', 'samuel.mora@employee.it', 'Samuel Mora', '+39 3401234585', ARRAY['550e8400-e29b-41d4-a716-446655440010'::uuid]),
  ('550e8400-e29b-41d4-a716-446655440119', '550e8400-e29b-41d4-a716-446655440001', 'renato.forte@employee.it', 'Renato Forte', '+39 3401234586', ARRAY['550e8400-e29b-41d4-a716-446655440011'::uuid]);

-- ============================================
-- TEST DATA: CheckIns (40 records - multiple per employee)
-- ============================================
INSERT INTO checkins (id, employee_id, site_id, timestamp, type, created_by) VALUES
  -- Marco Rossi (550e8400-e29b-41d4-a716-446655440100)
  ('650e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440010', '2026-05-31 08:00:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440100'),
  ('650e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440010', '2026-05-31 17:00:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440100'),
  ('650e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440010', '2026-06-01 08:15:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440100'),
  ('650e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440010', '2026-06-01 17:30:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440100'),
  -- Giulia Bianchi
  ('650e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440010', '2026-05-31 07:45:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440101'),
  ('650e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440010', '2026-05-31 17:15:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440101'),
  ('650e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440010', '2026-06-01 08:00:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440101'),
  ('650e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440010', '2026-06-01 17:45:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440101'),
  -- Luca Verdi
  ('650e8400-e29b-41d4-a716-446655440009', '550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440011', '2026-05-31 09:00:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440102'),
  ('650e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440011', '2026-05-31 18:00:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440102'),
  ('650e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440011', '2026-06-01 09:30:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440102'),
  ('650e8400-e29b-41d4-a716-446655440012', '550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440011', '2026-06-01 18:15:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440102'),
  -- Alice Neri
  ('650e8400-e29b-41d4-a716-446655440013', '550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440012', '2026-05-31 08:30:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440103'),
  ('650e8400-e29b-41d4-a716-446655440014', '550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440012', '2026-05-31 16:45:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440103'),
  ('650e8400-e29b-41d4-a716-446655440015', '550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440012', '2026-06-01 08:45:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440103'),
  -- Carlo Rossi
  ('650e8400-e29b-41d4-a716-446655440016', '550e8400-e29b-41d4-a716-446655440104', '550e8400-e29b-41d4-a716-446655440012', '2026-05-31 08:00:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440104'),
  ('650e8400-e29b-41d4-a716-446655440017', '550e8400-e29b-41d4-a716-446655440104', '550e8400-e29b-41d4-a716-446655440012', '2026-05-31 17:30:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440104'),
  -- Sara Gallo (multi-site)
  ('650e8400-e29b-41d4-a716-446655440018', '550e8400-e29b-41d4-a716-446655440105', '550e8400-e29b-41d4-a716-446655440010', '2026-05-31 07:30:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440105'),
  ('650e8400-e29b-41d4-a716-446655440019', '550e8400-e29b-41d4-a716-446655440105', '550e8400-e29b-41d4-a716-446655440010', '2026-05-31 12:00:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440105'),
  ('650e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440105', '550e8400-e29b-41d4-a716-446655440011', '2026-05-31 12:15:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440105'),
  ('650e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440105', '550e8400-e29b-41d4-a716-446655440011', '2026-05-31 17:00:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440105'),
  -- Davide Franco
  ('650e8400-e29b-41d4-a716-446655440022', '550e8400-e29b-41d4-a716-446655440106', '550e8400-e29b-41d4-a716-446655440010', '2026-05-31 09:00:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440106'),
  ('650e8400-e29b-41d4-a716-446655440023', '550e8400-e29b-41d4-a716-446655440106', '550e8400-e29b-41d4-a716-446655440010', '2026-05-31 17:45:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440106'),
  -- Elena Costa
  ('650e8400-e29b-41d4-a716-446655440024', '550e8400-e29b-41d4-a716-446655440107', '550e8400-e29b-41d4-a716-446655440011', '2026-05-31 08:15:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440107'),
  ('650e8400-e29b-41d4-a716-446655440025', '550e8400-e29b-41d4-a716-446655440107', '550e8400-e29b-41d4-a716-446655440011', '2026-05-31 17:00:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440107'),
  ('650e8400-e29b-41d4-a716-446655440026', '550e8400-e29b-41d4-a716-446655440107', '550e8400-e29b-41d4-a716-446655440011', '2026-06-01 08:30:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440107'),
  -- Giovanni Marino (Client 2)
  ('650e8400-e29b-41d4-a716-446655440027', '550e8400-e29b-41d4-a716-446655440108', '550e8400-e29b-41d4-a716-446655440013', '2026-05-31 08:00:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440108'),
  ('650e8400-e29b-41d4-a716-446655440028', '550e8400-e29b-41d4-a716-446655440108', '550e8400-e29b-41d4-a716-446655440013', '2026-05-31 17:30:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440108'),
  -- Valentina Moretti (multi-site)
  ('650e8400-e29b-41d4-a716-446655440029', '550e8400-e29b-41d4-a716-446655440109', '550e8400-e29b-41d4-a716-446655440013', '2026-05-31 07:45:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440109'),
  ('650e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440109', '550e8400-e29b-41d4-a716-446655440013', '2026-05-31 14:00:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440109'),
  ('650e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440109', '550e8400-e29b-41d4-a716-446655440014', '2026-05-31 14:30:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440109'),
  ('650e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440109', '550e8400-e29b-41d4-a716-446655440014', '2026-05-31 17:00:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440109'),
  -- Fabio Rizzo
  ('650e8400-e29b-41d4-a716-446655440033', '550e8400-e29b-41d4-a716-446655440110', '550e8400-e29b-41d4-a716-446655440014', '2026-05-31 09:00:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440110'),
  ('650e8400-e29b-41d4-a716-446655440034', '550e8400-e29b-41d4-a716-446655440110', '550e8400-e29b-41d4-a716-446655440014', '2026-05-31 17:45:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440110'),
  -- Martina Gera
  ('650e8400-e29b-41d4-a716-446655440035', '550e8400-e29b-41d4-a716-446655440111', '550e8400-e29b-41d4-a716-446655440013', '2026-05-31 08:30:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440111'),
  ('650e8400-e29b-41d4-a716-446655440036', '550e8400-e29b-41d4-a716-446655440111', '550e8400-e29b-41d4-a716-446655440013', '2026-05-31 16:45:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440111'),
  -- Tommaso Leone (Client 3)
  ('650e8400-e29b-41d4-a716-446655440037', '550e8400-e29b-41d4-a716-446655440112', '550e8400-e29b-41d4-a716-446655440010', '2026-05-31 08:00:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440112'),
  ('650e8400-e29b-41d4-a716-446655440038', '550e8400-e29b-41d4-a716-446655440112', '550e8400-e29b-41d4-a716-446655440010', '2026-05-31 17:15:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440112'),
  -- Francesca Villa
  ('650e8400-e29b-41d4-a716-446655440039', '550e8400-e29b-41d4-a716-446655440113', '550e8400-e29b-41d4-a716-446655440010', '2026-05-31 07:30:00+02', 'IN', '550e8400-e29b-41d4-a716-446655440113'),
  ('650e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440113', '550e8400-e29b-41d4-a716-446655440011', '2026-05-31 17:00:00+02', 'OUT', '550e8400-e29b-41d4-a716-446655440113');

-- ============================================
-- TEST DATA: AuditLog (20 records)
-- ============================================
INSERT INTO audit_log (id, action, entity, entity_id, old_value, new_value, user_id) VALUES
  ('750e8400-e29b-41d4-a716-446655440001', 'CREATE', 'client', '550e8400-e29b-41d4-a716-446655440001', NULL, '{"name":"Dataxiom MVP","email":"dataxiom@example.com"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440002', 'CREATE', 'site', '550e8400-e29b-41d4-a716-446655440010', NULL, '{"name":"Milano Store","location":"Via Torino, 50"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440003', 'CREATE', 'employee', '550e8400-e29b-41d4-a716-446655440100', NULL, '{"name":"Marco Rossi","email":"marco.rossi@employee.it"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440004', 'CREATE', 'checkin', '650e8400-e29b-41d4-a716-446655440001', NULL, '{"type":"IN","timestamp":"2026-05-31T08:00:00Z"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440005', 'CREATE', 'checkin', '650e8400-e29b-41d4-a716-446655440002', NULL, '{"type":"OUT","timestamp":"2026-05-31T17:00:00Z"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440006', 'UPDATE', 'checkin', '650e8400-e29b-41d4-a716-446655440001', '{"timestamp":"2026-05-31T08:00:00Z"}', '{"timestamp":"2026-05-31T08:02:00Z"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440007', 'CREATE', 'employee', '550e8400-e29b-41d4-a716-446655440101', NULL, '{"name":"Giulia Bianchi","email":"giulia.bianchi@employee.it"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440008', 'CREATE', 'site', '550e8400-e29b-41d4-a716-446655440011', NULL, '{"name":"Roma Store","location":"Via Veneto, 100"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440009', 'CREATE', 'site', '550e8400-e29b-41d4-a716-446655440012', NULL, '{"name":"Torino Store","location":"Corso Vittorio, 250"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440010', 'CREATE', 'checkin', '650e8400-e29b-41d4-a716-446655440005', NULL, '{"type":"IN","timestamp":"2026-05-31T07:45:00Z"}', '550e8400-e29b-41d4-a716-446655440101'),
  ('750e8400-e29b-41d4-a716-446655440011', 'CREATE', 'client', '550e8400-e29b-41d4-a716-446655440002', NULL, '{"name":"Retail Chain Alpha","email":"alpha@retailchain.it"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440012', 'CREATE', 'employee', '550e8400-e29b-41d4-a716-446655440108', NULL, '{"name":"Giovanni Marino","email":"giovanni.marino@employee.it"}', '550e8400-e29b-41d4-a716-446655440108'),
  ('750e8400-e29b-41d4-a716-446655440013', 'CREATE', 'site', '550e8400-e29b-41d4-a716-446655440013', NULL, '{"name":"Palermo Location","location":"Via Maqueda, 75"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440014', 'UPDATE', 'employee', '550e8400-e29b-41d4-a716-446655440100', '{"phone":null}', '{"phone":"+39 3401234567"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440015', 'CREATE', 'checkin', '650e8400-e29b-41d4-a716-446655440009', NULL, '{"type":"IN","timestamp":"2026-05-31T09:00:00Z"}', '550e8400-e29b-41d4-a716-446655440102'),
  ('750e8400-e29b-41d4-a716-446655440016', 'CREATE', 'client', '550e8400-e29b-41d4-a716-446655440003', NULL, '{"name":"SuperMarket Beta","email":"beta@supermarket.it"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440017', 'UPDATE', 'checkin', '650e8400-e29b-41d4-a716-446655440010', '{"timestamp":"2026-05-31T18:00:00Z"}', '{"timestamp":"2026-05-31T17:55:00Z"}', '550e8400-e29b-41d4-a716-446655440102'),
  ('750e8400-e29b-41d4-a716-446655440018', 'CREATE', 'employee', '550e8400-e29b-41d4-a716-446655440103', NULL, '{"name":"Alice Neri","email":"alice.neri@employee.it"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440019', 'CREATE', 'employee', '550e8400-e29b-41d4-a716-446655440104', NULL, '{"name":"Carlo Rossi","email":"carlo.rossi@employee.it"}', '550e8400-e29b-41d4-a716-446655440100'),
  ('750e8400-e29b-41d4-a716-446655440020', 'UPDATE', 'site', '550e8400-e29b-41d4-a716-446655440010', '{"location":"Via Torino, 50 - Milano"}', '{"location":"Via Torino, 50 - Milano (Updated)"}', '550e8400-e29b-41d4-a716-446655440100');

-- ============================================
-- TABLE: Shifts (Planning/Scheduling)
-- ============================================
CREATE TABLE shifts (
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

-- Indexes for common queries
CREATE INDEX idx_shifts_client_id ON shifts(client_id);
CREATE INDEX idx_shifts_site_id ON shifts(site_id);
CREATE INDEX idx_shifts_client_site_month ON shifts(client_id, site_id, month, year);

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

CREATE INDEX idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_date_range ON leave_requests(start_date, end_date);

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

CREATE INDEX idx_leave_saldi_user_year ON leave_saldi(user_id, year);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Uncomment to verify schema creation
-- SELECT version();
-- \dt
-- \di
-- SELECT COUNT(*) as client_count FROM clients;
-- SELECT COUNT(*) as employee_count FROM employees;
-- SELECT COUNT(*) as checkin_count FROM checkins;
-- SELECT COUNT(*) as audit_count FROM audit_log;
-- SELECT COUNT(*) as shifts_count FROM shifts;
-- SELECT COUNT(*) as leaves_count FROM leaves;
-- SELECT COUNT(*) as leave_requests_count FROM leave_requests;
-- SELECT COUNT(*) as leave_saldi_count FROM leave_saldi;
