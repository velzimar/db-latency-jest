import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { config } from '../config';
import { DbService } from '../db/db.service';

/**
 * Simulates the "scheduled workers using the same database" of the scenario.
 *
 * Each run launches several long queries at once. If they share the API pool
 * they grab every connection, and user requests have to wait behind them.
 * With WORKER_POOL_SIZE > 0 the job is limited to its own small pool.
 */
@Injectable()
export class ReportWorker {
  private running = false;

  constructor(private readonly db: DbService) {}

  @Interval(config.worker.intervalMs)
  async run() {
    if (!config.worker.enabled || this.running) return; // off, or previous run still going
    this.running = true;
    try {
      const seconds = config.worker.queryMs / 1000;
      const jobs = Array.from({ length: config.worker.concurrency }, () =>
        this.db.workerQuery('SELECT pg_sleep($1)', [seconds]),
      );
      await Promise.allSettled(jobs);
    } finally {
      this.running = false;
    }
  }
}
