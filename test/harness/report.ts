import { LoadResult } from './load';

const fmt = (n: number) => n.toFixed(0);

/** Prints a readable comparison table (process.stdout avoids Jest's log noise). */
export function printResults(title: string, rows: Record<string, LoadResult>) {
  const lines: string[] = ['', `=== ${title} ===`];
  const header = ['scenario', 'ok', 'failed', 'ok/s', 'p50 ms', 'p95 ms', 'peak conns'];
  const table = Object.entries(rows).map(([label, r]) => [
    label,
    String(r.ok),
    String(r.failed),
    fmt(r.okPerSecond),
    fmt(r.p50),
    fmt(r.p95),
    String(r.peakConnections),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
  const row = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  lines.push(row(header), row(widths.map((w) => '-'.repeat(w))));
  table.forEach((r) => lines.push(row(r)));

  for (const [label, r] of Object.entries(rows)) {
    const reasons = Object.entries(r.errors);
    if (reasons.length) {
      lines.push(`  ${label} failures: ` + reasons.map(([k, v]) => `${k} x${v}`).join(', '));
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}
