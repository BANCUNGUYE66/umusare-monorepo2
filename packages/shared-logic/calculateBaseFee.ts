/**
 * Calculate base fee for a trip.
 * Currently uses a flat 1,500 RWF for any distance.
 */
export function calculateBaseFee(): number {
  return 1500;
}

/** Client-facing ride product (affects quoted base_fee until distance pricing exists). */
export type VehicleTier = 'standard' | 'premium' | 'bike';

const TIER_MULTIPLIER: Record<VehicleTier, number> = {
  standard: 1,
  premium: 1.45,
  bike: 0.78,
};

/**
 * Quoted fare for a tier (RWF). Replace with distance/time model later.
 */
export function calculateTieredFee(tier: VehicleTier): number {
  return Math.round(calculateBaseFee() * TIER_MULTIPLIER[tier]);
}
