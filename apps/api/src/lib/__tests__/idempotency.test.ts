import { afterEach, describe, expect, it, vi } from 'vitest';

describe('idempotency store', () => {
  afterEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    delete process.env.IDEMPOTENCY_TTL_SECONDS;
  });

  it('expires remembered keys after the configured TTL', async () => {
    vi.useFakeTimers();
    process.env.IDEMPOTENCY_TTL_SECONDS = '1';
    vi.resetModules();

    const { remember, lookup } = await import('../idempotency');

    remember('ttl-key', 'fingerprint-a', 77);
    expect(lookup('ttl-key')?.jobId).toBe(77);

    vi.advanceTimersByTime(1000);
    expect(lookup('ttl-key')).toBeUndefined();
  });

  it('computes identical fingerprints for the same payload regardless of key order', async () => {
    const { fingerprintRequest } = await import('../idempotency');

    const first = fingerprintRequest({
      method: 'POST',
      path: '/exports/file',
      body: { playlist_id: 11, format: 'csv', variant: 'lean' },
    });

    const second = fingerprintRequest({
      method: 'post',
      path: '/exports/file',
      body: { format: 'csv', variant: 'lean', playlist_id: 11 },
    });

    const differentPath = fingerprintRequest({
      method: 'POST',
      path: '/jobs/migrate',
      body: { playlist_id: 11, format: 'csv', variant: 'lean' },
    });

    expect(first).toBe(second);
    expect(differentPath).not.toBe(first);
  });
});
