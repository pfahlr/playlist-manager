import { afterEach, describe, expect, it, vi } from 'vitest';

describe('idempotency store', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.IDEMPOTENCY_TTL_SECONDS;
    delete process.env.IDEMPOTENCY_STORE_BACKEND;
    delete process.env.NODE_ENV;
  });

  it('expires remembered keys after the configured TTL', async () => {
    process.env.IDEMPOTENCY_TTL_SECONDS = '1';
    process.env.IDEMPOTENCY_STORE_BACKEND = 'memory';
    process.env.NODE_ENV = 'development';
    vi.resetModules();

    const { remember, lookup } = await import('../idempotency');

    await remember('ttl-key', 'fingerprint-a', 77);
    const entry = await lookup('ttl-key');
    expect(entry?.jobId).toBe(77);

    // Wait for TTL (1 second)
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const expired = await lookup('ttl-key');
    expect(expired).toBeNull();
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
