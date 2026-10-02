import { Module } from '@nestjs/common';
import { ReportWorker } from './report.worker';

@Module({ providers: [ReportWorker] })
export class WorkersModule {}
