type Entry = { fingerprint: string; jobId: string; expiresAt: number };
const STORE = new Map<string, Entry>();
const TTL_MS = Number(process.env.IDEMPOTENCY_TTL_MS ?? 15 * 60_000);

function now() { return Date.now(); }
function sweep() {
  const t = now();
  for (const [k, v] of STORE) if (v.expiresAt < t) STORE.delete(k);
}

export function remember(key: string, fingerprint: string, jobId: string) {
  sweep();
  STORE.set(key, { fingerprint, jobId, expiresAt: now() + TTL_MS });
}

export function lookup(key: string): Entry | undefined {
  sweep();
  return STORE.get(key);
}
