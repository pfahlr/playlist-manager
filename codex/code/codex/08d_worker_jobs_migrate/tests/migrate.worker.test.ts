import { afterAll, beforeEach, expect, test, vi } from 'vitest';

const prismaClientModule = vi.hoisted(() => createPrismaClientModule());
vi.mock('@prisma/client', () => prismaClientModule, { virtual: true });

const dbModule = vi.hoisted(() => ({ prisma: createPrismaStub() }));
vi.mock('@app/db', () => dbModule);

import { prisma } from '@app/db';
import { processMigrate } from '../../../../../apps/worker/src/processors/migrate';
import * as Prov from '../../../../../apps/worker/src/providers';

beforeEach(async () => {
  await resetDatabase();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

test('migrate produces a report', async () => {
  const providerMocks = createProviderMocks();

  vi.spyOn(Prov, 'getProviderAuthForUser').mockResolvedValue({ token: 'stub-token' } as any);
  vi.spyOn(Prov, 'getProvider').mockImplementation((name: string) => {
    return providerMocks[name as keyof typeof providerMocks] ?? providerMocks.spotify;
  });

  const job = await prisma.job.create({
    data: {
      user_id: 777,
      kind: 'migrate',
      status: 'queued',
      provider_from: 'spotify',
      provider_to: 'tidal',
    },
  });

  const result = await processMigrate({
    jobId: job.id,
    payload: {
      source_provider: 'spotify',
      source_playlist_id: 42,
      dest_provider: 'tidal',
      dest_playlist_name: 'Migrated Copy',
    },
  } as any);

  expect(result.report.matched_isrc_pct).toBeGreaterThanOrEqual(100);
  expect(providerMocks.spotify.readPlaylist).toHaveBeenCalledTimes(1);
  const [writtenDoc] = providerMocks.tidal.writePlaylist.mock.calls[0] ?? [];
  expect(writtenDoc?.name).toBe('Migrated Copy');

  const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
  expect(updatedJob?.status).toBe('succeeded');
  expect(updatedJob?.report_json).toMatchObject({
    matched_isrc_pct: 100,
    matched_fuzzy_pct: 0,
    unresolved: [],
  });
});

async function resetDatabase() {
  if (typeof (prisma as any).__reset === 'function') {
    await (prisma as any).__reset();
  }
}

function createProviderMocks() {
  const source = {
    name: 'spotify',
    readPlaylist: vi.fn(async () => ({
      name: 'Source Playlist',
      description: null,
      source_service: 'spotify',
      source_playlist_id: 'playlist-42',
      tracks: [
        { position: 1, title: 'Track A', artists: ['Artist'], isrc: 'US1', album: null },
      ],
    })),
    writePlaylist: vi.fn(),
  };

  const dest = {
    name: 'tidal',
    readPlaylist: vi.fn(),
    writePlaylist: vi.fn(async (doc: any) => ({
      destId: 'tidal-xyz',
      report: { attempted: doc.tracks.length, added: doc.tracks.length, failed: 0 },
    })),
  };

  return { spotify: source, tidal: dest };
}

function createPrismaClientModule() {
  class PrismaClient {}
  const Prisma = {
    sql(strings: TemplateStringsArray, ...values: unknown[]) {
      return { strings, values };
    },
  };
  return { PrismaClient, Prisma };
}

type JobRecord = {
  id: number;
  user_id: number;
  kind: string;
  status: string;
  provider_from: string | null;
  provider_to: string | null;
  playlist_id: number | null;
  artifact_url: string | null;
  report_json: any;
};

function createPrismaStub() {
  let seq = 1;
  const jobs: JobRecord[] = [];

  const reset = () => {
    seq = 1;
    jobs.length = 0;
  };

  return {
    async $disconnect() {
      reset();
    },
    async __reset() {
      reset();
    },
    job: {
      async create({ data }: { data: Partial<JobRecord> }) {
        const record: JobRecord = {
          id: seq++,
          user_id: data.user_id ?? 0,
          kind: data.kind ?? 'migrate',
          status: data.status ?? 'queued',
          provider_from: data.provider_from ?? null,
          provider_to: data.provider_to ?? null,
          playlist_id: data.playlist_id ?? null,
          artifact_url: data.artifact_url ?? null,
          report_json: data.report_json ?? null,
        };
        jobs.push(record);
        return { ...record };
      },
      async findUnique({ where }: { where: { id: number } }) {
        const job = jobs.find((j) => j.id === where.id);
        return job ? { ...job } : null;
      },
      async update({ where, data }: { where: { id: number }; data: Partial<JobRecord> }) {
        const index = jobs.findIndex((j) => j.id === where.id);
        if (index < 0) {
          throw new Error('Job not found');
        }
        jobs[index] = { ...jobs[index], ...data };
        return { ...jobs[index] };
      },
    },
  };
}
