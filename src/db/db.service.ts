import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { config } from '../config';

/**
 * Owns the connection pool(s) of this replica.
 *
 *  - `pool`       : used by HTTP requests (user traffic)
 *  - `workerPool` : used by the scheduled job. If WORKER_POOL_SIZE=0 it is the
 *                   SAME object as `pool` -> the job competes with users.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pool = this.createPool(config.pool.size, 'api');
  private readonly workerPool =
    config.worker.poolSize > 0 ? this.createPool(config.worker.poolSize, 'worker') : this.pool;

  private createPool(max: number, name: string): Pool {
    const pool = new Pool({
      connectionString: config.databaseUrl,
      max,
      // 0 means "wait forever" for a free connection. A real value = fail fast.
      connectionTimeoutMillis: config.pool.acquireTimeoutMs,
      // undefined = no limit. A real value = Postgres cancels long queries.
      statement_timeout: config.pool.statementTimeoutMs || undefined,
      idleTimeoutMillis: 30_000,
      // Visible in pg_stat_activity: tells you WHO owns each connection.
      application_name: `${name}-${config.port}`,
    });
    // An error on an idle connection must not crash the process.
    pool.on('error', () => undefined);
    return pool;
  }

  /** Query used by HTTP requests. Any DB error becomes an HTTP 503. */
  query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.run(this.pool, sql, params);
  }

  /** Query used by the scheduled job. */
  workerQuery<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.run(this.workerPool, sql, params);
  }

  /** Pool metrics. `waiting` > 0 means requests are queuing for a connection. */
  stats() {
    return {
      max: config.pool.size,
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  private async run<T>(pool: Pool, sql: string, params: unknown[]): Promise<T[]> {
    try {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    } catch (err) {
      // 503 + the original message lets the load generator classify failures
      // ("too many clients", "statement timeout", pool acquire timeout...).
      throw new ServiceUnavailableException((err as Error).message);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
    if (this.workerPool !== this.pool) await this.workerPool.end();
  }
}
