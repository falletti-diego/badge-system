'use strict';

const ExcelJS = require('exceljs');

const DIP_HEADERS = ['nome_completo', 'email', 'telefono', 'ruolo', 'sede', 'matricola', 'stato', 'data_assunzione', 'data_uscita', 'manager_email'];
const SEDI_HEADERS = ['nome_sede', 'indirizzo', 'latitudine', 'longitudine', 'raggio_geofence_m'];
const ROLE_LABEL = { employee: 'dipendente', manager: 'responsabile' };

async function generateTemplate({ employees, sites }) {
  const wb = new ExcelJS.Workbook();

  const wsDip = wb.addWorksheet('Dipendenti');
  wsDip.addRow(DIP_HEADERS);
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));
  const managerEmailById = new Map(
    employees.filter((e) => e.role === 'manager').map((e) => [e.id, e.email])
  );
  for (const e of employees) {
    // site_id è popolato solo per i manager (campo "Sede gestita" in Admin);
    // un employee ordinario ha invece assigned_sites[] — usa il primo come
    // "sede corrente" per il template, coerente col fatto che il wizard
    // gestisce una sola sede per riga (sostituzione, non merge, sui trasferimenti).
    const primarySiteId = e.site_id || (e.assigned_sites && e.assigned_sites[0]) || null;
    wsDip.addRow([
      e.name, e.email, e.phone || '', ROLE_LABEL[e.role] || 'dipendente',
      siteNameById.get(primarySiteId) || '', e.external_employee_id || '',
      'Attivo', e.hiring_date || '', '',
      e.manager_id ? (managerEmailById.get(e.manager_id) || '') : '',
    ]);
  }

  const wsSedi = wb.addWorksheet('Sedi');
  wsSedi.addRow(SEDI_HEADERS);
  for (const s of sites) {
    wsSedi.addRow([s.name, s.location || '', s.latitude || '', s.longitude || '', s.geofence_radius_meters || '']);
  }

  return wb.xlsx.writeBuffer();
}

module.exports = { generateTemplate };
