import type { DriverTier } from './types';

/** Thresholds (aligned with DB function refresh_driver_tier) */
export const DRIVER_TIER_RULES = {
  silver: { minTrips: 20, minRating: 4.0 },
  gold: { minTrips: 100, minRating: 4.5 },
  diamond: { minTrips: 300, minRating: 4.8 },
} as const;

export function computeDriverTier(
  completedTrips: number,
  averageRating: number | null | undefined
): DriverTier {
  const r = averageRating ?? 5.0;
  const t = completedTrips;
  if (t >= DRIVER_TIER_RULES.diamond.minTrips && r >= DRIVER_TIER_RULES.diamond.minRating) {
    return 'diamond';
  }
  if (t >= DRIVER_TIER_RULES.gold.minTrips && r >= DRIVER_TIER_RULES.gold.minRating) {
    return 'gold';
  }
  if (t >= DRIVER_TIER_RULES.silver.minTrips && r >= DRIVER_TIER_RULES.silver.minRating) {
    return 'silver';
  }
  return 'normal';
}

export function tierDisplayName(tier: string | undefined | null): string {
  switch (tier) {
    case 'diamond':
      return 'Diamond';
    case 'gold':
      return 'Gold';
    case 'silver':
      return 'Silver';
    default:
      return 'Normal';
  }
}

export function tierAccentColor(tier: string | undefined | null): string {
  switch (tier) {
    case 'diamond':
      return '#38BDF8';
    case 'gold':
      return '#FBBF24';
    case 'silver':
      return '#94A3B8';
    default:
      return '#9CA3AF';
  }
}
