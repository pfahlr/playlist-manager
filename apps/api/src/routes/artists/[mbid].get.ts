import { FastifyReply, FastifyRequest } from 'fastify';
import { getArtist } from '../_mockData';

type Params = {
  mbid: string;
};

const MBID_REGEX = /^[0-9a-fA-F-]{36}$/;

export default async function handler(
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) {
  const { mbid } = request.params;
  if (!MBID_REGEX.test(mbid)) {
    return reply.status(400).send({ error: 'bad_request', message: 'Invalid MBID' });
  }

  const artist = getArtist(mbid);
  return reply.send(artist);
}
