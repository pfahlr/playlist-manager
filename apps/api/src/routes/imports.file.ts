import { FastifyInstance } from 'fastify';

import { validatePIF } from '@app/contracts';
import { parseCsvToPif } from '@app/interop/src/importers/csv';
import { parseM3uToPif } from '@app/interop/src/importers/m3u';
import { parsePlsToPif } from '@app/interop/src/importers/pls';
import { parseWplToPif } from '@app/interop/src/importers/wpl';
import { parseXspfToPif } from '@app/interop/src/importers/xspf';
import { isFileImportError } from '@app/interop/src/importers/common';

import { problem } from '../lib/problem';

type Parser = (input: string) => ReturnType<typeof parseCsvToPif>;

const CONTENT_TYPE_PARSERS = new Map<string, Parser>([
  ['text/csv', parseCsvToPif],
  ['application/csv', parseCsvToPif],
  ['text/x-csv', parseCsvToPif],
  ['audio/x-mpegurl', parseM3uToPif],
  ['application/x-mpegurl', parseM3uToPif],
  ['application/vnd.apple.mpegurl', parseM3uToPif],
  ['audio/mpegurl', parseM3uToPif],
  ['application/xspf+xml', parseXspfToPif],
  ['application/x-xspf+xml', parseXspfToPif],
  ['application/pls+xml', parsePlsToPif],
  ['audio/x-scpls', parsePlsToPif],
  ['application/vnd.ms-wpl', parseWplToPif],
  ['application/wpl+xml', parseWplToPif],
]);

const sniffParserFromBody = (body: string): Parser | null => {
  const trimmed = body.trimStart();
  if (trimmed.startsWith('#EXTM3U')) return parseM3uToPif;
  if (trimmed.startsWith('[playlist]')) return parsePlsToPif;
  if (trimmed.startsWith('<?wpl') || trimmed.includes('<smil')) return parseWplToPif;
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<playlist')) {
    if (trimmed.includes('http://xspf.org/ns/0/')) {
      return parseXspfToPif;
    }
  }
  if (trimmed.toLowerCase().startsWith('position,')) return parseCsvToPif;
  return null;
};

const resolveParser = (contentType: string | undefined, body: string): Parser | null => {
  if (contentType) {
    const exact = CONTENT_TYPE_PARSERS.get(contentType);
    if (exact) return exact;
  }
  return sniffParserFromBody(body);
};

const coerceBodyToString = (payload: unknown): string | null => {
  if (typeof payload === 'string') return payload;
  if (payload instanceof Buffer) return payload.toString('utf8');
  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView;
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('utf8');
  }
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString('utf8');
  }
  return null;
};

export default async function importsFile(app: FastifyInstance) {
  app.post('/imports/file', async (req) => {
    const rawContentType = req.headers['content-type'] ?? '';
    const contentType = typeof rawContentType === 'string' ? rawContentType.split(';')[0].trim().toLowerCase() : '';

    const payload = await req.body;
    const textBody = coerceBodyToString(payload);
    if (textBody === null) {
      throw problem({
        status: 400,
        code: 'invalid_playlist_payload',
        message: 'Expected playlist file contents as text',
      });
    }

    const parser = resolveParser(contentType, textBody);
    if (!parser) {
      throw problem({
        status: 400,
        code: 'unsupported_playlist_format',
        message: 'Unsupported playlist file format',
      });
    }

    let document;
    try {
      document = parser(textBody);
    } catch (error) {
      if (isFileImportError(error)) {
        throw problem({
          status: 400,
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        });
      }
      throw error;
    }

    const validation = validatePIF(document);
    if (!validation.success) {
      throw problem({
        status: 400,
        code: 'invalid_playlist_file',
        message: 'Playlist file failed schema validation',
        details: { errors: validation.errors },
      });
    }

    const preview = validation.data;
    return {
      preview,
      counts: {
        tracks: preview.tracks.length,
      },
    };
  });
}
