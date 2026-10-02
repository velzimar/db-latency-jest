import { ChildProcess, fork } from 'child_process';
import * as path from 'path';
import { BASE_PORT, DATABASE_URL } from './settings';

export interface ReplicaSet {
  urls: string[];
  stop(): Promise<void>;
}

/**
 * Starts `count` copies of the compiled Nest app (dist/main.js), each one in
 * its own child process with its own port and its own connection pool.
 * This is our "Kubernetes with N pods" on a laptop.
 */
export async function spawnReplicas(
  count: number,
  env: Record<string, string | number> = {},
): Promise<ReplicaSet> {
  const entry = path.resolve(__dirname, '../../dist/main.js');
  const showLogs = !!process.env.SHOW_APP_LOGS;

  const children: ChildProcess[] = [];
  const urls: string[] = [];
  const ready: Promise<void>[] = [];

  for (let i = 0; i < count; i++) {
    const port = BASE_PORT + i;
    const child = fork(entry, [], {
      env: {
        ...process.env,
        DATABASE_URL,
        PORT: String(port),
        ...Object.fromEntries(Object.entries(env).map(([k, v]) => [k, String(v)])),
      },
      // [stdin, stdout, stderr, ipc]
      stdio: ['ignore', showLogs ? 'inherit' : 'ignore', 'inherit', 'ipc'],
    });
    children.push(child);
    urls.push(`http://127.0.0.1:${port}`);

    // A replica is "ready" when it sends the message 'ready' (see src/main.ts)
    ready.push(
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`replica ${port} start timeout`)), 30_000);
        child.once('message', (msg) => {
          if (msg === 'ready') {
            clearTimeout(timer);
            resolve();
          }
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`replica ${port} exited before being ready (code ${code})`));
        });
      }),
    );
  }

  const stop = async () => {
    await Promise.all(
      children.map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) return resolve();
            const killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
            child.once('exit', () => {
              clearTimeout(killTimer);
              resolve();
            });
            child.kill('SIGTERM'); // graceful: Nest closes the server and the pools
          }),
      ),
    );
  };

  try {
    await Promise.all(ready);
  } catch (err) {
    await stop();
    throw err;
  }
  return { urls, stop };
}
