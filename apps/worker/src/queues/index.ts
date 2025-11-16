import { Queue, QueueScheduler, Worker } from 'bullmq';

import { redisConnection, workerConfig } from '../config';
import { runGcOnce, snapshotGcJobName } from '../jobs/snapshotGc';

const SNAPSHOT_GC_REPEAT_JOB_ID = 'snapshot-gc:daily';
const SNAPSHOT_GC_TIMEZONE = 'UTC';

export type SnapshotGcRuntime = {
  queue: Queue;
  scheduler: QueueScheduler;
  worker: Worker;
};

function buildConnectionOptions() {
  return {
    connection: {
      ...redisConnection,
      tls: redisConnection.tls ? { ...redisConnection.tls } : undefined,
    },
  };
}

export function createSnapshotGcQueue() {
  return new Queue(snapshotGcJobName, buildConnectionOptions());
}

export function createSnapshotGcScheduler() {
  return new QueueScheduler(snapshotGcJobName, buildConnectionOptions());
}

export function createSnapshotGcWorker() {
  return new Worker(
    snapshotGcJobName,
    async () => {
      const cleared = await runGcOnce();
      return { cleared };
    },
    buildConnectionOptions(),
  );
}

export async function ensureSnapshotGcSchedule(queue?: Queue) {
  const targetQueue = queue ?? createSnapshotGcQueue();
  const repeatJobs = await targetQueue.getRepeatableJobs();
  const cron = workerConfig.snapshotGcCron;
  let alreadyScheduled = false;

  for (const job of repeatJobs) {
    if (job.id !== SNAPSHOT_GC_REPEAT_JOB_ID) continue;
    if (job.cron === cron) {
      alreadyScheduled = true;
      continue;
    }
    await targetQueue.removeRepeatableByKey(job.key);
  }

  if (!alreadyScheduled) {
    await targetQueue.add(
      snapshotGcJobName,
      { reason: 'scheduled' },
      {
        jobId: SNAPSHOT_GC_REPEAT_JOB_ID,
        repeat: {
          cron,
          tz: SNAPSHOT_GC_TIMEZONE,
        },
        removeOnComplete: 25,
        removeOnFail: 100,
      },
    );
  }

  return targetQueue;
}

export async function setupSnapshotGc(): Promise<SnapshotGcRuntime> {
  const queue = createSnapshotGcQueue();
  const scheduler = createSnapshotGcScheduler();
  await scheduler.waitUntilReady();
  await ensureSnapshotGcSchedule(queue);
  const worker = createSnapshotGcWorker();
  return { queue, scheduler, worker };
}
