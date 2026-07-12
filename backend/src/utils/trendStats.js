'use strict';

/**
 * buildTrendDays()
 *
 * Aggrega dati grezzi (daily hour entries, richieste ferie/malattia) in un
 * bucket per ciascun giorno del range [dateFrom, dateTo] inclusi, per
 * alimentare i grafici trend della Dashboard.
 *
 * Funzione pura: nessuna query DB, tutti i dati sono passati già risolti
 * dal chiamante — testabile in isolamento.
 */

const DAILY_ORDINARY_HOURS = 8;

/**
 * @param {object} params
 * @param {string} params.dateFrom - 'YYYY-MM-DD' incluso
 * @param {string} params.dateTo - 'YYYY-MM-DD' incluso
 * @param {Array<{employee_id: string, date: string, minutes: number|null, presenza_aperta: boolean}>} params.dailyHourEntries
 *   Output di calculateDailyHours() da hours.js
 * @param {Array<string>} params.activeEmployeeIds - id dei dipendenti nello scope (ruolo 'employee')
 * @param {Array<{user_id: string, start_date: string, end_date: string}>} params.leaveRows
 *   Righe leave_requests con status='APPROVED', date già castate a testo ('YYYY-MM-DD')
 * @param {Array<{employee_id: string, start_date: string, end_date: string}>} params.illnessRows
 *   Righe illnesses non cancellate, date già castate a testo ('YYYY-MM-DD')
 * @returns {Array<{date: string, presenze: number, ore_lavorate: number, ore_straordinarie: number, assenteismo_pct: number}>}
 */
function buildTrendDays({ dateFrom, dateTo, dailyHourEntries, activeEmployeeIds, leaveRows, illnessRows }) {
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const to = new Date(`${dateTo}T00:00:00.000Z`);
  const dayCount = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;

  const activeCount = activeEmployeeIds.length;
  const days = [];

  for (let i = 0; i < dayCount; i++) {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);

    const entriesForDay = dailyHourEntries.filter((e) => e.date === dateStr);
    const presenzeSet = new Set(entriesForDay.map((e) => e.employee_id));

    let oreLavorate = 0;
    let oreStraordinarie = 0;
    for (const entry of entriesForDay) {
      if (entry.minutes === null) continue;
      const hours = entry.minutes / 60;
      oreLavorate += hours;
      oreStraordinarie += Math.max(hours - DAILY_ORDINARY_HOURS, 0);
    }

    const absentSet = new Set();
    for (const row of leaveRows) {
      if (row.start_date <= dateStr && row.end_date >= dateStr) absentSet.add(row.user_id);
    }
    for (const row of illnessRows) {
      if (row.start_date <= dateStr && row.end_date >= dateStr) absentSet.add(row.employee_id);
    }

    const assenteismoPct = activeCount === 0 ? 0 : Math.round((absentSet.size / activeCount) * 1000) / 10;

    days.push({
      date: dateStr,
      presenze: presenzeSet.size,
      ore_lavorate: Math.round(oreLavorate * 100) / 100,
      ore_straordinarie: Math.round(oreStraordinarie * 100) / 100,
      assenteismo_pct: assenteismoPct,
    });
  }

  return days;
}

module.exports = { buildTrendDays };
