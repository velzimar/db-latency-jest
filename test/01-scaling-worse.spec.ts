import { printResults } from './harness/report';
import { runScenario } from './harness/scenario';

/**
 * PROVES: adding replicas does not help a saturated database, it hurts.
 *
 *   4 replicas  x pool 30 = 120 possible connections  (limit is 200) -> fits
 *  12 replicas  x pool 30 = 360 possible connections  (limit is 200) -> too many
 *
 * Same load in both cases: 300 users hammering a CPU-bound query.
 */
describe('1. Scaling out makes a saturated database worse', () => {
  it('12 replicas hit "too many clients"; 4 replicas do not', async () => {
    const load = { path: '/cpu', concurrency: 300, durationMs: 8000 };

    const four = await runScenario({ replicas: 4, env: { POOL_SIZE: 30 }, ...load });
    const twelve = await runScenario({ replicas: 12, env: { POOL_SIZE: 30 }, ...load });

    printResults('1. Same load, 4 vs 12 replicas (pool 30 each)', {
      '4 replicas  x pool 30': four,
      '12 replicas x pool 30': twelve,
    });

    // 4 replicas stay under the limit and nothing fails.
    expect(four.failed).toBe(0);
    expect(four.peakConnections).toBeLessThanOrEqual(4 * 30);

    // 12 replicas want 360 connections: Postgres refuses the extra ones.
    expect(twelve.failed).toBeGreaterThan(0);
    expect(twelve.errors['too many clients']).toBeGreaterThan(0);
    expect(twelve.peakConnections).toBeGreaterThan(four.peakConnections);
  });
});
