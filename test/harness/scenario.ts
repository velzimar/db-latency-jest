import { startConnectionSampler, waitForNoAppConnections } from './db';
import { LoadOptions, LoadResult, runLoad } from './load';
import { spawnReplicas } from './replicas';

export interface Scenario extends Omit<LoadOptions, 'urls'> {
  replicas: number;
  env?: Record<string, string | number>;
}

/**
 * One complete experiment:
 *   1. wait until the DB has no leftover connections
 *   2. start N replicas with the given env
 *   3. generate load while sampling the number of DB connections
 *   4. stop the replicas (always, even if something fails)
 */
export async function runScenario(scenario: Scenario): Promise<LoadResult> {
  await waitForNoAppConnections();
  const replicas = await spawnReplicas(scenario.replicas, scenario.env);
  const sampler = await startConnectionSampler();
  try {
    const result = await runLoad({ ...scenario, urls: replicas.urls });
    result.peakConnections = await sampler.stop();
    return result;
  } finally {
    await sampler.stop().catch(() => undefined);
    await replicas.stop();
  }
}
