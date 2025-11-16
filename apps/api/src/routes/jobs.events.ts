import { FastifyInstance } from 'fastify';

import { subscribeToJobProgress } from '@app/interop/jobs/progress';

import { problem } from '../lib/problem';

type Params = {
  id: string;
};

export default async function jobEvents(app: FastifyInstance) {
  app.get('/jobs/:id/events', async (req, reply) => {
    const { id } = req.params as Params;
    const jobId = Number.parseInt(id, 10);
    if (Number.isNaN(jobId)) {
      throw problem({ status: 400, code: 'invalid_job_id', message: 'Invalid job id' });
    }

    reply
      .header('Content-Type', 'text/event-stream')
      .header('Cache-Control', 'no-cache')
      .header('Connection', 'keep-alive');

    reply.raw.write('retry: 5000\n\n');

    let closed = false;
    const unsubscribe = subscribeToJobProgress(jobId, (event) => {
      if (closed) return;
      const eventName = event.type === 'progress' ? 'progress' : 'complete';
      writeSseEvent(reply.raw, eventName, event.update);
      if (event.type === 'complete') {
        closed = true;
        unsubscribe();
        reply.raw.end();
      }
    });

    req.raw.on('close', () => {
      if (closed) return;
      closed = true;
      unsubscribe();
    });

    return reply;
  });
}

function writeSseEvent(stream: NodeJS.WritableStream, event: string, payload: unknown) {
  stream.write(`event: ${event}\n`);
  stream.write(`data: ${JSON.stringify(payload)}\n\n`);
}
