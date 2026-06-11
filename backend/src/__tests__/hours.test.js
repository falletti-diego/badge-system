'use strict';

const { calculateDailyHours, aggregateMonthly } = require('../utils/hours');

const EMP_A = '550e8400-e29b-41d4-a716-446655440001';
const EMP_B = '550e8400-e29b-41d4-a716-446655440002';

function ci(employee_id, isoTs, type) {
  return { employee_id, timestamp: new Date(isoTs), type };
}

describe('calculateDailyHours', () => {
  it('returns [] for empty input', () => {
    expect(calculateDailyHours([])).toEqual([]);
    expect(calculateDailyHours(null)).toEqual([]);
  });

  it('single IN/OUT pair — correct minutes', () => {
    const input = [
      ci(EMP_A, '2026-06-01T08:00:00Z', 'IN'),
      ci(EMP_A, '2026-06-01T16:00:00Z', 'OUT'),
    ];
    const result = calculateDailyHours(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ employee_id: EMP_A, date: '2026-06-01', minutes: 480, presenza_aperta: false });
  });

  it('lunch break — two pairs summed on the same day', () => {
    const input = [
      ci(EMP_A, '2026-06-01T08:00:00Z', 'IN'),
      ci(EMP_A, '2026-06-01T13:00:00Z', 'OUT'),
      ci(EMP_A, '2026-06-01T14:00:00Z', 'IN'),
      ci(EMP_A, '2026-06-01T17:00:00Z', 'OUT'),
    ];
    const result = calculateDailyHours(input);
    expect(result).toHaveLength(1);
    // 5h + 3h = 8h = 480 min
    expect(result[0].minutes).toBe(480);
    expect(result[0].presenza_aperta).toBe(false);
  });

  it('IN without OUT → presenza_aperta = true, minutes = null', () => {
    const input = [ci(EMP_A, '2026-06-01T08:00:00Z', 'IN')];
    const result = calculateDailyHours(input);
    expect(result).toHaveLength(1);
    expect(result[0].presenza_aperta).toBe(true);
    expect(result[0].minutes).toBeNull();
  });

  it('OUT without preceding IN → ignored', () => {
    const input = [ci(EMP_A, '2026-06-01T16:00:00Z', 'OUT')];
    const result = calculateDailyHours(input);
    expect(result).toHaveLength(0);
  });

  it('two days of work — two separate entries', () => {
    const input = [
      ci(EMP_A, '2026-06-01T08:00:00Z', 'IN'),
      ci(EMP_A, '2026-06-01T16:00:00Z', 'OUT'),
      ci(EMP_A, '2026-06-02T09:00:00Z', 'IN'),
      ci(EMP_A, '2026-06-02T17:00:00Z', 'OUT'),
    ];
    const result = calculateDailyHours(input);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2026-06-01');
    expect(result[1].date).toBe('2026-06-02');
  });

  it('two employees — independent pairing', () => {
    const input = [
      ci(EMP_A, '2026-06-01T08:00:00Z', 'IN'),
      ci(EMP_A, '2026-06-01T16:00:00Z', 'OUT'),
      ci(EMP_B, '2026-06-01T09:00:00Z', 'IN'),
      ci(EMP_B, '2026-06-01T18:00:00Z', 'OUT'),
    ];
    const result = calculateDailyHours(input);
    expect(result).toHaveLength(2);
    const a = result.find(r => r.employee_id === EMP_A);
    const b = result.find(r => r.employee_id === EMP_B);
    expect(a.minutes).toBe(480); // 8h
    expect(b.minutes).toBe(540); // 9h
  });

  it('complete pair + open presence on same day', () => {
    // Unusual but possible: IN1→OUT1 then IN2 without OUT2
    const input = [
      ci(EMP_A, '2026-06-01T08:00:00Z', 'IN'),
      ci(EMP_A, '2026-06-01T13:00:00Z', 'OUT'),
      ci(EMP_A, '2026-06-01T14:00:00Z', 'IN'),
      // no OUT2
    ];
    const result = calculateDailyHours(input);
    expect(result).toHaveLength(1);
    expect(result[0].minutes).toBe(300); // 5h from first pair
    expect(result[0].presenza_aperta).toBe(true);
  });
});

describe('aggregateMonthly', () => {
  it('returns empty Map for empty input', () => {
    expect(aggregateMonthly([])).toEqual(new Map());
  });

  it('no overtime below 8h', () => {
    const daily = [{ employee_id: EMP_A, date: '2026-06-01', minutes: 420, presenza_aperta: false }]; // 7h
    const agg = aggregateMonthly(daily, 5.0);
    const e = agg.get(EMP_A);
    expect(e.ore_totali).toBe(7);
    expect(e.ore_ordinarie).toBe(7);
    expect(e.ore_straordinarie).toBe(0);
    expect(e.buoni_pasto).toBe(1); // 7h >= 5h threshold
    expect(e.giorni_presenti).toBe(1);
    expect(e.presenze_aperte).toBe(0);
  });

  it('overtime above 8h', () => {
    const daily = [{ employee_id: EMP_A, date: '2026-06-01', minutes: 570, presenza_aperta: false }]; // 9.5h
    const agg = aggregateMonthly(daily, 5.0);
    const e = agg.get(EMP_A);
    expect(e.ore_totali).toBe(9.5);
    expect(e.ore_ordinarie).toBe(8);
    expect(e.ore_straordinarie).toBe(1.5);
  });

  it('open presence: counted in giorni_presenti and presenze_aperte, no hours', () => {
    const daily = [{ employee_id: EMP_A, date: '2026-06-01', minutes: null, presenza_aperta: true }];
    const agg = aggregateMonthly(daily, 5.0);
    const e = agg.get(EMP_A);
    expect(e.ore_totali).toBe(0);
    expect(e.buoni_pasto).toBe(0);
    expect(e.giorni_presenti).toBe(1);
    expect(e.presenze_aperte).toBe(1);
  });

  it('no meal voucher below threshold', () => {
    const daily = [{ employee_id: EMP_A, date: '2026-06-01', minutes: 240, presenza_aperta: false }]; // 4h < 5h threshold
    const agg = aggregateMonthly(daily, 5.0);
    expect(agg.get(EMP_A).buoni_pasto).toBe(0);
  });

  it('multi-day aggregation', () => {
    const daily = [
      { employee_id: EMP_A, date: '2026-06-01', minutes: 480, presenza_aperta: false }, // 8h
      { employee_id: EMP_A, date: '2026-06-02', minutes: 480, presenza_aperta: false }, // 8h
      { employee_id: EMP_A, date: '2026-06-03', minutes: 540, presenza_aperta: false }, // 9h
    ];
    const agg = aggregateMonthly(daily, 5.0);
    const e = agg.get(EMP_A);
    expect(e.ore_totali).toBe(25);
    expect(e.ore_ordinarie).toBe(24);
    expect(e.ore_straordinarie).toBe(1);
    expect(e.buoni_pasto).toBe(3);
    expect(e.giorni_presenti).toBe(3);
  });
});
