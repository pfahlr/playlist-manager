/**
 * Artist cache refresh scheduler
 *
 * Defines cron schedules for refreshing artist metadata:
 * - Bios and links: Weekly (Mondays at 04:00 UTC)
 * - Relations: Monthly (1st day at 05:00 UTC)
 */

/**
 * Feature flags for artist cache refresh
 */
export interface ArtistCacheFlags {
  /**
   * Enable weekly refresh of artist bios and links
   * @default true
   */
  biosWeekly?: boolean;

  /**
   * Enable monthly refresh of artist relations
   * @default true
   */
  relationsMonthly?: boolean;
}

/**
 * Schedule configuration for a refresh job
 */
export interface ScheduleConfig {
  /**
   * Cron pattern for the schedule
   */
  cron: string;

  /**
   * Human-readable description of the schedule
   */
  description: string;

  /**
   * Whether the schedule is enabled
   */
  enabled: boolean;
}

/**
 * All artist cache refresh schedules
 */
export interface ArtistCacheSchedules {
  /**
   * Weekly refresh of bios and links (Mondays at 04:00 UTC)
   */
  weekly: ScheduleConfig;

  /**
   * Monthly refresh of relations (1st day at 05:00 UTC)
   */
  monthly: ScheduleConfig;
}

/**
 * Get artist cache refresh schedules based on feature flags
 *
 * @param flags - Feature flags controlling which schedules are enabled
 * @returns Schedule configurations for weekly and monthly refreshes
 *
 * @example
 * ```ts
 * const schedules = getSchedules({ biosWeekly: true, relationsMonthly: true });
 * console.log(schedules.weekly.cron); // "0 4 * * 1"
 * console.log(schedules.monthly.cron); // "0 5 1 * *"
 * ```
 */
export function getSchedules(flags: ArtistCacheFlags = {}): ArtistCacheSchedules {
  const { biosWeekly = true, relationsMonthly = true } = flags;

  return {
    weekly: {
      cron: '0 4 * * 1', // Every Monday at 04:00 UTC
      description: 'Weekly artist bio and link refresh (Mondays at 04:00 UTC)',
      enabled: biosWeekly,
    },
    monthly: {
      cron: '0 5 1 * *', // 1st day of month at 05:00 UTC
      description: 'Monthly artist relation refresh (1st day at 05:00 UTC)',
      enabled: relationsMonthly,
    },
  };
}

/**
 * Get enabled schedules only
 *
 * @param flags - Feature flags controlling which schedules are enabled
 * @returns Only the schedules that are enabled
 */
export function getEnabledSchedules(flags: ArtistCacheFlags = {}): Partial<ArtistCacheSchedules> {
  const allSchedules = getSchedules(flags);
  const enabled: Partial<ArtistCacheSchedules> = {};

  if (allSchedules.weekly.enabled) {
    enabled.weekly = allSchedules.weekly;
  }

  if (allSchedules.monthly.enabled) {
    enabled.monthly = allSchedules.monthly;
  }

  return enabled;
}
