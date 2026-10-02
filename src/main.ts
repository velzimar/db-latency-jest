import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.SHOW_APP_LOGS ? ['log', 'warn', 'error'] : ['error'],
  });
  app.enableShutdownHooks(); // SIGTERM -> close HTTP server, then end the pools

  await app.listen(config.port, '127.0.0.1');

  // The test harness started us with fork(): tell the parent we are ready.
  process.send?.('ready');
  // If the parent (Jest) dies, do not stay alive as an orphan.
  process.on('disconnect', () => process.exit(0));
}

bootstrap();
