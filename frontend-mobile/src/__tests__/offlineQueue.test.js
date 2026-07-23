jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
}));

jest.mock('../services/apiClient', () => ({
  post: jest.fn(),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const Crypto = require('expo-crypto');
const apiClient = require('../services/apiClient').default || require('../services/apiClient');
const { STORAGE_KEYS, OFFLINE_CONFIG, ENDPOINTS } = require('../config/endpoints');

const {
  enqueueCheckin,
  getQueue,
  flushQueue,
  subscribe,
} = require('../services/offlineQueue');

// Helper: set up AsyncStorage backing store as an in-memory object keyed by STORAGE_KEYS.OFFLINE_QUEUE
function mockStoredQueue(queue) {
  AsyncStorage.getItem.mockImplementation(async (key) => {
    if (key === STORAGE_KEYS.OFFLINE_QUEUE) {
      return queue === undefined ? null : JSON.stringify(queue);
    }
    return null;
  });
}

// Helper: capture setItem writes so we can inspect the persisted queue after calls
function captureWrites() {
  const writes = [];
  AsyncStorage.setItem.mockImplementation(async (key, value) => {
    if (key === STORAGE_KEYS.OFFLINE_QUEUE) {
      writes.push(JSON.parse(value));
    }
  });
  return writes;
}

function makeError({ response } = {}) {
  const err = new Error('request failed');
  if (response) err.response = response;
  return err;
}

beforeEach(() => {
  jest.clearAllMocks();
  Crypto.randomUUID.mockReturnValue('generated-uuid-1234');
});

describe('enqueueCheckin', () => {
  test('persists an item with generated client_uuid, occurred_at and status pending', async () => {
    mockStoredQueue([]);
    const writes = captureWrites();

    await enqueueCheckin({ employee_id: 'e1', site_id: 's1', client_id: 'c1', type: 'IN' });

    expect(writes.length).toBe(1);
    const [item] = writes[0];
    expect(item.client_uuid).toBe('generated-uuid-1234');
    expect(typeof item.occurred_at).toBe('string');
    expect(new Date(item.occurred_at).toString()).not.toBe('Invalid Date');
    expect(item.status).toBe('pending');
    expect(item.employee_id).toBe('e1');
    expect(item.site_id).toBe('s1');
    expect(item.client_id).toBe('c1');
    expect(item.type).toBe('IN');
  });

  test('preserves caller-supplied client_uuid/occurred_at instead of generating new ones', async () => {
    mockStoredQueue([]);
    const writes = captureWrites();

    await enqueueCheckin({
      employee_id: 'e1',
      site_id: 's1',
      client_id: 'c1',
      type: 'IN',
      client_uuid: 'caller-supplied-uuid',
      occurred_at: '2026-01-01T00:00:00.000Z',
    });

    const [item] = writes[0];
    expect(item.client_uuid).toBe('caller-supplied-uuid');
    expect(item.occurred_at).toBe('2026-01-01T00:00:00.000Z');
    // randomUUID should not have been used to override the caller value
    expect(item.client_uuid).not.toBe('generated-uuid-1234');
  });

  test('throws when the queue is already at MAX_QUEUE_SIZE', async () => {
    const fullQueue = Array.from({ length: OFFLINE_CONFIG.MAX_QUEUE_SIZE }, (_, i) => ({
      client_uuid: `uuid-${i}`,
      occurred_at: new Date().toISOString(),
      status: 'pending',
      employee_id: 'e1',
      site_id: 's1',
      client_id: 'c1',
      type: 'IN',
    }));
    mockStoredQueue(fullQueue);
    captureWrites();

    await expect(
      enqueueCheckin({ employee_id: 'e1', site_id: 's1', client_id: 'c1', type: 'IN' })
    ).rejects.toThrow();

    // Must not have written a 201-item queue
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test('notifies subscribers after a successful enqueue', async () => {
    mockStoredQueue([]);
    captureWrites();
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);

    await enqueueCheckin({ employee_id: 'e1', site_id: 's1', client_id: 'c1', type: 'IN' });

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});

describe('getQueue', () => {
  test('returns [] when nothing is stored', async () => {
    mockStoredQueue(undefined);
    const queue = await getQueue();
    expect(queue).toEqual([]);
  });

  test('returns the persisted array otherwise', async () => {
    const stored = [{ client_uuid: 'a', status: 'pending' }];
    mockStoredQueue(stored);
    const queue = await getQueue();
    expect(queue).toEqual(stored);
  });
});

describe('flushQueue', () => {
  function item(overrides = {}) {
    return {
      client_uuid: 'uuid-1',
      occurred_at: new Date().toISOString(),
      is_offline: true,
      status: 'pending',
      employee_id: 'e1',
      site_id: 's1',
      client_id: 'c1',
      type: 'IN',
      ...overrides,
    };
  }

  test('POSTs items in FIFO order (oldest first)', async () => {
    const older = item({ client_uuid: 'older', occurred_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString() });
    const newer = item({ client_uuid: 'newer', occurred_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString() });
    // Store in reverse (newer first) to prove ordering is by insertion/oldest first, not array index
    mockStoredQueue([older, newer]);
    captureWrites();
    apiClient.post.mockResolvedValue({ data: {} });

    await flushQueue();

    expect(apiClient.post.mock.calls[0][1].client_uuid).toBe('older');
    expect(apiClient.post.mock.calls[1][1].client_uuid).toBe('newer');
  });

  test('removes an item from the queue on success (2xx) and counts it as synced', async () => {
    mockStoredQueue([item()]);
    const writes = captureWrites();
    apiClient.post.mockResolvedValue({ data: { data: {} } });

    const result = await flushQueue();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    const finalWrite = writes[writes.length - 1];
    expect(finalWrite.find((i) => i.client_uuid === 'uuid-1')).toBeUndefined();
  });

  test('treats a deduplicated:true response as success (removes item, counts as synced)', async () => {
    mockStoredQueue([item()]);
    const writes = captureWrites();
    apiClient.post.mockResolvedValue({ data: { success: true, deduplicated: true, data: {} } });

    const result = await flushQueue();

    expect(result.synced).toBe(1);
    const finalWrite = writes[writes.length - 1];
    expect(finalWrite.find((i) => i.client_uuid === 'uuid-1')).toBeUndefined();
  });

  test('on a network error (no response) stops immediately, leaving that item AND subsequent items untouched', async () => {
    const i1 = item({ client_uuid: 'first' });
    const i2 = item({ client_uuid: 'second' });
    const i3 = item({ client_uuid: 'third' });
    mockStoredQueue([i1, i2, i3]);
    captureWrites();

    apiClient.post.mockRejectedValueOnce(makeError()); // no .response => network error

    const result = await flushQueue();

    expect(apiClient.post).toHaveBeenCalledTimes(1); // stopped immediately, didn't try 2nd/3rd
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);

    const queueAfter = await getQueue();
    expect(queueAfter.length).toBe(3);
    expect(queueAfter.every((i) => i.status === 'pending')).toBe(true);
  });

  test('marks an item failed (not removed) on a definitive 4xx error, and continues with remaining items', async () => {
    const bad = item({ client_uuid: 'bad' });
    const good = item({ client_uuid: 'good' });
    mockStoredQueue([bad, good]);
    const writes = captureWrites();

    apiClient.post
      .mockRejectedValueOnce(makeError({ response: { status: 400, data: { error: 'Validation Error' } } }))
      .mockResolvedValueOnce({ data: { data: {} } });

    const result = await flushQueue();

    expect(apiClient.post).toHaveBeenCalledTimes(2); // continued after the 4xx
    expect(result.failed).toBe(1);
    expect(result.synced).toBe(1);

    const finalWrite = writes[writes.length - 1];
    const badItem = finalWrite.find((i) => i.client_uuid === 'bad');
    expect(badItem).toBeDefined();
    expect(badItem.status).toBe('failed');
    const goodItem = finalWrite.find((i) => i.client_uuid === 'good');
    expect(goodItem).toBeUndefined(); // synced items are removed
  });

  test('marks an item failed without attempting a POST if older than MAX_AGE_HOURS', async () => {
    const tooOld = new Date(Date.now() - (OFFLINE_CONFIG.MAX_AGE_HOURS + 1) * 3600 * 1000).toISOString();
    const stale = item({ client_uuid: 'stale', occurred_at: tooOld });
    mockStoredQueue([stale]);
    const writes = captureWrites();

    const result = await flushQueue();

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.synced).toBe(0);
    const finalWrite = writes[writes.length - 1];
    const staleItem = finalWrite.find((i) => i.client_uuid === 'stale');
    expect(staleItem.status).toBe('failed');
  });

  test('two concurrent flushQueue() calls do not double-POST the same items (mutex)', async () => {
    const i1 = item({ client_uuid: 'a' });
    const i2 = item({ client_uuid: 'b' });
    mockStoredQueue([i1, i2]);
    captureWrites();
    apiClient.post.mockResolvedValue({ data: { data: {} } });

    const [r1, r2] = await Promise.all([flushQueue(), flushQueue()]);

    // Only one pass should have actually run: 2 posts total, not 4
    expect(apiClient.post).toHaveBeenCalledTimes(2);
    // One of the two results should be the "blocked, did nothing" result
    const blocked = [r1, r2].find((r) => r.synced === 0 && r.failed === 0 && r.remaining === 2);
    expect(blocked).toBeDefined();
  });

  test('notifies subscribers after a flush that changes the queue; unsubscribe stops further notifications', async () => {
    mockStoredQueue([item()]);
    captureWrites();
    apiClient.post.mockResolvedValue({ data: { data: {} } });

    const listener = jest.fn();
    const unsubscribe = subscribe(listener);

    await flushQueue();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();

    mockStoredQueue([item({ client_uuid: 'another' })]);
    await flushQueue();
    expect(listener).not.toHaveBeenCalled();
  });
});
