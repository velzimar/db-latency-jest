export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/app';

// Replica i listens on BASE_PORT + i
export const BASE_PORT = 4100;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
