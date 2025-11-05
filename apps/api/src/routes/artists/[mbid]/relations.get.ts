import { FastifyReply, FastifyRequest } from 'fastify';
import { getArtistRelations } from '../../_mockData';
import { problem } from '../../../lib/problem';

type Params = {
  mbid: string;
};

type Query = {
  types?: string | string[];
};

const MBID_REGEX = /^[0-9a-fA-F-]{36}$/;

export default async function handler(
  request: FastifyRequest<{ Params: Params; Querystring: Query }>,
  reply: FastifyReply,
) {
  const { mbid } = request.params;
  if (!MBID_REGEX.test(mbid)) {
    throw problem({ status: 400, code: 'invalid_mbid', message: 'Invalid MBID' });
  }

  const payload = getArtistRelations(mbid);
  const allowed = new Set(
    ((): string[] => {
      const { types } = request.query ?? {};
      if (!types) return [];
      if (Array.isArray(types)) return types;
      return types.split(',').map((value) => value.trim()).filter(Boolean);
    })(),
  );

  const data = allowed.size
    ? payload.data.filter((relation) => allowed.has(relation.type))
    : payload.data;

  return reply.send({ data });
}
