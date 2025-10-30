/**
 * Temporary enqueue stub for contract tests.
 * When API_FAKE_ENQUEUE=1, returns a deterministic id without touching Redis/queues.
 * Replace with real BullMQ wiring in worker tasks.
 */
export async function enqueue(_payload: unknown): Promise<{ id: number }> {
  if (process.env.API_FAKE_ENQUEUE === '1') {
    return { id: 999 };
  }
  throw new Error('enqueue not wired yet (set API_FAKE_ENQUEUE=1 for contract tests)');
}
