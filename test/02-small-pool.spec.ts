import { printResults } from './harness/report';
import { runScenario } from './harness/scenario';

/**
 * PROVES: with the same 12 replicas, a SMALL pool is safer and is not slower.
 *
 *   pool 30 -> 360 possible connections -> exceeds max_connections=200
 *   pool  5 ->  60 possible connections -> comfortable
 *
 * The database only has 2 CPU cores, so extra concurrent queries cannot be
 * served faster: they only add contention. Excess requests wait in the
 * (cheap) application pool instead of inside Postgres.
 */
describe('2. A smaller pool is safer', () => {
  it('pool 5 has no errors and keeps (almost) the same throughput as pool 30', async () => {
    const load = { path: '/cpu', concurrency: 300, durationMs: 8000 };

    const big = await runScenario({ replicas: 12, env: { POOL_SIZE: 30 }, ...load });
    const small = await runScenario({ replicas: 12, env: { POOL_SIZE: 5 }, ...load });

    printResults('2. 12 replicas, pool 30 vs pool 5', {
      'pool 30': big,
      'pool 5': small,
    });

    expect(small.failed).toBe(0);
    expect(small.peakConnections).toBeLessThanOrEqual(12 * 5);

    expect(big.failed).toBeGreaterThan(0);

    // Generous margin: we only claim "not meaningfully slower".
    expect(small.okPerSecond).toBeGreaterThanOrEqual(big.okPerSecond * 0.7);
  });
});
