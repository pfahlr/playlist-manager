import { prisma } from './client';

/** Lightweight DB ping for health checks and readiness probes */
export async function dbHealthcheck(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
