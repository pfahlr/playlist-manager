import { expect, test } from 'vitest';
import { getSchedules } from '../../../../apps/worker/src/scheduler/artistCache';

test('returns weekly and monthly schedules', () => {
  const s = getSchedules({ biosWeekly: true, relationsMonthly: true });
  expect(s.weekly.cron).toMatch(/0 4 \* \* 1/);
  expect(s.monthly.cron).toMatch(/0 5 1 \* \*/);
});
