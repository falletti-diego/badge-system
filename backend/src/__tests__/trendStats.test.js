'use strict';

const { buildTrendDays } = require('../utils/trendStats');

describe('buildTrendDays', () => {
  test('produce un bucket per ogni giorno nel range, anche senza dati', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-03',
      dailyHourEntries: [],
      activeEmployeeIds: ['emp-1', 'emp-2'],
      leaveRows: [],
      illnessRows: [],
    });

    expect(days).toHaveLength(3);
    expect(days.map((d) => d.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(days[0]).toEqual({
      date: '2026-07-01',
      presenze: 0,
      ore_lavorate: 0,
      ore_straordinarie: 0,
      assenteismo_pct: 0,
    });
  });

  test('conta le presenze come dipendenti distinti con almeno un daily entry quel giorno', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [
        { employee_id: 'emp-1', date: '2026-07-01', minutes: 480, presenza_aperta: false },
        { employee_id: 'emp-2', date: '2026-07-01', minutes: 240, presenza_aperta: false },
      ],
      activeEmployeeIds: ['emp-1', 'emp-2'],
      leaveRows: [],
      illnessRows: [],
    });

    expect(days[0].presenze).toBe(2);
    expect(days[0].ore_lavorate).toBe(12); // (480+240)/60
  });

  test('calcola le ore straordinarie oltre le 8 ore giornaliere, sommate su tutti i dipendenti', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [
        { employee_id: 'emp-1', date: '2026-07-01', minutes: 600, presenza_aperta: false }, // 10h -> 2h straord.
        { employee_id: 'emp-2', date: '2026-07-01', minutes: 420, presenza_aperta: false }, // 7h -> 0h straord.
      ],
      activeEmployeeIds: ['emp-1', 'emp-2'],
      leaveRows: [],
      illnessRows: [],
    });

    expect(days[0].ore_straordinarie).toBe(2);
  });

  test('ignora le presenze aperte (minutes null) nel calcolo ore, ma le conta come presenza', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [
        { employee_id: 'emp-1', date: '2026-07-01', minutes: null, presenza_aperta: true },
      ],
      activeEmployeeIds: ['emp-1'],
      leaveRows: [],
      illnessRows: [],
    });

    expect(days[0].presenze).toBe(1);
    expect(days[0].ore_lavorate).toBe(0);
  });

  test('calcola assenteismo_pct come dipendenti assenti (ferie+malattia) / dipendenti attivi', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [],
      activeEmployeeIds: ['emp-1', 'emp-2', 'emp-3', 'emp-4'],
      leaveRows: [{ user_id: 'emp-1', start_date: '2026-06-30', end_date: '2026-07-02' }],
      illnessRows: [{ employee_id: 'emp-2', start_date: '2026-07-01', end_date: '2026-07-01' }],
    });

    expect(days[0].assenteismo_pct).toBe(50); // 2 assenti su 4 attivi
  });

  test('non conta due volte lo stesso dipendente assente sia per ferie sia per malattia', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [],
      activeEmployeeIds: ['emp-1', 'emp-2'],
      leaveRows: [{ user_id: 'emp-1', start_date: '2026-07-01', end_date: '2026-07-01' }],
      illnessRows: [{ employee_id: 'emp-1', start_date: '2026-07-01', end_date: '2026-07-01' }],
    });

    expect(days[0].assenteismo_pct).toBe(50); // emp-1 conta una sola volta su 2 attivi
  });

  test('assenteismo_pct è 0 quando non ci sono dipendenti attivi (nessuna divisione per zero)', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [],
      activeEmployeeIds: [],
      leaveRows: [],
      illnessRows: [],
    });

    expect(days[0].assenteismo_pct).toBe(0);
  });

  test('un intervallo di ferie/malattia fuori dal giorno corrente non conta come assenza', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [],
      activeEmployeeIds: ['emp-1'],
      leaveRows: [{ user_id: 'emp-1', start_date: '2026-06-20', end_date: '2026-06-25' }],
      illnessRows: [],
    });

    expect(days[0].assenteismo_pct).toBe(0);
  });
});
