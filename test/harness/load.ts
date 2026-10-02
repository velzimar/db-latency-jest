export interface LoadOptions {
  urls: string[]; // replicas; requests are spread round-robin
  path: string | (() => string);
  concurrency: number; // number of "users" sending requests back-to-back
  durationMs: number;
  clientTimeoutMs?: number; // a client gives up after this
}

export interface LoadResult {
  ok: number;
  failed: number;
  okPerSecond: number;
  p50: number; // ms, all requests
  p95: number; // ms, all requests (failures included)
  okP95: number; // ms, successful requests only
  errors: Record<string, number>; // failure reason -> count
  peakConnections: number; // filled by runScenario
}

const percentile = (sorted: number[], p: number) =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

/** Turns a raw error body into a short, countable label. */
function classify(status: number, body: string): string {
  let message = body;
  try {
    message = JSON.parse(body).message ?? body;
  } catch {
    /* body was not JSON */
  }
  if (message.includes('too many clients')) return 'too many clients';
  if (message.includes('timeout exceeded when trying to connect')) return 'pool acquire timeout';
  if (message.includes('statement timeout')) return 'statement timeout';
  return `HTTP ${status}: ${message.slice(0, 60)}`;
}

/**
 * Closed-loop load generator: `concurrency` virtual users each send a request,
 * wait for the answer, then immediately send the next one, until time is up.
 */
export async function runLoad(opts: LoadOptions): Promise<LoadResult> {
  const { urls, concurrency, durationMs, clientTimeoutMs = 30_000 } = opts;
  const endAt = Date.now() + durationMs;

  const all: number[] = [];
  const okOnly: number[] = [];
  const errors: Record<string, number> = {};
  const countError = (label: string) => (errors[label] = (errors[label] ?? 0) + 1);

  async function virtualUser(userIndex: number) {
    let n = userIndex;
    while (Date.now() < endAt) {
      const base = urls[n++ % urls.length];
      const path = typeof opts.path === 'function' ? opts.path() : opts.path;
      const started = performance.now();
      try {
        const res = await fetch(base + path, { signal: AbortSignal.timeout(clientTimeoutMs) });
        const body = await res.text();
        const elapsed = performance.now() - started;
        all.push(elapsed);
        if (res.ok) okOnly.push(elapsed);
        else countError(classify(res.status, body));
      } catch (err) {
        all.push(performance.now() - started);
        countError(`client error: ${(err as Error).name}`);
      }
    }
  }

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: concurrency }, (_, i) => virtualUser(i)));
  const seconds = (performance.now() - startedAt) / 1000;

  all.sort((a, b) => a - b);
  okOnly.sort((a, b) => a - b);

  return {
    ok: okOnly.length,
    failed: all.length - okOnly.length,
    okPerSecond: okOnly.length / seconds,
    p50: percentile(all, 0.5),
    p95: percentile(all, 0.95),
    okP95: percentile(okOnly, 0.95),
    errors,
    peakConnections: 0,
  };
}
