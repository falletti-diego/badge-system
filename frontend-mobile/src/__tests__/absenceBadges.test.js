import { resolveAbsenceBadge, ABSENCE_BADGES } from '../utils/absenceBadges';

describe('resolveAbsenceBadge', () => {
  test('returns null when a shift is already assigned, even if an illness covers the date', () => {
    const illnesses = [{ start_date: '2026-09-05T00:00:00.000Z', end_date: '2026-09-05T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-05', 'm', illnesses, [], [])).toBeNull();
  });

  test('returns the illness badge when an illness date range covers the date', () => {
    const illnesses = [{ start_date: '2026-08-31T00:00:00.000Z', end_date: '2026-09-05T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-04', null, illnesses, [], [])).toEqual(ABSENCE_BADGES.illness);
  });

  test('returns null for a date just outside an illness range (boundary check)', () => {
    const illnesses = [{ start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-05T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-03', null, illnesses, [], [])).toBeNull();
    expect(resolveAbsenceBadge('2026-09-06', null, illnesses, [], [])).toBeNull();
  });

  test('illness takes priority over an approved leave on the same date', () => {
    const illnesses = [{ start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    const leaves = [{ status: 'APPROVED', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-04', null, illnesses, leaves, [])).toEqual(ABSENCE_BADGES.illness);
  });

  test('returns the approved leave badge when no illness covers the date', () => {
    const leaves = [{ status: 'APPROVED', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-06T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-05', null, [], leaves, [])).toEqual(ABSENCE_BADGES.leaveApproved);
  });

  test('returns the pending leave badge (distinct label) when the leave is not yet approved', () => {
    const leaves = [{ status: 'PENDING', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], leaves, [])).toEqual(ABSENCE_BADGES.leavePending);
  });

  test('a REJECTED leave does not produce a badge', () => {
    const leaves = [{ status: 'REJECTED', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], leaves, [])).toBeNull();
  });

  test('a WITHDRAWN leave does not produce a badge', () => {
    const leaves = [{ status: 'WITHDRAWN', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], leaves, [])).toBeNull();
  });

  test('leave takes priority over an approved event on the same date', () => {
    const leaves = [{ status: 'APPROVED', start_date: '2026-09-04T00:00:00.000Z', end_date: '2026-09-04T00:00:00.000Z' }];
    const events = [{ status: 'APPROVED', event_date: '2026-09-04' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], leaves, events)).toEqual(ABSENCE_BADGES.leaveApproved);
  });

  test('returns the approved event badge when no illness or leave covers the date', () => {
    const events = [{ status: 'APPROVED', event_date: '2026-09-04' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], [], events)).toEqual(ABSENCE_BADGES.eventApproved);
  });

  test('returns the pending event badge (distinct label) when the event is not yet approved', () => {
    const events = [{ status: 'PENDING', event_date: '2026-09-04' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], [], events)).toEqual(ABSENCE_BADGES.eventPending);
  });

  test('a REJECTED event does not produce a badge', () => {
    const events = [{ status: 'REJECTED', event_date: '2026-09-04' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], [], events)).toBeNull();
  });

  test('returns null when no absence covers the date', () => {
    expect(resolveAbsenceBadge('2026-09-04', null, [], [], [])).toBeNull();
  });

  test('normalizes a plain YYYY-MM-DD event_date (already ::text-cast server-side) the same as an ISO-datetime illness/leave date', () => {
    // illnesses.start_date/end_date and leave_requests.start_date/end_date have
    // no ::text cast server-side, so node-postgres's default DATE parser turns
    // them into a JS Date object which JSON.stringify serializes as a full ISO
    // datetime string (e.g. "2026-09-04T00:00:00.000Z"). events.js's event_date
    // IS explicitly cast (::text), so it arrives as a plain "2026-09-04"
    // already. Both must resolve to the same calendar day.
    const events = [{ status: 'APPROVED', event_date: '2026-09-04' }];
    expect(resolveAbsenceBadge('2026-09-04', null, [], [], events)).toEqual(ABSENCE_BADGES.eventApproved);
  });
});
