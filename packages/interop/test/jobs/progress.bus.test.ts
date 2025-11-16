import { afterEach, describe, expect, it } from 'vitest';

import {
  publishJobCompletion,
  publishJobProgress,
  resetJobProgressBus,
  subscribeToJobProgress,
  type JobProgressEvent,
} from '../../src/jobs/progress';

describe('job progress bus', () => {
  afterEach(() => {
    resetJobProgressBus();
  });

  it('delivers progress and completion events for the subscribed job id', () => {
    const received: JobProgressEvent[] = [];
    const unsubscribe = subscribeToJobProgress(3001, (event) => {
      received.push(event);
    });

    publishJobProgress({ job_id: 3001, status: 'running', percent: 10 });
    publishJobProgress({ job_id: 3222, status: 'running', percent: 50 }); // ignored
    publishJobCompletion({ job_id: 3001, status: 'succeeded', percent: 100 });

    unsubscribe();

    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({
      type: 'progress',
      update: { job_id: 3001, status: 'running', percent: 10 },
    });
    expect(received[1]).toMatchObject({
      type: 'complete',
      update: { job_id: 3001, status: 'succeeded', percent: 100 },
    });
  });

  it('stops delivery after reset', () => {
    const received: JobProgressEvent[] = [];
    subscribeToJobProgress(501, (event) => received.push(event));

    publishJobProgress({ job_id: 501, status: 'running', percent: 5 });
    resetJobProgressBus();
    publishJobCompletion({ job_id: 501, status: 'failed' });

    expect(received).toEqual([
      expect.objectContaining({
        type: 'progress',
        update: expect.objectContaining({ job_id: 501, status: 'running', percent: 5 }),
      }),
    ]);
  });
});
