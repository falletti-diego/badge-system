jest.mock('expo-device', () => ({ totalMemory: null }));

describe('isLowEndDevice', () => {
  afterEach(() => {
    jest.resetModules();
  });

  function mockTotalMemory(value) {
    jest.doMock('expo-device', () => ({ totalMemory: value }));
  }

  it('returns true when totalMemory is at or below the 3GB threshold', () => {
    mockTotalMemory(2 * 1024 ** 3); // 2GB
    const { isLowEndDevice } = require('../utils/deviceTier');
    expect(isLowEndDevice()).toBe(true);
  });

  it('returns true when totalMemory equals exactly the threshold', () => {
    mockTotalMemory(3 * 1024 ** 3); // esattamente 3GB
    const { isLowEndDevice } = require('../utils/deviceTier');
    expect(isLowEndDevice()).toBe(true);
  });

  it('returns false when totalMemory is above the threshold', () => {
    mockTotalMemory(6 * 1024 ** 3); // 6GB, device di fascia alta
    const { isLowEndDevice } = require('../utils/deviceTier');
    expect(isLowEndDevice()).toBe(false);
  });

  it('returns false when totalMemory is null (iOS always reports null)', () => {
    mockTotalMemory(null);
    const { isLowEndDevice } = require('../utils/deviceTier');
    expect(isLowEndDevice()).toBe(false);
  });

  it('returns false and does not throw when reading Device.totalMemory throws', () => {
    jest.doMock('expo-device', () => ({
      get totalMemory() {
        throw new Error('native module unavailable');
      },
    }));
    const { isLowEndDevice } = require('../utils/deviceTier');
    expect(() => isLowEndDevice()).not.toThrow();
    expect(isLowEndDevice()).toBe(false);
  });
});
