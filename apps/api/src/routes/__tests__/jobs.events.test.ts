import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

import jobEvents from '../jobs.events';
import {
  publishJobCompletion,
  publishJobProgress,
  resetJobProgressBus,
} from '@app/interop/jobs/progress';

describe('GET /jobs/:id/events', () => {
  afterEach(() => {
    resetJobProgressBus();
    vi.useRealTimers();
  });

  it('streams job progress updates through SSE', async () => {
    vi.useFakeTimers();
    const handler = await registerHandler();
    const harness = createSseHarness(7001);

    await handler(harness.request as any, harness.reply as any);

    publishJobProgress({ job_id: 7001, percent: 12, status: 'running', message: 'queued' });
    publishJobProgress({ job_id: 1234, percent: 90, status: 'running' }); // ignored
    publishJobProgress({ job_id: 7001, percent: 66, status: 'running', message: 'copying tracks' });
    publishJobCompletion({ job_id: 7001, status: 'succeeded', percent: 100 });

    vi.runOnlyPendingTimers();

    const body = await harness.read();
    const events = parseSse(body);

    expect(events).toEqual([
      {
        event: 'progress',
        data: expect.objectContaining({ job_id: 7001, percent: 12, status: 'running', message: 'queued' }),
      },
      {
        event: 'progress',
        data: expect.objectContaining({ job_id: 7001, percent: 66, status: 'running', message: 'copying tracks' }),
      },
      {
        event: 'complete',
        data: expect.objectContaining({ job_id: 7001, status: 'succeeded', percent: 100 }),
      },
    ]);
  });

  it('closes the stream when the job fails', async () => {
    vi.useFakeTimers();
    const handler = await registerHandler();
    const harness = createSseHarness(8112);

    await handler(harness.request as any, harness.reply as any);

    publishJobProgress({ job_id: 8112, percent: 10, status: 'running' });
    publishJobCompletion({ job_id: 8112, status: 'failed', message: 'Rate limited' });

    vi.runOnlyPendingTimers();

    const events = parseSse(await harness.read());

    expect(events).toEqual([
      {
        event: 'progress',
        data: expect.objectContaining({ job_id: 8112, percent: 10, status: 'running' }),
      },
      {
        event: 'complete',
        data: expect.objectContaining({ job_id: 8112, status: 'failed', message: 'Rate limited' }),
      },
    ]);
  });
});

function parseSse(body: string) {
  return body
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event:')) ?? '';
      const dataLine = lines.find((line) => line.startsWith('data:')) ?? '';
      const event = eventLine.replace('event:', '').trim();
      const json = dataLine.replace('data:', '').trim();
      if (!event) {
        return null;
      }
      return {
        event,
        data: json ? JSON.parse(json) : null,
      };
    })
    .filter(Boolean) as Array<{ event: string; data: any }>;
}

async function registerHandler() {
  let capturedHandler: ((req: unknown, reply: unknown) => Promise<unknown>) | null = null;
  const fakeApp = {
    get(_url: string, handler: any) {
      capturedHandler = handler;
    },
  };
  await jobEvents(fakeApp as any);
  return capturedHandler!;
}

function createSseHarness(jobId: number) {
  const stream = new PassThrough();
  let body = '';
  stream.on('data', (chunk) => {
    body += chunk.toString('utf8');
  });

  const reply = {
    raw: stream as unknown as NodeJS.WritableStream,
    header: vi.fn(() => reply),
  };

  const request = {
    params: { id: jobId.toString() },
    raw: new PassThrough(),
  };

  return {
    request,
    reply,
    read: () =>
      new Promise<string>((resolve) => {
        stream.on('end', () => resolve(body));
      }),
  };
}
