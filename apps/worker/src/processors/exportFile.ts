import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

import type { PIFDocument, PIFProviderIds, PIFProviderService, PIFTrack } from '@app/contracts';
import { Prisma, type Playlist, type ProviderTrackMap } from '@prisma/client';

import { prisma } from '@app/db';
import { renderCsv, type CsvVariant, renderM3U, renderXSPF } from '@app/providers-file-exporters';
import * as objectStore from '../storage/objectStore';

const gzipAsync = promisify(gzip);

type ExportFormat = 'csv' | 'm3u' | 'xspf';

export type ExportFilePayload = {
  playlist_id: number;
  format: ExportFormat;
  variant?: CsvVariant;
};

export type ExportProcessorContext = {
  jobId: number;
  payload: ExportFilePayload;
};

type EffectiveItemRow = {
  id: number;
  playlist_id: number;
  position: number | null;
  title: string | null;
  artists: string | null;
  album: string | null;
  duration_ms: number | null;
  recording_id: number | null;
  isrc: string | null;
  mb_recording_id: string | null;
  mb_release_id: string | null;
  provider_track_id: string | null;
};

type ProviderTrackRow = Pick<ProviderTrackMap, 'provider' | 'provider_track_id' | 'recording_id'>;

type ProcessResult = {
  artifactUrl: string;
  objectKey: string;
};

const PROVIDER_ID_FIELDS: Record<string, keyof PIFProviderIds> = {
  spotify: 'spotify_track_id',
  deezer: 'deezer_track_id',
  tidal: 'tidal_track_id',
  youtube: 'youtube_video_id',
  amazon: 'amazon_track_id',
};

const SUPPORTED_FORMATS: ExportFormat[] = ['csv', 'm3u', 'xspf'];
const PROVIDER_SERVICES = new Set<PIFProviderService>(['spotify', 'deezer', 'tidal', 'youtube', 'amazon']);

export async function processExportFile(ctx: ExportProcessorContext): Promise<ProcessResult> {
  const { jobId, payload } = ctx;
  assertPayload(payload);
  const format = payload.format;
  const csvVariant: CsvVariant = payload.variant ?? 'lean';

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  try {
    if (job.status !== 'running') {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'running' },
      });
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: payload.playlist_id },
    });
    if (!playlist) {
      throw new Error(`Playlist ${payload.playlist_id} not found`);
    }

    const items = await fetchEffectiveItems(playlist.id);
    if (items.length === 0) {
      throw new Error(`Playlist ${playlist.id} has no items to export`);
    }

    const providerMap = await loadProviderTrackMap(items);
    const document = buildPifDocument(playlist, items, providerMap);
    const rendered = renderDocument(document, format, csvVariant);
    const compressed = await gzipAsync(Buffer.from(rendered, 'utf8'));
    const objectKey = buildObjectKey({
      playlistId: playlist.id,
      format,
      variant: format === 'csv' ? csvVariant : undefined,
    });

    const artifactUrl = await objectStore.write(compressed, 'application/gzip', objectKey);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'succeeded',
        artifact_url: artifactUrl,
      },
    });

    return { artifactUrl, objectKey };
  } catch (error) {
    await markJobFailed(jobId, error);
    throw error;
  }
}

async function fetchEffectiveItems(playlistId: number): Promise<EffectiveItemRow[]> {
  return prisma.$queryRaw<EffectiveItemRow[]>(
    Prisma.sql`
      SELECT
        id,
        playlist_id,
        position,
        title,
        artists,
        album,
        duration_ms,
        recording_id,
        isrc,
        mb_recording_id,
        mb_release_id,
        provider_track_id
      FROM v_playlist_item_effective
      WHERE playlist_id = ${playlistId}
      ORDER BY position ASC NULLS LAST, id ASC
    `,
  );
}

async function loadProviderTrackMap(items: EffectiveItemRow[]): Promise<Map<number, ProviderTrackRow[]>> {
  const recordingIds = Array.from(
    new Set(items.map((row) => row.recording_id).filter((id): id is number => typeof id === 'number')),
  );

  if (recordingIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.providerTrackMap.findMany({
    where: { recording_id: { in: recordingIds } },
    select: {
      recording_id: true,
      provider: true,
      provider_track_id: true,
    },
  });

  const map = new Map<number, ProviderTrackRow[]>();
  for (const row of rows) {
    const list = map.get(row.recording_id) ?? [];
    list.push(row);
    map.set(row.recording_id, list);
  }
  return map;
}

function buildPifDocument(
  playlist: Playlist,
  items: EffectiveItemRow[],
  providerMap: Map<number, ProviderTrackRow[]>,
): PIFDocument {
  const sourceService = normalizeProviderService(playlist.provider);
  const tracks = items.map((row, index) => buildTrack(row, index, providerMap, sourceService));

  return {
    name: playlist.name ?? `Playlist #${playlist.id}`,
    description: playlist.description ?? null,
    source_service: sourceService,
    source_playlist_id: playlist.provider_playlist_id ?? null,
    tracks,
  };
}

function buildTrack(
  row: EffectiveItemRow,
  index: number,
  providerMap: Map<number, ProviderTrackRow[]>,
  playlistProvider: PIFProviderService | null,
): PIFTrack {
  const artists = splitArtists(row.artists);
  const track: PIFTrack = {
    position: normalizePosition(row.position, index),
    title: row.title ?? `Track ${index + 1}`,
    artists: artists.length > 0 ? artists : ['Unknown Artist'],
    album: row.album,
    duration_ms: row.duration_ms,
    isrc: row.isrc,
    mb_recording_id: row.mb_recording_id,
    mb_release_id: row.mb_release_id,
  };

  const providerIds = buildProviderIds(row, providerMap, playlistProvider);
  if (providerIds) {
    track.provider_ids = providerIds;
  }

  return track;
}

function buildProviderIds(
  row: EffectiveItemRow,
  providerMap: Map<number, ProviderTrackRow[]>,
  playlistProvider: PIFProviderService | null,
): PIFProviderIds | undefined {
  const ids: Partial<PIFProviderIds> = {};

  if (typeof row.recording_id === 'number') {
    const entries = providerMap.get(row.recording_id) ?? [];
    for (const entry of entries) {
      const providerKey = entry.provider.toLowerCase();
      const field = PROVIDER_ID_FIELDS[providerKey];
      if (field) {
        ids[field] = entry.provider_track_id;
      }
    }
  }

  if (playlistProvider && row.provider_track_id) {
    const field = PROVIDER_ID_FIELDS[playlistProvider];
    if (field) {
      ids[field] = row.provider_track_id;
    }
  }

  return Object.keys(ids).length > 0 ? (ids as PIFProviderIds) : undefined;
}

function renderDocument(document: PIFDocument, format: ExportFormat, csvVariant: CsvVariant): string {
  switch (format) {
    case 'csv':
      return renderCsv(document, csvVariant);
    case 'm3u':
      return renderM3U(document);
    case 'xspf':
      return renderXSPF(document);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

function buildObjectKey(args: { playlistId: number; format: ExportFormat; variant?: CsvVariant }): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', 'z');
  const variantSuffix = args.format === 'csv' ? `-${args.variant ?? 'lean'}` : '';
  return `playlists/${args.playlistId}/exports/${timestamp}${variantSuffix}.${args.format}.gz`;
}

function splitArtists(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizePosition(position: number | null, index: number): number {
  if (typeof position === 'number') {
    return Math.max(1, position + 1);
  }
  return index + 1;
}

function normalizeProviderService(value: string | null): PIFProviderService | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase() as PIFProviderService;
  return PROVIDER_SERVICES.has(normalized) ? normalized : null;
}

function assertPayload(payload: ExportFilePayload): asserts payload is ExportFilePayload {
  if (!payload || typeof payload.playlist_id !== 'number' || payload.playlist_id <= 0) {
    throw new Error('playlist_id is required for export_file jobs');
  }
  if (!SUPPORTED_FORMATS.includes(payload.format)) {
    throw new Error(`Unsupported export format: ${payload.format}`);
  }
  if (payload.format !== 'csv' && payload.variant) {
    throw new Error('variant is only supported for CSV exports');
  }
}

async function markJobFailed(jobId: number, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  try {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        report_json: {
          error: message,
        } as Prisma.JsonValue,
      },
    });
  } catch {
    // Ignore secondary failures when marking the job as failed.
  }
}
