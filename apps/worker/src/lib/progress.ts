import type { JobProgressStatus } from '@app/interop/jobs/progress';
import { publishJobCompletion, publishJobProgress } from '@app/interop/jobs/progress';

export type ProgressUpdateOptions = {
  status?: JobProgressStatus;
  message?: string | null;
  percent?: number | null;
};

export type ProgressReporterOptions = {
  throttleMs?: number;
};

export type ProgressReporter = {
  report(percent: number, options?: Omit<ProgressUpdateOptions, 'percent'>): void;
  complete(status: Extract<JobProgressStatus, 'succeeded' | 'failed'>, message?: string | null): void;
};

const DEFAULT_THROTTLE_MS = 250;

type PendingUpdate = {
  percent: number;
  status: JobProgressStatus;
  message: string | null;
};

export function createProgressReporter(jobId: number, options: ProgressReporterOptions = {}): ProgressReporter {
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  let lastEmitTimestamp = 0;
  let lastPercent: number | null = null;
  let pending: PendingUpdate | null = null;
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  const flushPending = () => {
    if (pending) {
      emitProgress(pending);
      pending = null;
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const emitProgress = (update: PendingUpdate) => {
    const percent = clampPercent(update.percent ?? lastPercent ?? 0);
    lastPercent = percent;
    lastEmitTimestamp = Date.now();

    publishJobProgress({
      job_id: jobId,
      status: update.status,
      percent,
      message: update.message,
    });
  };

  const scheduleFlush = () => {
    if (timer) return;
    const elapsed = Date.now() - lastEmitTimestamp;
    const delay = Math.max(0, throttleMs - elapsed);
    timer = setTimeout(() => {
      timer = null;
      if (pending) {
        const next = pending;
        pending = null;
        emitProgress(next);
      }
    }, delay);
  };

  return {
    report(percent, updateOptions = {}) {
      if (closed) return;

      const update: PendingUpdate = {
        percent,
        status: updateOptions.status ?? 'running',
        message: updateOptions.message ?? null,
      };

      const elapsed = Date.now() - lastEmitTimestamp;
      if (!lastEmitTimestamp || elapsed >= throttleMs) {
        emitProgress(update);
      } else {
        pending = update;
        scheduleFlush();
      }
    },

    complete(status, message = null) {
      if (closed) return;
      closed = true;
      flushPending();

      publishJobCompletion({
        job_id: jobId,
        status,
        percent: lastPercent ?? 100,
        message,
      });
    },
  };
}

function clampPercent(value: number | null): number {
  if (value === null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
