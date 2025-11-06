import { prisma } from './client';

export type DbHealthcheckResult =
  | { ok: true }
  | { ok: false; error: string };

type RunHealthcheckDeps = {
  check?: () => Promise<DbHealthcheckResult>;
  logger?: Pick<Console, 'info' | 'error'>;
  exit?: (code: number) => void;
};

/** Lightweight DB ping for health checks and readiness probes */
export async function dbHealthcheck(): Promise<DbHealthcheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * CLI-friendly entrypoint that wraps {@link dbHealthcheck} and emits a clear status.
 */
export async function runHealthcheck({
  check = dbHealthcheck,
  logger = console,
  exit = process.exit,
}: RunHealthcheckDeps = {}): Promise<void> {
  try {
    const result = await check();
    if (result.ok) {
      logger.info?.('database: ok');
      exit(0);
    } else {
      logger.error?.(`database: error — ${result.error}`);
      exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error?.(`database: error — ${message}`);
    exit(1);
  }
}

if (import.meta.main) {
  runHealthcheck().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`database: error — ${message}`);
    process.exit(1);
  });
}
