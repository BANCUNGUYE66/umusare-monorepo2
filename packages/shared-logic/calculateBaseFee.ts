/**
 * Calculate base fee for a trip.
 * Currently uses a flat 1,500 RWF for any distance.
 */
export function calculateBaseFee(): number {
  return 1500;
}
