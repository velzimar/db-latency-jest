import { safePoolSize } from './pool-budget';

describe('safePoolSize', () => {
  it('divides the usable connections between the replicas', () => {
    expect(safePoolSize({ maxConnections: 200, reserved: 20, maxReplicas: 12 })).toBe(15);
  });

  it('matches the interview example: 300 usable / 60 replicas = 5', () => {
    expect(safePoolSize({ maxConnections: 300, reserved: 0, maxReplicas: 60 })).toBe(5);
  });

  it('never returns less than 1', () => {
    expect(safePoolSize({ maxConnections: 100, reserved: 10, maxReplicas: 500 })).toBe(1);
  });

  it('rejects impossible budgets', () => {
    expect(() => safePoolSize({ maxConnections: 10, reserved: 10, maxReplicas: 2 })).toThrow();
    expect(() => safePoolSize({ maxConnections: 10, reserved: 0, maxReplicas: 0 })).toThrow();
  });
});
