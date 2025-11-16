import { EventEmitter } from 'node:events';

export type JobProgressStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type JobProgressUpdate = {
  job_id: number;
  status: JobProgressStatus;
  percent?: number | null;
  message?: string | null;
  updated_at?: string | null;
};

export type JobProgressEvent =
  | { type: 'progress'; update: JobProgressUpdate }
  | { type: 'complete'; update: JobProgressUpdate };

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function subscribeToJobProgress(jobId: number, listener: (event: JobProgressEvent) => void): () => void {
  const channel = toChannel(jobId);
  emitter.on(channel, listener);
  return () => {
    emitter.off(channel, listener);
  };
}

export function publishJobProgress(update: JobProgressUpdate): void {
  const normalized = normalizeUpdate(update);
  emitter.emit(toChannel(normalized.job_id), { type: 'progress', update: normalized });
}

export function publishJobCompletion(update: JobProgressUpdate): void {
  const normalized = normalizeUpdate(update);
  emitter.emit(toChannel(normalized.job_id), { type: 'complete', update: normalized });
}

export function resetJobProgressBus(): void {
  emitter.removeAllListeners();
}

function toChannel(jobId: number): string {
  return `job:${jobId}`;
}

function normalizeUpdate(update: JobProgressUpdate): JobProgressUpdate {
  return {
    job_id: update.job_id,
    status: update.status,
    percent: clampPercent(update.percent),
    message: update.message ?? null,
    updated_at: update.updated_at ?? new Date().toISOString(),
  };
}

function clampPercent(value?: number | null): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}
