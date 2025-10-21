// ---- Config Tests ----
import { describe, it, expect } from 'vitest';
import { config } from '../config/env.js';

describe('Environment Configuration', () => {
  it('should have valid PORT', () => {
    expect(config.PORT).toBeGreaterThan(0);
    expect(Number.isInteger(config.PORT)).toBe(true);
  });

  it('should have LOG_LEVEL set', () => {
    expect(config.LOG_LEVEL).toBeTruthy();
    expect(typeof config.LOG_LEVEL).toBe('string');
  });

  it('should have timeout values as positive integers', () => {
    expect(config.ROUTE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(config.HAZ_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('should have cache configuration', () => {
    expect(config.ROUTE_CACHE_MAX).toBeGreaterThan(0);
    expect(config.ROUTE_CACHE_TTL_MS).toBeGreaterThan(0);
  });

  it('should have secrets set (even if default)', () => {
    expect(config.JWT_SECRET).toBeTruthy();
    expect(config.SESSION_SECRET).toBeTruthy();
  });
});
