import { setCustomerIndex } from './harness/db';
import { printResults } from './harness/report';
import { runScenario } from './harness/scenario';

const randomCustomer = () => `/by-customer?customerId=${Math.floor(Math.random() * 10_000)}`;

/**
 * PROVES: fixing the query removes the root cause. Fewer milliseconds per
 * query = connections come back to the pool sooner = more capacity for free.
 */
describe('5. Fixing the underlying queries', () => {
  const load = { replicas: 1, concurrency: 10, durationMs: 4000, env: { POOL_SIZE: 10 } };

  afterAll(async () => {
    await setCustomerIndex(false); // leave the DB in its original state
  });

  it('an index on customer_id replaces a full table scan', async () => {
    await setCustomerIndex(false);
    const noIndex = await runScenario({ ...load, path: randomCustomer });

    await setCustomerIndex(true);
    const withIndex = await runScenario({ ...load, path: randomCustomer });

    printResults('5a. /by-customer without / with index', {
      'no index (seq scan)': noIndex,
      'index on customer_id': withIndex,
    });

    expect(withIndex.p95).toBeLessThan(noIndex.p95 / 3);
    expect(withIndex.okPerSecond).toBeGreaterThan(noIndex.okPerSecond * 3);
  });

  it('one query instead of N+1 is faster', async () => {
    await setCustomerIndex(true); // isolate the N+1 effect from the missing index

    const n1 = await runScenario({ ...load, path: '/summary-n1?count=30' });
    const single = await runScenario({ ...load, path: '/summary?count=30' });

    printResults('5b. 30 customers: N+1 queries vs one query', {
      'N+1 (30 queries)': n1,
      'single query': single,
    });

    expect(n1.failed).toBe(0);
    expect(single.failed).toBe(0);
    expect(n1.p50).toBeGreaterThan(single.p50 * 1.5); // N+1 does 30 round trips instead of 1
  });
});
