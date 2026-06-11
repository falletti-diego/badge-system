'use strict';

const { haversineDistance } = require('../utils/geo');

describe('haversineDistance', () => {
  test('same point returns 0', () => {
    expect(haversineDistance(45.0, 9.0, 45.0, 9.0)).toBe(0);
  });

  test('100 metres north is approximately 100m', () => {
    // 1 degree latitude ≈ 111 km → 0.0009° ≈ 100m
    const d = haversineDistance(45.0, 9.0, 45.0009, 9.0);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });

  test('1 km north is approximately 1000m', () => {
    const d = haversineDistance(45.0, 9.0, 45.009, 9.0);
    expect(d).toBeGreaterThan(950);
    expect(d).toBeLessThan(1050);
  });

  test('Milan to Rome is approximately 477 km', () => {
    const d = haversineDistance(45.4654, 9.1859, 41.9028, 12.4964);
    expect(d / 1000).toBeGreaterThan(470);
    expect(d / 1000).toBeLessThan(485);
  });

  test('antipodal points are approximately 20015 km', () => {
    const d = haversineDistance(0, 0, 0, 180);
    expect(d / 1000).toBeGreaterThan(20000);
    expect(d / 1000).toBeLessThan(20030);
  });

  test('is symmetric — distance A→B equals B→A', () => {
    const d1 = haversineDistance(45.4654, 9.1859, 43.7696, 11.2558);
    const d2 = haversineDistance(43.7696, 11.2558, 45.4654, 9.1859);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });

  test('handles negative coordinates (southern hemisphere)', () => {
    const d = haversineDistance(-33.8688, 151.2093, -33.8688, 151.2093);
    expect(d).toBe(0);
  });

  test('within 150m geofence radius returns < 150', () => {
    // ~100m east at 45° lat
    const d = haversineDistance(45.0, 9.0, 45.0, 9.00127);
    expect(d).toBeLessThan(150);
  });

  test('outside 150m geofence radius returns > 150', () => {
    // ~300m east at 45° lat
    const d = haversineDistance(45.0, 9.0, 45.0, 9.00381);
    expect(d).toBeGreaterThan(150);
  });
});
