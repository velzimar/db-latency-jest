/**
 * Computes a SAFE pool size per replica, starting from the database.
 *
 *   (max_connections - reserved) / maxReplicas
 *
 * "reserved" = connections kept for admins, migrations, scheduled workers...
 * Example: (200 - 20) / 12 replicas = 15 connections each.
 */
export function safePoolSize(opts: {
  maxConnections: number;
  reserved: number;
  maxReplicas: number;
}): number {
  const usable = opts.maxConnections - opts.reserved;
  if (usable <= 0) throw new Error('reserved >= maxConnections: nothing left for the app');
  if (opts.maxReplicas <= 0) throw new Error('maxReplicas must be > 0');
  return Math.max(1, Math.floor(usable / opts.maxReplicas));
}
