import { FastifyReply, FastifyRequest } from 'fastify';
import { appendPlaylistItem } from '../../_mockData';
import { problem } from '../../../lib/problem';

type AppendByRecording = {
  recording_id: number;
  position?: 'append' | 'head';
};

type AppendByIsrc = {
  isrc: string;
  position?: 'append' | 'head';
};

type AppendByMetadata = {
  title: string;
  primary_artist: string;
  position?: 'append' | 'head';
};

type Body = AppendByRecording | AppendByIsrc | AppendByMetadata;

function isValidBody(payload: Body | undefined): payload is Body {
  if (!payload || typeof payload !== 'object') return false;
  if ('recording_id' in payload) {
    return typeof payload.recording_id === 'number';
  }
  if ('isrc' in payload) {
    return typeof payload.isrc === 'string' && payload.isrc.length > 0;
  }
  return (
    'title' in payload &&
    typeof payload.title === 'string' &&
    payload.title.length > 0 &&
    'primary_artist' in payload &&
    typeof payload.primary_artist === 'string' &&
    payload.primary_artist.length > 0
  );
}

export default async function handler(
  request: FastifyRequest<{ Body: Body }>,
  reply: FastifyReply,
) {
  const payload = request.body;
  if (!isValidBody(payload)) {
    throw problem({ status: 400, code: 'invalid_playlist_item_request', message: 'Invalid request body' });
  }

  const item = appendPlaylistItem(payload as Record<string, unknown>);
  return reply.status(201).send(item);
}
