import { FastifyReply, FastifyRequest } from 'fastify';
import { getArtist } from '../_mockData';
import { problem } from '../../lib/problem';

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
    throw problem({ status: 400, code: 'invalid_mbid', message: 'Invalid MBID' });
  }

  const artist = getArtist(mbid);
  return reply.send(artist);
}
