import { expect, test, describe } from 'vitest';
import { getSchedules, getEnabledSchedules } from '../artistCache';

describe('Artist cache scheduler', () => {
  test('returns weekly and monthly schedules', () => {
    const s = getSchedules({ biosWeekly: true, relationsMonthly: true });

    // Weekly schedule (Mondays at 04:00 UTC)
    expect(s.weekly.cron).toMatch(/0 4 \* \* 1/);
    expect(s.weekly.description).toContain('Weekly');
    expect(s.weekly.enabled).toBe(true);

    // Monthly schedule (1st day at 05:00 UTC)
    expect(s.monthly.cron).toMatch(/0 5 1 \* \*/);
    expect(s.monthly.description).toContain('Monthly');
    expect(s.monthly.enabled).toBe(true);
  });

  test('disables schedules when flags are false', () => {
    const s = getSchedules({ biosWeekly: false, relationsMonthly: false });

    expect(s.weekly.enabled).toBe(false);
    expect(s.monthly.enabled).toBe(false);
  });

  test('defaults to enabled when no flags provided', () => {
    const s = getSchedules();

    expect(s.weekly.enabled).toBe(true);
    expect(s.monthly.enabled).toBe(true);
  });

  test('allows partial flag configuration', () => {
    const s1 = getSchedules({ biosWeekly: true });
    expect(s1.weekly.enabled).toBe(true);
    expect(s1.monthly.enabled).toBe(true); // Defaults to true

    const s2 = getSchedules({ relationsMonthly: false });
    expect(s2.weekly.enabled).toBe(true); // Defaults to true
    expect(s2.monthly.enabled).toBe(false);
  });

  test('getEnabledSchedules returns only enabled schedules', () => {
    const enabled = getEnabledSchedules({ biosWeekly: true, relationsMonthly: false });

    expect(enabled.weekly).toBeDefined();
    expect(enabled.monthly).toBeUndefined();
  });

  test('getEnabledSchedules returns both when all enabled', () => {
    const enabled = getEnabledSchedules({ biosWeekly: true, relationsMonthly: true });

    expect(enabled.weekly).toBeDefined();
    expect(enabled.monthly).toBeDefined();
  });

  test('getEnabledSchedules returns empty when all disabled', () => {
    const enabled = getEnabledSchedules({ biosWeekly: false, relationsMonthly: false });

    expect(enabled.weekly).toBeUndefined();
    expect(enabled.monthly).toBeUndefined();
  });

  test('cron patterns match expected format', () => {
    const s = getSchedules();

    // Verify cron pattern structure (minute hour day month weekday)
    expect(s.weekly.cron).toBe('0 4 * * 1'); // Monday at 04:00
    expect(s.monthly.cron).toBe('0 5 1 * *'); // 1st day at 05:00
  });
});
