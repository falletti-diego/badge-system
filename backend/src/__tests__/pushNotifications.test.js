'use strict';

/**
 * Unit tests for utils/pushNotifications.js — mocks `pg` (pool.query) and
 * `expo-server-sdk` directly, same approach as email.test.js for
 * @aws-sdk/client-ses: no existing in-repo pattern for mocking a push
 * provider, so this mirrors the SDK's own shape (a class instance with
 * chunkPushNotifications/sendPushNotificationsAsync).
 */

const mockQuery = jest.fn();
jest.mock('../db/pool', () => ({ pool: { query: (...args) => mockQuery(...args) } }));

const mockSendPushNotificationsAsync = jest.fn();
const mockChunkPushNotifications = jest.fn((messages) => [messages]);
jest.mock('expo-server-sdk', () => ({
  Expo: jest.fn().mockImplementation(() => ({
    chunkPushNotifications: (...args) => mockChunkPushNotifications(...args),
    sendPushNotificationsAsync: (...args) => mockSendPushNotificationsAsync(...args),
  })),
}));

const { notifyEmployee } = require('../utils/pushNotifications');

describe('utils/pushNotifications.notifyEmployee', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockSendPushNotificationsAsync.mockReset();
    mockChunkPushNotifications.mockClear();
  });

  it('always inserts the in-app notification row, awaited', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO notifications
      .mockResolvedValueOnce({ rows: [] }); // SELECT token lookup (no devices)

    await notifyEmployee({
      employeeId: 'emp-1',
      clientId: 'client-1',
      type: 'leave_approved',
      inAppMessage: 'Richiesta ferie dal 1 al 5 settembre approvata.',
      pushTitle: 'Richiesta ferie',
      pushBody: 'La tua richiesta è stata approvata. Apri l\'app per i dettagli.',
    });

    expect(mockQuery).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining(['emp-1', 'client-1', 'leave_approved', 'Richiesta ferie dal 1 al 5 settembre approvata.'])
    );
  });

  it('does not call Expo at all when the employee has no registered device', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // no tokens

    await notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'x', pushTitle: 'x', pushBody: 'x',
    });

    // Let any fire-and-forget microtask drain before asserting a negative.
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it('sends one push message per registered device token, without the caller awaiting it', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ token: 'ExponentPushToken[aaa]' }, { token: 'ExponentPushToken[bbb]' }] });
    mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

    const before = Date.now();
    await notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'Turno aggiornato', pushTitle: 'Turno aggiornato', pushBody: 'Turno aggiornato',
    });
    const elapsed = Date.now() - before;

    // The function must resolve without waiting on the Expo send — proves
    // the fire-and-forget contract (design spec, decisione 12).
    expect(elapsed).toBeLessThan(50);

    await new Promise((resolve) => setImmediate(resolve));
    expect(mockChunkPushNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ to: 'ExponentPushToken[aaa]', title: 'Turno aggiornato', body: 'Turno aggiornato' }),
      expect.objectContaining({ to: 'ExponentPushToken[bbb]', title: 'Turno aggiornato', body: 'Turno aggiornato' }),
    ]);
    expect(mockSendPushNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  it('never throws when the in-app INSERT itself fails (best-effort, same contract as shifts.js today)', async () => {
    mockQuery
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ rows: [] }); // token lookup should still run normally

    await expect(notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'x', pushTitle: 'x', pushBody: 'x',
    })).resolves.toBeUndefined();
  });

  it('never throws when Expo send rejects (fire-and-forget catch, does not surface to caller or as unhandled rejection)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ token: 'ExponentPushToken[aaa]' }] });
    mockSendPushNotificationsAsync.mockRejectedValue(new Error('Expo down'));

    await expect(notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'x', pushTitle: 'x', pushBody: 'x',
    })).resolves.toBeUndefined();

    await new Promise((resolve) => setImmediate(resolve));
    // No assertion needed beyond "test process didn't crash from an unhandled
    // rejection" — Jest fails the run on those automatically.
  });

  it('scopes the token lookup to both employee_id AND client_id (tenant isolation)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'x', pushTitle: 'x', pushBody: 'x',
    });

    expect(mockQuery).toHaveBeenNthCalledWith(2,
      expect.stringContaining('WHERE employee_id = $1::uuid AND client_id = $2::uuid'),
      ['emp-1', 'client-1']
    );
  });

  it('filters out a malformed token before calling Expo (never sends garbage upstream)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ token: 'not-a-real-expo-token' }, { token: 'ExponentPushToken[valid]' }] });
    mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

    await notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'x', pushTitle: 'x', pushBody: 'x',
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockChunkPushNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ to: 'ExponentPushToken[valid]' }),
    ]);
  });

  it('skips the Expo call entirely when every registered token is malformed', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ token: 'garbage' }] });

    await notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'x', pushTitle: 'x', pushBody: 'x',
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it('sends one request per chunk when Expo returns multiple chunks (>100 tokens)', async () => {
    const manyTokens = Array.from({ length: 150 }, (_, i) => ({ token: `ExponentPushToken[t${i}]` }));
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: manyTokens });
    // Real Expo.chunkPushNotifications caps a chunk at 100 messages — simulate
    // that behavior here instead of the default single-chunk mock.
    mockChunkPushNotifications.mockImplementationOnce((messages) => [messages.slice(0, 100), messages.slice(100)]);
    mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

    await notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'x', pushTitle: 'x', pushBody: 'x',
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockSendPushNotificationsAsync).toHaveBeenCalledTimes(2);
  });

  it('passes null shift fields through unchanged for a non-shift notification type (schema compatibility)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'leave_approved',
      inAppMessage: 'x', pushTitle: 'x', pushBody: 'x',
    });

    expect(mockQuery).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO notifications'),
      ['emp-1', 'client-1', 'leave_approved', 'x', null, null, null]
    );
  });
});
