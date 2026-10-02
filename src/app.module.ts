import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DbModule } from './db/db.module';
import { OrdersModule } from './orders/orders.module';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [ScheduleModule.forRoot(), DbModule, OrdersModule, WorkersModule],
})
export class AppModule {}
