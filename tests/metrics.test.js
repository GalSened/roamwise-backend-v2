// ---- Metrics Tests ----
import { describe, it, expect } from 'vitest';
import { observe, snapshot } from '../ops/metrics.js';

describe('Metrics System', () => {
  it('should record observations', () => {
    observe('test_service', 100, true);
    observe('test_service', 200, true);
    observe('test_service', 150, false);

    const metrics = snapshot();
    expect(metrics.test_service).toBeTruthy();
    expect(metrics.test_service.reqs).toBe(3);
    expect(metrics.test_service.errors).toBe(1);
  });

  it('should calculate percentiles', () => {
    // Clear previous state by creating a new service
    const serviceName = `test_pct_${Date.now()}`;
    for (let i = 0; i < 100; i++) {
      observe(serviceName, i * 10, true);
    }

    const metrics = snapshot();
    expect(metrics[serviceName]).toBeTruthy();
    expect(metrics[serviceName].p50_ms).toBeGreaterThan(0);
    expect(metrics[serviceName].p95_ms).toBeGreaterThan(metrics[serviceName].p50_ms);
  });

  it('should calculate error rate correctly', () => {
    const serviceName = `test_errors_${Date.now()}`;
    observe(serviceName, 100, true);
    observe(serviceName, 100, true);
    observe(serviceName, 100, false);
    observe(serviceName, 100, false);

    const metrics = snapshot();
    expect(metrics[serviceName].error_rate).toBe(0.5);
  });
});
