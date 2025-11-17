import fp from 'fastify-plugin';
import client from 'prom-client';

/**
 * Metrics plugin with Prometheus support
 *
 * Provides:
 * - Process metrics (CPU, memory, etc.) via collectDefaultMetrics
 * - HTTP request counter with route and status labels
 * - Job counters (created, completed, failed)
 * - /metrics endpoint for Prometheus scraping
 */
export default fp(async (app) => {
  // Collect default process metrics (CPU, memory, etc.)
  client.collectDefaultMetrics({
    prefix: 'playlist_manager_',
  });

  // HTTP request counter with route and status labels
  const httpReqs = new client.Counter({
    name: 'playlist_manager_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['route', 'method', 'status'],
  });

  // Job counters for background tasks
  const jobsCreated = new client.Counter({
    name: 'playlist_manager_jobs_created_total',
    help: 'Total number of jobs created',
    labelNames: ['job_type'],
  });

  const jobsCompleted = new client.Counter({
    name: 'playlist_manager_jobs_completed_total',
    help: 'Total number of jobs completed successfully',
    labelNames: ['job_type'],
  });

  const jobsFailed = new client.Counter({
    name: 'playlist_manager_jobs_failed_total',
    help: 'Total number of jobs failed',
    labelNames: ['job_type'],
  });

  // Active jobs gauge
  const jobsActive = new client.Gauge({
    name: 'playlist_manager_jobs_active',
    help: 'Number of jobs currently active',
    labelNames: ['job_type'],
  });

  // Track HTTP requests
  app.addHook('onResponse', (req, reply, done) => {
    httpReqs.inc({
      route: req.routerPath ?? req.url,
      method: req.method,
      status: String(reply.statusCode),
    });
    done();
  });

  // Expose metrics for Prometheus scraping
  app.get('/metrics', async (_req, reply) => {
    reply.type('text/plain');
    return await client.register.metrics();
  });

  // Decorate app with metric helpers for use in job processors
  app.decorate('metrics', {
    jobCreated: (jobType: string) => jobsCreated.inc({ job_type: jobType }),
    jobCompleted: (jobType: string) => jobsCompleted.inc({ job_type: jobType }),
    jobFailed: (jobType: string) => jobsFailed.inc({ job_type: jobType }),
    jobActiveInc: (jobType: string) => jobsActive.inc({ job_type: jobType }),
    jobActiveDec: (jobType: string) => jobsActive.dec({ job_type: jobType }),
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      jobCreated: (jobType: string) => void;
      jobCompleted: (jobType: string) => void;
      jobFailed: (jobType: string) => void;
      jobActiveInc: (jobType: string) => void;
      jobActiveDec: (jobType: string) => void;
    };
  }
}
