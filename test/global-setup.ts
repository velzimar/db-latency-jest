import { execSync } from 'child_process';
import { ensureSchema, waitForDatabase } from './harness/db';

// Runs ONCE before all test files.
export default async function globalSetup() {
  if (!process.env.SKIP_BUILD) {
    // Replicas run the compiled JavaScript, so compile first.
    process.stdout.write('\n[setup] compiling the app (tsc)...\n');
    execSync('npx tsc -p tsconfig.build.json', { stdio: 'inherit' });
  }
  process.stdout.write('[setup] waiting for Postgres...\n');
  await waitForDatabase();
  process.stdout.write('[setup] preparing the orders table (first run seeds 500k rows)...\n');
  await ensureSchema();
}
