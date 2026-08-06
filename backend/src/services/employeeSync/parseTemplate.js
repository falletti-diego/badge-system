'use strict';

const ExcelJS = require('exceljs');

function norm(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function normEmail(v) {
  const s = norm(v);
  return s ? s.toLowerCase() : null;
}
function normDate(v) {
  const s = norm(v);
  if (!s) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : s;
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
    const obj = { _row: rowNumber };
    let hasValue = false;
    for (let c = 1; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const val = extractCellValue(row.getCell(c));
      if (val !== null && val !== undefined && String(val).trim() !== '') hasValue = true;
      obj[key] = val;
    }
    if (hasValue) rows.push(obj);
  });
  return rows;
}

async function parseTemplate(fileOrBuffer) {
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(fileOrBuffer)) {
    await wb.xlsx.load(fileOrBuffer);
  } else {
    await wb.xlsx.readFile(fileOrBuffer);
  }

  const dipRows = readSheet(wb.getWorksheet('Dipendenti'));
  const sediRows = readSheet(wb.getWorksheet('Sedi'));

  const dipendenti = dipRows.map((d) => ({
    _row: d._row,
    nome_completo: norm(d.nome_completo),
    email: normEmail(d.email),
    telefono: norm(d.telefono),
    ruolo: (norm(d.ruolo) || '').toLowerCase() || null,
    sede: norm(d.sede),
    matricola: norm(d.matricola),
    stato: (norm(d.stato) || '').toLowerCase() || null,
    data_assunzione: normDate(d.data_assunzione),
    data_uscita: normDate(d.data_uscita),
  }));

  const sedi = sediRows.map((s) => ({
    _row: s._row,
    nome_sede: norm(s.nome_sede),
    indirizzo: norm(s.indirizzo),
    latitudine: s.latitudine == null || String(s.latitudine).trim() === '' ? null : Number(s.latitudine),
    longitudine: s.longitudine == null || String(s.longitudine).trim() === '' ? null : Number(s.longitudine),
    raggio_geofence_m: s.raggio_geofence_m == null || String(s.raggio_geofence_m).trim() === ''
      ? null : Number(s.raggio_geofence_m),
  }));

  return { dipendenti, sedi };
}

module.exports = { parseTemplate, extractCellValue };
