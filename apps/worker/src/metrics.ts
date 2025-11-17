/**
 * Worker metrics module
 *
 * Provides Prometheus metrics for worker job processing.
 * Can be extended to expose a /metrics endpoint for the worker process.
 */

import client from 'prom-client';

// Collect default process metrics for the worker
client.collectDefaultMetrics({
  prefix: 'playlist_manager_worker_',
});

// Job processing counters
export const jobsProcessed = new client.Counter({
  name: 'playlist_manager_worker_jobs_processed_total',
  help: 'Total number of jobs processed by the worker',
  labelNames: ['job_type', 'status'],
});

export const jobDuration = new client.Histogram({
  name: 'playlist_manager_worker_job_duration_seconds',
  help: 'Duration of job processing in seconds',
  labelNames: ['job_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300], // 100ms to 5 minutes
});

export const jobsActive = new client.Gauge({
  name: 'playlist_manager_worker_jobs_active',
  help: 'Number of jobs currently being processed',
  labelNames: ['job_type'],
});

/**
 * Get current metrics as Prometheus text format
 */
export async function getMetrics(): Promise<string> {
  return await client.register.metrics();
}

/**
 * Helper to track job execution with metrics
 */
export async function trackJob<T>(
  jobType: string,
  fn: () => Promise<T>
): Promise<T> {
  const end = jobDuration.startTimer({ job_type: jobType });
  jobsActive.inc({ job_type: jobType });

  try {
    const result = await fn();
    jobsProcessed.inc({ job_type: jobType, status: 'success' });
    return result;
  } catch (error) {
    jobsProcessed.inc({ job_type: jobType, status: 'failed' });
    throw error;
  } finally {
    end();
    jobsActive.dec({ job_type: jobType });
  }
}
