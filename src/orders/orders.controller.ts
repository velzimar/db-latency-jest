import { Controller, Get, Query } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { OrdersService } from './orders.service';

const num = (value: string | undefined, fallback: number) =>
  value === undefined ? fallback : Number(value);

@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly db: DbService,
  ) {}

  @Get('health')
  health() {
    return { ok: true }; // never touches the database
  }

  @Get('stats')
  stats() {
    return this.db.stats();
  }

  @Get('fast')
  fast(@Query('id') id?: string) {
    return this.orders.fast(num(id, 1 + Math.floor(Math.random() * 500_000)));
  }

  @Get('sleep')
  sleep(@Query('ms') ms?: string) {
    return this.orders.sleep(Math.min(num(ms, 200), 5000));
  }

  @Get('cpu')
  cpu() {
    return this.orders.cpu();
  }

  @Get('by-customer')
  byCustomer(@Query('customerId') customerId?: string) {
    return this.orders.byCustomer(num(customerId, 1));
  }

  @Get('summary-n1')
  summaryN1(@Query('count') count?: string) {
    return this.orders.summaryN1(num(count, 30));
  }

  @Get('summary')
  summary(@Query('count') count?: string) {
    return this.orders.summary(num(count, 30));
  }
}
