import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/interop/jobs/progress', () => {
  return {
    publishJobProgress: vi.fn(),
    publishJobCompletion: vi.fn(),
  };
});

import { publishJobCompletion, publishJobProgress } from '@app/interop/jobs/progress';
import { createProgressReporter } from '../progress';

describe('worker progress reporter', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('clamps percentages and forwards metadata to the progress bus', () => {
    const reporter = createProgressReporter(1234, { throttleMs: 0 });

    reporter.report(-10, { status: 'running', message: 'Booting' });
    reporter.report(175);

    expect(publishJobProgress).toHaveBeenCalledTimes(2);
    expect(publishJobProgress).toHaveBeenNthCalledWith(1, {
      job_id: 1234,
      status: 'running',
      percent: 0,
      message: 'Booting',
    });
    expect(publishJobProgress).toHaveBeenNthCalledWith(2, {
      job_id: 1234,
      status: 'running',
      percent: 100,
      message: null,
    });
  });

  it('throttles rapid updates and emits the last buffered value', () => {
    vi.useFakeTimers();
    const reporter = createProgressReporter(55, { throttleMs: 200 });

    reporter.report(5);
    reporter.report(10);
    reporter.report(20);

    expect(publishJobProgress).toHaveBeenCalledTimes(1);
    expect(publishJobProgress).toHaveBeenCalledWith({
      job_id: 55,
      status: 'running',
      percent: 5,
      message: null,
    });

    vi.advanceTimersByTime(150);
    reporter.report(60);

    expect(publishJobProgress).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);

    expect(publishJobProgress).toHaveBeenCalledTimes(2);
    expect(publishJobProgress).toHaveBeenLastCalledWith({
      job_id: 55,
      status: 'running',
      percent: 60,
      message: null,
    });
  });

  it('flushes buffered updates before completing the job', () => {
    vi.useFakeTimers();
    const reporter = createProgressReporter(77, { throttleMs: 250 });

    reporter.report(15);
    reporter.report(45);
    expect(publishJobProgress).toHaveBeenCalledTimes(1);

    reporter.complete('succeeded', 'Exported 45 tracks');

    expect(publishJobProgress).toHaveBeenCalledTimes(2);
    expect(publishJobProgress).toHaveBeenLastCalledWith({
      job_id: 77,
      status: 'running',
      percent: 45,
      message: null,
    });

    expect(publishJobCompletion).toHaveBeenCalledWith({
      job_id: 77,
      status: 'succeeded',
      percent: 45,
      message: 'Exported 45 tracks',
    });
  });
});
