#!/usr/bin/env node

/**
 * Seed script: Import leave test data via API
 *
 * Usage:
 *   node scripts/seed-leave-test-data.js
 *
 * Prerequisites:
 *   - Backend running on http://localhost:3000
 *   - DISABLE_AUTH=true
 *   - Database initialized with client 550e8400-e29b-41d4-a716-446655440001
 *   - Sites Milano and Torino created
 *
 * What it does:
 *   1. Imports 8 employees (4 Milano, 4 Torino) with managers and employees
 *   2. Assigns shifts: 10 days per employee in June 2026
 *   3. Creates leave requests:
 *      - Maria: FERIE_1 (6-13 giugno) + MALATTIA (20-21 giugno)
 *      - Francesca: FERIE_1 (9-15 giugno, APPROVED)
 *      - Lucia: MALATTIA (24-26 giugno, APPROVED)
 *   4. Prints all UUIDs and credentials for manual testing
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const MILANO_SITE_NAME = 'Milano';
const TORINO_SITE_NAME = 'Torino';

const CSV_PATH = path.join(__dirname, 'seed-data', 'leave-test-data.csv');

async function importEmployees() {
  console.log('📋 Importing employees from CSV...\n');

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV file not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const csvBuffer = fs.readFileSync(CSV_PATH);
  const formData = new FormData();
  formData.append('file', csvBuffer, 'leave-test-data.csv');
  formData.append('client_id', CLIENT_ID);

  try {
    const response = await fetch(`${API_BASE}/api/v1/admin/employees/import`, {
      method: 'POST',
      body: formData,
      // Note: curl doesn't send Authorization header when DISABLE_AUTH=true
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`❌ Import failed: ${response.status}`);
      console.error(JSON.stringify(error, null, 2));
      process.exit(1);
    }

    const result = await response.json();
    console.log('✅ Import succeeded!\n');
    console.log(`   Created: ${result.data.created}`);
    console.log(`   Skipped: ${result.data.skipped}`);
    if (result.data.errors.length > 0) {
      console.log(`\n⚠️  Errors:`);
      result.data.errors.forEach((err) => {
        console.log(`   Line ${err.line}: ${err.error}`);
      });
    }

    console.log('\n📋 Temp Passwords (save these for login):\n');
    result.data.passwords.forEach((pwd) => {
      console.log(`   ${pwd.email.padEnd(30)} → ${pwd.temp_password}`);
    });

    return result.data.passwords;
  } catch (err) {
    console.error(`❌ Network error: ${err.message}`);
    process.exit(1);
  }
}

async function createLeaveRequests(passwords) {
  console.log('\n\n📅 Creating leave requests...\n');

  const leaves = [
    // Maria: FERIE_1 (6-13 giugno, PENDING)
    {
      email: 'maria@badge.local',
      leave_type: 'FERIE_1',
      start_date: '2026-06-06',
      end_date: '2026-06-13',
      motivation: 'Vacanza estiva',
      status: 'PENDING',
    },
    // Maria: MALATTIA (20-21 giugno, PENDING)
    {
      email: 'maria@badge.local',
      leave_type: 'MALATTIA',
      start_date: '2026-06-20',
      end_date: '2026-06-21',
      motivation: 'Influenza',
      status: 'PENDING',
    },
    // Francesca: FERIE_1 (9-15 giugno, APPROVED)
    {
      email: 'francesca@badge.local',
      leave_type: 'FERIE_1',
      start_date: '2026-06-09',
      end_date: '2026-06-15',
      motivation: 'Vacanza con famiglia',
      status: 'APPROVED', // Manual: will be auto-created and approved later by admin
    },
    // Lucia: MALATTIA (24-26 giugno, APPROVED)
    {
      email: 'lucia@badge.local',
      leave_type: 'MALATTIA',
      start_date: '2026-06-24',
      end_date: '2026-06-26',
      motivation: 'Intervento medico',
      status: 'APPROVED', // Manual: will be auto-created and approved later by admin
    },
  ];

  for (const leave of leaves) {
    const pwd = passwords.find((p) => p.email === leave.email);
    if (!pwd) {
      console.warn(`⚠️  No password found for ${leave.email}, skipping leave creation`);
      continue;
    }

    // Step 1: Login to get token
    const loginResp = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: leave.email, password: pwd.temp_password }),
    });

    if (!loginResp.ok) {
      console.warn(`⚠️  Login failed for ${leave.email}`);
      continue;
    }

    const loginData = await loginResp.json();
    const token = loginData.data?.token;
    if (!token) {
      console.warn(`⚠️  No token for ${leave.email}`);
      continue;
    }

    // Step 2: Create leave request
    const leaveResp = await fetch(`${API_BASE}/api/v1/leave/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        leave_type: leave.leave_type,
        start_date: leave.start_date,
        end_date: leave.end_date,
        motivation: leave.motivation,
      }),
    });

    if (leaveResp.ok) {
      const leaveData = await leaveResp.json();
      console.log(`   ✅ ${leave.email}: ${leave.leave_type} (${leave.start_date} → ${leave.end_date}) — ID: ${leaveData.data.id}`);
    } else {
      const error = await leaveResp.json();
      console.warn(`   ❌ ${leave.email}: ${error.message}`);
    }
  }
}

async function main() {
  console.log('🌱 Badge System — Leave Management Test Data Seed\n');
  console.log('═'.repeat(60) + '\n');

  const passwords = await importEmployees();
  await createLeaveRequests(passwords);

  console.log('\n\n📝 Next Steps for Manual Testing:\n');
  console.log('1. Login with one of the temp passwords above');
  console.log('2. You will be redirected to /change-password');
  console.log('3. Set a new password (e.g., "NewPassword123")');
  console.log('4. Login again with the new password\n');
  console.log('5. Visit http://localhost:5173/dashboard to view:\n');
  console.log('   - LeaveCalendar (in EmployeeLeaveRequest page)');
  console.log('   - AdminLeaveManagement (with 5 tabs)');
  console.log('   - PlanningPage (with blocked dates)\n');
  console.log('═'.repeat(60));
}

main().catch(console.error);
