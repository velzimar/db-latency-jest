// Every replica is configured ONLY through environment variables.
// The tests start replicas with different values to compare setups.

const int = (name: string, fallback: number): number => {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : Number(raw);
};

export const config = {
  port: int('PORT', 3000),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/app',

  pool: {
    // Max connections THIS replica may open (total = replicas x size).
    size: int('POOL_SIZE', 30),
    // How long a request may wait for a free connection. 0 = wait forever.
    acquireTimeoutMs: int('POOL_ACQUIRE_TIMEOUT_MS', 0),
    // Postgres kills any query running longer than this. 0 = no limit.
    statementTimeoutMs: int('STATEMENT_TIMEOUT_MS', 0),
  },

  worker: {
    enabled: process.env.ENABLE_WORKER === '1',
    // 0 = the worker shares the API pool (bad). >0 = its own small pool (good).
    poolSize: int('WORKER_POOL_SIZE', 0),
    // How many heavy queries each run launches at once.
    concurrency: int('WORKER_CONCURRENCY', 10),
    // How long each heavy query holds its connection.
    queryMs: int('WORKER_QUERY_MS', 500),
    // How often the scheduler checks whether a new run can start.
    intervalMs: int('WORKER_INTERVAL_MS', 100),
  },
};
