import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/jobs/enqueue', () => ({
  enqueue: vi.fn(),
}));

import { enqueue } from '../../lib/jobs/enqueue';
import exportsFileHandler from '../exports/file.post';
import jobsMigrateHandler from '../jobs/migrate.post';

const enqueueMock = vi.mocked(enqueue);

describe('POST /exports/file idempotency', () => {
  afterEach(() => {
    enqueueMock.mockReset();
  });

  it('reuses the original job for repeat payloads with the same Idempotency-Key', async () => {
    enqueueMock.mockResolvedValueOnce({ id: 701 }).mockResolvedValueOnce({ id: 702 });

    const firstReply = createReply();
    await exportsFileHandler(createExportRequest('export-key-1'), firstReply as any);

    expect(firstReply.status).toHaveBeenCalledWith(202);
    expect(firstReply.send).toHaveBeenCalledWith({ job_id: 701, status: 'queued' });
    expect(enqueueMock).toHaveBeenCalledTimes(1);

    const secondReply = createReply();
    await exportsFileHandler(createExportRequest('export-key-1'), secondReply as any);

    expect(secondReply.status).toHaveBeenCalledWith(202);
    expect(secondReply.send).toHaveBeenCalledWith({ job_id: 701, status: 'queued' });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /jobs/migrate idempotency', () => {
  afterEach(() => {
    enqueueMock.mockReset();
  });

  it('returns the original job when the payload is repeated', async () => {
    enqueueMock.mockResolvedValueOnce({ id: 9901 }).mockResolvedValueOnce({ id: 9902 });

    const firstReply = createReply();
    await jobsMigrateHandler(createMigrateRequest('migrate-key-1'), firstReply as any);
    expect(firstReply.send).toHaveBeenCalledWith({ job_id: 9901, status: 'queued' });

    const secondReply = createReply();
    await jobsMigrateHandler(createMigrateRequest('migrate-key-1'), secondReply as any);
    expect(secondReply.send).toHaveBeenCalledWith({ job_id: 9901, status: 'queued' });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('throws a 422 idempotency_conflict when the payload changes for the same key', async () => {
    enqueueMock.mockResolvedValueOnce({ id: 8811 });

    const firstReply = createReply();
    await jobsMigrateHandler(createMigrateRequest('migrate-key-2'), firstReply as any);
    expect(firstReply.send).toHaveBeenCalledWith({ job_id: 8811, status: 'queued' });

    const mutatedRequest = createMigrateRequest('migrate-key-2', { dest_playlist_name: 'Different name' });
    const secondReply = createReply();

    await expect(jobsMigrateHandler(mutatedRequest, secondReply as any)).rejects.toMatchObject({
      statusCode: 422,
      code: 'idempotency_conflict',
    });

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(secondReply.send).not.toHaveBeenCalled();
  });
});

function createReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

function createExportRequest(key: string, overrides: Record<string, unknown> = {}) {
  return {
    body: {
      playlist_id: 77,
      format: 'csv',
      variant: 'lean',
      ...overrides,
    },
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
    },
  };
}

function createMigrateRequest(key: string, overrides: Record<string, unknown> = {}) {
  return {
    body: {
      source_provider: 'spotify',
      source_playlist_id: 10,
      dest_provider: 'spotify',
      dest_playlist_name: 'Mirror copy',
      ...overrides,
    },
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
    },
    requireProvider: vi.fn(),
  };
}
