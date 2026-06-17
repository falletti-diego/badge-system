'use strict';

const ExcelJS = require('exceljs');

const ROLE_MAP = { dipendente: 'employee', responsabile: 'manager' };
const SALDO_COLUMNS = {
  ferie_giorni: 'FERIE_1',
  permessi_giorni: 'FERIE_2',
  exfestivita_giorni: 'FERIE_3',
};

function norm(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function normEmail(v) {
  const s = norm(v);
  return s ? s.toLowerCase() : null;
}
function normInt(v) {
  if (v === null || v === undefined || String(v).trim() === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

// Robustly extract a cell's value across exceljs cell types. A plain value
// (string/number/Date) is returned as-is; object-valued cells — hyperlink
// ({ text, hyperlink }), rich text ({ richText }), formula ({ formula, result }),
// error ({ error }) — fall back to the cell's computed display text, so a
// client who bolds part of a cell or uses a formula doesn't poison the data
// with "[object Object]".
function extractCellValue(cell) {
  if (!cell) return null;
  const v = cell.value;
  if (v !== null && v !== undefined && typeof v === 'object' && !(v instanceof Date)) {
    return cell.text != null ? cell.text : '';
  }
  return v;
}

function readSheet(ws) {
  if (!ws) return [];
  const headers = (ws.getRow(1).values || []).map((h) => (h == null ? '' : String(h).trim()));
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = { _row: rowNumber, _sheet: ws.name };
    let hasValue = false;
    for (let c = 1; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const cell = row.getCell(c);
      const val = extractCellValue(cell);
      if (val !== null && val !== undefined && String(val).trim() !== '') hasValue = true;
      obj[key] = val;
    }
    if (hasValue) rows.push(obj);
  });
  return rows;
}

async function parseWorkbook(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const aziendaRows = readSheet(wb.getWorksheet('Azienda'));
  const sediRows = readSheet(wb.getWorksheet('Sedi'));
  const dipRows = readSheet(wb.getWorksheet('Dipendenti'));

  const a = aziendaRows[0] || {};
  const azienda = {
    ragione_sociale: norm(a.ragione_sociale),
    email_referente: normEmail(a.email_referente),
    ore_min_buono_pasto: a.ore_min_buono_pasto == null || String(a.ore_min_buono_pasto).trim() === ''
      ? null : Number(a.ore_min_buono_pasto),
  };

  const sedi = sediRows.map((s) => ({
    _row: s._row,
    nome_sede: norm(s.nome_sede),
    indirizzo: norm(s.indirizzo),
    latitudine: s.latitudine == null || String(s.latitudine).trim() === '' ? null : Number(s.latitudine),
    longitudine: s.longitudine == null || String(s.longitudine).trim() === '' ? null : Number(s.longitudine),
    raggio_geofence_m: s.raggio_geofence_m == null || String(s.raggio_geofence_m).trim() === ''
      ? null : Number(s.raggio_geofence_m),
  }));

  const dipendenti = dipRows.map((d) => ({
    _row: d._row,
    nome_completo: norm(d.nome_completo),
    email: normEmail(d.email),
    telefono: norm(d.telefono),
    ruolo: (norm(d.ruolo) || '').toLowerCase() || null,
    sede: norm(d.sede),
    matricola: norm(d.matricola),
    ferie_giorni: normInt(d.ferie_giorni),
    permessi_giorni: normInt(d.permessi_giorni),
    exfestivita_giorni: normInt(d.exfestivita_giorni),
  }));

  return { azienda, sedi, dipendenti };
}

module.exports = { parseWorkbook, ROLE_MAP, SALDO_COLUMNS, extractCellValue };
