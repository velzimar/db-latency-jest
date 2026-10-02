import { printResults } from './harness/report';
import { runScenario } from './harness/scenario';

/**
 * PROVES: a scheduled job sharing the API pool starves user traffic, and a
 * separate small pool for the job fixes it.
 *
 * The job runs 10 long queries at once (500 ms each). User traffic is only a
 * cheap primary-key lookup (~1 ms) that should be instant.
 */
describe('3. Scheduled workers must not share the user pool', () => {
  it('an isolated worker pool keeps user latency low', async () => {
    const load = {
      replicas: 4,
      path: () => `/fast?id=${1 + Math.floor(Math.random() * 500_000)}`,
      concurrency: 20,
      durationMs: 5000,
    };

    const baseline = await runScenario({ ...load, env: { POOL_SIZE: 10 } });
    const shared = await runScenario({ ...load, env: { POOL_SIZE: 10, ENABLE_WORKER: 1 } });
    const isolated = await runScenario({
      ...load,
      env: { POOL_SIZE: 10, ENABLE_WORKER: 1, WORKER_POOL_SIZE: 2 },
    });

    printResults('3. User traffic latency (/fast) while the worker runs', {
      'no worker (baseline)': baseline,
      'worker, SHARED pool': shared,
      'worker, ISOLATED pool (2)': isolated,
    });

    expect(shared.failed).toBe(0);
    expect(isolated.failed).toBe(0);

    // Shared: users queue behind 500 ms jobs -> p95 in the hundreds of ms.
    expect(shared.p95).toBeGreaterThan(200);
    // Isolated: users keep their own connections -> far faster.
    expect(isolated.p95).toBeLessThan(shared.p95 / 3);
  });
});
