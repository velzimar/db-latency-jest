import { Client } from "pg";
import { DATABASE_URL, sleep } from "./settings";

const ROWS = 500_000;

/** Opens a connection used by the tests themselves (NOT by the replicas). */
async function connect(applicationName = "test-admin"): Promise<Client> {
  const client = new Client({
    connectionString: DATABASE_URL,
    application_name: applicationName,
  });
  await client.connect();
  return client;
}

/** Waits for Postgres to accept connections (it may still be starting). */
export async function waitForDatabase(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await (await connect()).end();
      return;
    } catch (err) {
      lastError = err;
      await sleep(1000);
    }
  }
  throw new Error(
    `Cannot reach Postgres at ${DATABASE_URL}.\n` +
      `Did you run "npm run db:up" (docker compose up -d --wait)?\n` +
      `Last error: ${(lastError as Error)?.message}`,
  );
}

/** Creates the table, fills it once, and removes the index (known start state). */
export async function ensureSchema(): Promise<void> {
  const db = await connect();
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id          serial PRIMARY KEY,
        customer_id int           NOT NULL,
        amount      numeric(10,2) NOT NULL,
        status      text          NOT NULL,
        created_at  timestamptz   NOT NULL DEFAULT now()
      )`);

    const { rows } = await db.query("SELECT count(*)::int AS n FROM orders");
    if (rows[0].n === 0) {
      await db.query(
        `INSERT INTO orders (customer_id, amount, status)
         SELECT (random() * 10000)::int,
                (random() * 500)::numeric(10,2),
                (ARRAY['new','paid','shipped'])[1 + (random() * 2)::int]
           FROM generate_series(1, ${ROWS})`,
      );
    }
    await db.query("DROP INDEX IF EXISTS idx_orders_customer");
    await db.query("ANALYZE orders");
  } finally {
    await db.end();
  }
}

/** Creates or drops the index on orders(customer_id): the "query fix". */
export async function setCustomerIndex(enabled: boolean): Promise<void> {
  const db = await connect();
  try {
    if (enabled) {
      await db.query(
        "CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id)",
      );
    } else {
      await db.query("DROP INDEX IF EXISTS idx_orders_customer");
    }
    await db.query("ANALYZE orders");
  } finally {
    await db.end();
  }
}

const COUNT_SQL = `SELECT count(*)::int AS n FROM pg_stat_activity
                    WHERE datname = current_database()
                      AND (application_name LIKE 'api-%' OR application_name LIKE 'worker-%')`;

/** Waits until every connection of the previous scenario is gone. */
export async function waitForNoAppConnections(
  timeoutMs = 15_000,
): Promise<void> {
  const db = await connect("sampler");
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { rows } = await db.query(COUNT_SQL);
      if (rows[0].n === 0) return;
      await sleep(200);
    }
  } finally {
    await db.end();
  }
}

/**
 * Counts open connections every 50 ms and remembers the highest value.
 * The sampler connects BEFORE the load starts so it always has a free slot.
 */
export async function startConnectionSampler() {
  const db = await connect("sampler");
  let peak = 0;
  let stopped = false;

  const loop = (async () => {
    while (!stopped) {
      try {
        const { rows } = await db.query(COUNT_SQL);
        peak = Math.max(peak, rows[0].n);
      } catch {
        /* ignore a failed sample */
      }
      await sleep(50);
    }
  })();

  return {
    async stop(): Promise<number> {
      stopped = true;
      await loop;
      await db.end();
      return peak;
    },
  };
}
