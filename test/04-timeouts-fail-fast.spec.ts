import { BASE_PORT } from './harness/settings';
import { printResults } from './harness/report';
import { runScenario } from './harness/scenario';
import { spawnReplicas } from './harness/replicas';

/**
 * PROVES: timeouts turn "everything is slow" into "a few fast errors".
 *
 * Capacity: 4 replicas x pool 5 = 20 connections, each query takes 200 ms
 * -> about 100 requests/s. We send 200 users, so requests must queue.
 */
describe('4. Timeouts: fail fast instead of piling up', () => {
  it('a pool acquire timeout keeps response times bounded', async () => {
    const load = { replicas: 4, path: '/sleep?ms=200', concurrency: 200, durationMs: 8000 };

    const noTimeout = await runScenario({ ...load, env: { POOL_SIZE: 5 } });
    const withTimeout = await runScenario({
      ...load,
      env: { POOL_SIZE: 5, POOL_ACQUIRE_TIMEOUT_MS: 300 },
    });

    printResults('4a. Overload without / with pool acquire timeout (300 ms)', {
      'no timeout': noTimeout,
      'acquire timeout 300ms': withTimeout,
    });

    // Without timeout nobody fails, but everybody waits seconds.
    expect(noTimeout.failed).toBe(0);
    expect(noTimeout.p95).toBeGreaterThan(1000);

    // With timeout some requests are rejected quickly, the rest succeed fast.
    expect(withTimeout.failed).toBeGreaterThan(0);
    expect(withTimeout.ok).toBeGreaterThan(0);
    expect(withTimeout.errors['pool acquire timeout']).toBeGreaterThan(0);
    expect(withTimeout.p95).toBeLessThan(noTimeout.p95 / 2);
  });

  it('statement_timeout kills a runaway query', async () => {
    const replicas = await spawnReplicas(1, { POOL_SIZE: 5, STATEMENT_TIMEOUT_MS: 300 });
    try {
      const base = `http://127.0.0.1:${BASE_PORT}`;

      // A short query is fine...
      const fine = await fetch(`${base}/sleep?ms=100`);
      expect(fine.status).toBe(200);

      // ...a 3 second query is cancelled by Postgres after ~300 ms.
      const started = Date.now();
      const slow = await fetch(`${base}/sleep?ms=3000`);
      const elapsed = Date.now() - started;
      const body = await slow.json();

      expect(slow.status).toBe(503);
      expect(body.message).toContain('statement timeout');
      expect(elapsed).toBeLessThan(1500);
    } finally {
      await replicas.stop();
    }
  });
});
