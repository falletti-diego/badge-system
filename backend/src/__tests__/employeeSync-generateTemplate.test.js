const { generateTemplate } = require('../services/employeeSync/generateTemplate');
const ExcelJS = require('exceljs');

describe('generateTemplate — manager_email column', () => {
  it('includes manager_email header and resolves the manager email by manager_id', async () => {
    const employees = [
      { id: 'mgr-1', name: 'Manager Uno', email: 'manager@x.it', role: 'manager', site_id: 'site-1', assigned_sites: [], external_employee_id: null, hiring_date: null, manager_id: null },
      { id: 'emp-1', name: 'Dipendente Uno', email: 'dip@x.it', role: 'employee', site_id: null, assigned_sites: ['site-1'], external_employee_id: null, hiring_date: null, manager_id: 'mgr-1' },
    ];
    const sites = [{ id: 'site-1', name: 'Torino' }];

    const buffer = await generateTemplate({ employees, sites });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('Dipendenti');
    const headers = ws.getRow(1).values.slice(1);
    expect(headers).toContain('manager_email');

    const managerEmailCol = headers.indexOf('manager_email') + 1;
    const dipRow = ws.getRow(3); // riga 1 = header, riga 2 = manager, riga 3 = dipendente
    expect(dipRow.getCell(managerEmailCol).value).toBe('manager@x.it');
  });
});
