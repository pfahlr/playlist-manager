import { FastifyInstance } from 'fastify';

export default async function jobEvents(app: FastifyInstance) {
  app.get('/jobs/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    reply
      .header('Content-Type', 'text/event-stream')
      .header('Cache-Control', 'no-cache')
      .header('Connection', 'keep-alive');

    // TODO: replace with Redis pub/sub; this is a placeholder tick
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(100, p + 10);
      reply.raw.write(`event: progress\ndata: ${JSON.stringify({ job_id: id, percent: p })}\n\n`);
      if (p >= 100) {
        reply.raw.write(`event: done\ndata: ${JSON.stringify({ job_id: id })}\n\n`);
        clearInterval(timer);
        reply.raw.end();
      }
    }, 500);

    req.raw.on('close', () => clearInterval(timer));
    return reply; // keep stream open
  });
}
