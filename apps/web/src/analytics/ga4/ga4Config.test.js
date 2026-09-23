import { describe, test, expect, afterEach, vi } from 'vitest';
import {
  isGa4FeatureFlagEnabled,
  getGa4MeasurementId,
  isValidGa4MeasurementId,
  isGa4Configured,
} from './ga4Config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isGa4FeatureFlagEnabled', () => {
  test('false by default (unset)', () => {
    vi.stubEnv('VITE_GA4_ENABLED', undefined);
    expect(isGa4FeatureFlagEnabled()).toBe(false);
  });

  test('false for "false"', () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'false');
    expect(isGa4FeatureFlagEnabled()).toBe(false);
  });

  test('true only for the exact string "true"', () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true');
    expect(isGa4FeatureFlagEnabled()).toBe(true);
  });

  test('any other value is treated as disabled', () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'TRUE');
    expect(isGa4FeatureFlagEnabled()).toBe(false);
  });
});

describe('isValidGa4MeasurementId', () => {
  test('accepts a real-shaped measurement id', () => {
    expect(isValidGa4MeasurementId('G-ABC1234567')).toBe(true);
  });

  test('rejects empty string', () => {
    expect(isValidGa4MeasurementId('')).toBe(false);
  });

  test('rejects a GTM container id (wrong prefix)', () => {
    expect(isValidGa4MeasurementId('GTM-ABC1234')).toBe(false);
  });

  test('rejects a lowercase id', () => {
    expect(isValidGa4MeasurementId('g-abc1234567')).toBe(false);
  });

  test('rejects a malformed/placeholder value', () => {
    expect(isValidGa4MeasurementId('your-measurement-id')).toBe(false);
  });
});

describe('getGa4MeasurementId', () => {
  test('trims whitespace', () => {
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', '  G-ABC1234567  ');
    expect(getGa4MeasurementId()).toBe('G-ABC1234567');
  });

  test('empty string when unset', () => {
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', undefined);
    expect(getGa4MeasurementId()).toBe('');
  });
});

describe('isGa4Configured — the combined gate', () => {
  test('false when flag is true but id is missing', () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true');
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', undefined);
    expect(isGa4Configured()).toBe(false);
  });

  test('false when id is valid but flag is not true', () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'false');
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-ABC1234567');
    expect(isGa4Configured()).toBe(false);
  });

  test('false when id is malformed even with flag true', () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true');
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'not-a-real-id');
    expect(isGa4Configured()).toBe(false);
  });

  test('true only when both flag=true AND a valid id are present', () => {
    vi.stubEnv('VITE_GA4_ENABLED', 'true');
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-ABC1234567');
    expect(isGa4Configured()).toBe(true);
  });

  test('never throws for any combination — always a safe boolean', () => {
    vi.stubEnv('VITE_GA4_ENABLED', undefined);
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', undefined);
    expect(() => isGa4Configured()).not.toThrow();
    expect(isGa4Configured()).toBe(false);
  });
});
