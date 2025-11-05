import { FastifyInstance } from 'fastify';
import { parseCsvToPif } from '@app/interop/src/importers/csv';

export default async function importsFile(app: FastifyInstance) {
  app.post('/imports/file', async (req, reply) => {
    const ct = req.headers['content-type'] || '';
    const body = await req.body;
    if (typeof body !== 'string') {
      const err: any = new Error('Expected text body');
      err.statusCode = 400;
      err.code = 'bad_request';
      throw err;
    }

    if (ct.includes('text/csv')) {
      const pif = parseCsvToPif(body);
      return { preview: pif, counts: { tracks: pif.tracks.length } };
    }

    const err: any = new Error('Unsupported format');
    err.statusCode = 400;
    err.code = 'unsupported_format';
    throw err;
  });
}
