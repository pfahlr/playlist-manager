import type { PIFDocument, PIFTrack, ProviderName } from '@app/contracts';
import type { MigrationMatchReport, MigrationMatcherResult, MigrationUnresolvedTrack } from '@app/contracts/matcher';
import { Prisma } from '@prisma/client';

import { prisma } from '@app/db';
import { getProvider, getProviderAuthForUser } from '../providers';

const SUPPORTED_PROVIDERS: ProviderName[] = ['spotify', 'deezer', 'tidal', 'youtube'];

export type MigrateJobPayload = {
  source_provider: ProviderName;
  source_playlist_id: number;
  dest_provider: ProviderName;
  dest_playlist_name?: string | null;
};

export type MigrateProcessorContext = {
  jobId: number;
  payload: MigrateJobPayload;
};

export type MigrateProcessorResult = {
  destId: string;
  report: MigrationMatchReport;
};

export async function processMigrate(ctx: MigrateProcessorContext): Promise<MigrateProcessorResult> {
  const { jobId, payload } = ctx;
  assertPayload(payload);

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  try {
    if (job.status !== 'running') {
      await prisma.job.update({ where: { id: jobId }, data: { status: 'running' } });
    }

    const sourceAuth = await getProviderAuthForUser(job.user_id, payload.source_provider);
    const destAuth = await getProviderAuthForUser(job.user_id, payload.dest_provider);

    const sourceProvider = getProvider(payload.source_provider, sourceAuth);
    const destProvider = getProvider(payload.dest_provider, destAuth);

    const rawPlaylist = await sourceProvider.readPlaylist(String(payload.source_playlist_id));
    const preparedPlaylist = normalizePlaylist(rawPlaylist, payload.dest_playlist_name);

    const matchResult = await runMatcher({ source: preparedPlaylist, destProvider: payload.dest_provider });
    const writeResult = await destProvider.writePlaylist(matchResult.playlist);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'succeeded',
        report_json: matchResult.report as Prisma.JsonValue,
      },
    });

    return { destId: writeResult.destId, report: matchResult.report };
  } catch (error) {
    await markJobFailed(jobId, error);
    throw error;
  }
}

async function runMatcher({ source }: { source: PIFDocument; destProvider: ProviderName }): Promise<MigrationMatcherResult> {
  const playlist = cloneDocument(source);
  const report = summarizeByIsrc(playlist.tracks);
  return { playlist, report };
}

function cloneDocument(document: PIFDocument): PIFDocument {
  return {
    ...document,
    tracks: document.tracks.map((track) => ({
      ...track,
      artists: [...track.artists],
      provider_ids: track.provider_ids ? { ...track.provider_ids } : undefined,
    })),
  };
}

function summarizeByIsrc(tracks: PIFTrack[]): MigrationMatchReport {
  const total = tracks.length;
  let isrcMatches = 0;
  const unresolved: MigrationUnresolvedTrack[] = [];

  tracks.forEach((track) => {
    if (hasIsrc(track)) {
      isrcMatches += 1;
    } else {
      unresolved.push({
        position: track.position,
        title: track.title,
        artists: [...track.artists],
        isrc: track.isrc ?? null,
      });
    }
  });

  return {
    matched_isrc_pct: computePercentage(isrcMatches, total),
    matched_fuzzy_pct: 0,
    unresolved,
  };
}

function hasIsrc(track: PIFTrack): boolean {
  if (!track.isrc) return false;
  return track.isrc.trim().length > 0;
}

function computePercentage(count: number, total: number): number {
  if (total === 0) return 0;
  return Number(((count / total) * 100).toFixed(2));
}

function normalizePlaylist(source: PIFDocument, overrideName?: string | null): PIFDocument {
  const trimmedName = overrideName?.trim();
  const name = trimmedName && trimmedName.length > 0 ? trimmedName : source.name;
  const tracks = source.tracks.map((track, index) => ({
    ...track,
    position: normalizePosition(track.position, index),
  }));
  return { ...source, name, tracks };
}

function normalizePosition(position: number | undefined | null, index: number): number {
  if (typeof position === 'number' && Number.isFinite(position) && position > 0) {
    return position;
  }
  return index + 1;
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

function assertPayload(payload: MigrateJobPayload): asserts payload is MigrateJobPayload {
  if (!payload || !SUPPORTED_PROVIDERS.includes(payload.source_provider)) {
    throw new Error('source_provider is required for migrate jobs');
  }
  if (!SUPPORTED_PROVIDERS.includes(payload.dest_provider)) {
    throw new Error('dest_provider is required for migrate jobs');
  }
  if (typeof payload.source_playlist_id !== 'number' || payload.source_playlist_id <= 0) {
    throw new Error('source_playlist_id must be a positive number');
  }
}
