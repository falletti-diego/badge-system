#!/usr/bin/env node

/**
 * Seed script: Import leave test data via the "Aggiorna Dipendenti" wizard API
 *
 * Usage:
 *   node scripts/seed-leave-test-data.js
 *
 * Prerequisites:
 *   - Backend running on http://localhost:3000
 *   - DISABLE_AUTH=true
 *   - Database initialized with client 550e8400-e29b-41d4-a716-446655440001
 *   - Sites "Milano Store" and "Torino Store" created
 *
 * What it does:
 *   1. Reads scripts/seed-data/leave-test-data.csv and builds an in-memory
 *      xlsx workbook (Dipendenti + Sedi sheets) matching the format expected
 *      by POST /api/v1/admin/employee-sync/apply, then submits it. The
 *      legacy CSV-only /admin/employees/import endpoint was removed in favor
 *      of the Aggiorna Dipendenti wizard (Task 12, employee-sync-wizard).
 *   2. Creates leave requests:
 *      - Maria: FERIE_1 (6-13 giugno) + MALATTIA (20-21 giugno)
 *      - Francesca: FERIE_1 (9-15 giugno, APPROVED)
 *      - Lucia: MALATTIA (24-26 giugno, APPROVED)
 *   3. Prints a summary of the sync result for manual testing
 *
 * Note: temp passwords for newly created employees are no longer returned in
 * the API response (they are sent via welcome email instead), so this script
 * can no longer print them. See importEmployees() below.
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');
const FormData = require('form-data');
const fetch = require('node-fetch');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';

const CSV_PATH = path.join(__dirname, 'seed-data', 'leave-test-data.csv');

function roleToWizardRole(role) {
  return role === 'manager' ? 'responsabile' : 'dipendente';
}

async function buildWorkbookBuffer(csvRows) {
  const wb = new ExcelJS.Workbook();

  const dipSheet = wb.addWorksheet('Dipendenti');
  dipSheet.addRow([
    'nome_completo', 'email', 'telefono', 'ruolo', 'sede',
    'matricola', 'stato', 'data_assunzione', 'data_uscita',
  ]);
  for (const row of csvRows) {
    dipSheet.addRow([
      row.name,
      row.email,
      row.phone,
      roleToWizardRole(row.role),
      row.site_name,
      row.employee_id,
      'Attivo',
      '',
      '',
    ]);
  }

  const sediSheet = wb.addWorksheet('Sedi');
  sediSheet.addRow(['nome_sede', 'indirizzo', 'latitudine', 'longitudine', 'raggio_geofence_m']);
  const siteNames = [...new Set(csvRows.map((r) => r.site_name))];
  for (const siteName of siteNames) {
    sediSheet.addRow([siteName, '', '', '', '']);
  }

  return wb.xlsx.writeBuffer();
}

async function importEmployees() {
  console.log('📋 Syncing employees via Aggiorna Dipendenti wizard...\n');

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV file not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  const csvRows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

  const xlsxBuffer = await buildWorkbookBuffer(csvRows);
  const formData = new FormData();
  formData.append('file', xlsxBuffer, 'seed.xlsx');
  formData.append('client_id', CLIENT_ID);

  try {
    const response = await fetch(`${API_BASE}/api/v1/admin/employee-sync/apply`, {
      method: 'POST',
      body: formData,
      // Note: curl doesn't send Authorization header when DISABLE_AUTH=true
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`❌ Sync failed: ${response.status}`);
      console.error(JSON.stringify(error, null, 2));
      process.exit(1);
    }

    const result = await response.json();
    const { errors, nuovi, riattivati, rimossi, modificati, anomalie, failedEmails } = result.data;

    if (errors.length > 0) {
      console.error(`❌ Sync validation failed:`);
      errors.forEach((err) => console.error(`   ${err}`));
      process.exit(1);
    }

    console.log('✅ Sync succeeded!\n');
    console.log(`   Nuovi: ${nuovi.length}`);
    console.log(`   Riattivati: ${riattivati.length}`);
    console.log(`   Rimossi: ${rimossi.length}`);
    console.log(`   Modificati: ${modificati.length}`);
    console.log(`   Anomalie: ${anomalie.length}`);
    if (failedEmails && failedEmails.length > 0) {
      console.log(`\n⚠️  Welcome email failed for:`);
      failedEmails.forEach((f) => console.log(`   ${f.email}`));
    }

    console.log('\n📋 Password temporanee inviate via email ai nuovi dipendenti (non esposte in questa risposta).\n');
    console.log('   Employees: ' + nuovi.map((n) => n.email).join(', '));

    return nuovi.map((n) => ({ email: n.email }));
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
    if (!pwd || !pwd.temp_password) {
      console.warn(`⚠️  No password available for ${leave.email} (not newly created, or temp password was sent by email only — not returned by the API), skipping leave creation`);
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
  console.log('1. Retrieve a temp password from the welcome email sent to a new employee (or from maria@badge.local via DEMO_MARIA_PASSWORD)');
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
