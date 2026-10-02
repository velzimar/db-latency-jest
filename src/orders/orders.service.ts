import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

const MAX_CUSTOMER_ID = 10_000; // the seed spreads orders over customers 0..10000

@Injectable()
export class OrdersService {
  constructor(private readonly db: DbService) {}

  /** Cheap primary-key lookup: ~1 ms. Good "normal user traffic". */
  fast(id: number) {
    return this.db.query('SELECT id, customer_id, amount FROM orders WHERE id = $1', [id]);
  }

  /** A query that simply takes `ms` and holds its connection (no CPU used). */
  sleep(ms: number) {
    return this.db.query('SELECT pg_sleep($1)', [ms / 1000]);
  }

  /** CPU-bound query (~20-50 ms of real CPU). Many at once saturate the DB cores. */
  cpu() {
    return this.db.query(
      'SELECT count(*)::int AS n FROM generate_series(1, 300000) AS g WHERE g % 7 = 0',
    );
  }

  /**
   * All orders of a customer.
   * WITHOUT an index on customer_id -> full table scan (slow).
   * WITH the index                  -> a few index pages (fast).
   */
  byCustomer(customerId: number) {
    return this.db.query('SELECT id, amount, status FROM orders WHERE customer_id = $1', [
      customerId,
    ]);
  }

  /** BAD: N+1 pattern. One query per customer, one after the other. */
  async summaryN1(count: number) {
    const result = [];
    for (const customerId of this.customerIds(count)) {
      const [row] = await this.db.query(
        'SELECT count(*)::int AS orders, sum(amount) AS total FROM orders WHERE customer_id = $1',
        [customerId],
      );
      result.push({ customerId, ...row });
    }
    return result;
  }

  /** GOOD: the same answer with ONE query. */
  summary(count: number) {
    return this.db.query(
      `SELECT customer_id, count(*)::int AS orders, sum(amount) AS total
         FROM orders
        WHERE customer_id = ANY($1::int[])
        GROUP BY customer_id`,
      [this.customerIds(count)],
    );
  }

  private customerIds(count: number): number[] {
    const start = Math.floor(Math.random() * MAX_CUSTOMER_ID);
    return Array.from({ length: count }, (_, i) => (start + i) % (MAX_CUSTOMER_ID + 1));
  }
}
