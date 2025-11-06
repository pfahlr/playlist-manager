import { describe, expect, test, vi } from 'vitest';
import type { DbHealthcheckResult } from '../src/healthcheck';

async function loadRunHealthcheck() {
  process.env.DATABASE_URL ??=
    'postgresql://placeholder:placeholder@localhost:5432/placeholder';
  const module = await import('../src/healthcheck');
  return module.runHealthcheck;
}

describe('runHealthcheck CLI helper', () => {
  test('exits with 0 and logs success when healthy', async () => {
    const runHealthcheck = await loadRunHealthcheck();
    const exit = vi.fn();
    const info = vi.fn();
    const error = vi.fn();

    await runHealthcheck({
      check: async (): Promise<DbHealthcheckResult> => ({ ok: true }),
      logger: { info, error },
      exit,
    });

    expect(exit).toHaveBeenCalledWith(0);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('database: ok'));
    expect(error).not.toHaveBeenCalled();
  });

  test('exits with 1 and logs error when unhealthy', async () => {
    const runHealthcheck = await loadRunHealthcheck();
    const exit = vi.fn();
    const info = vi.fn();
    const error = vi.fn();

    await runHealthcheck({
      check: async (): Promise<DbHealthcheckResult> => ({
        ok: false,
        error: 'connection refused',
      }),
      logger: { info, error },
      exit,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('database: error'),
    );
    expect(info).not.toHaveBeenCalled();
  });
});
