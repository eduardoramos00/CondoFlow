/**
 * Permilagem Calculation Engine
 *
 * All arithmetic uses integer math only. Monetary values are always in euro
 * cents (INT). No FLOAT or DECIMAL types are ever used for financial results.
 *
 * Permilagem is stored as an integer out of 10 000 (e.g. 850 = 8.50‰ = 8.5%
 * of total ownership). The building sum must equal exactly 10 000.
 *
 * Safe integer range: the largest intermediate value is
 *   totalBudgetCents × unitPermilagem
 * A €10 000 000 budget (10^9 cents) × 10 000 permilagem = 10^13, which is
 * well below Number.MAX_SAFE_INTEGER (≈9 × 10^15). No BigInt needed.
 */

/**
 * Calculates the unit's share of the annual budget in euro cents.
 *
 * Formula: ROUND(totalBudgetCents × unitPermilagem / 10 000)
 *
 * Any rounding remainder across all units in a generation run is assigned to
 * the highest-permilagem unit at the application layer (Phase 2.5) — not here.
 */
export function calculateUnitQuota(
  totalBudgetCents: number,
  unitPermilagem: number,
): number {
  return Math.round((totalBudgetCents * unitPermilagem) / 10_000);
}

/**
 * Calculates the unit's share of the reserve fund (fundo comum de reserva)
 * in euro cents.
 *
 * The caller passes reserveAmountCents (the reserve-fund portion of the
 * annual budget) as the first argument — not the full budget total.
 * The proportional formula is identical to calculateUnitQuota.
 *
 * Minimum reserve: 10% of the annual budget (Artigo 4.º, DL n.º 268/94).
 * Enforcement of that floor is handled server-side at budget approval (Phase 2.4).
 */
export function calculateReserve(
  reserveAmountCents: number,
  unitPermilagem: number,
): number {
  return Math.round((reserveAmountCents * unitPermilagem) / 10_000);
}

/**
 * Formats a permilagem integer for display using Portuguese locale.
 *
 * Permilagem is stored out of 10 000; display divides by 100 to produce a
 * 2-decimal-place value and appends the per-mille symbol (‰, U+2030).
 * The pt-PT locale uses a comma as the decimal separator.
 *
 *   850   → "8,50‰"
 *   1 000 → "10,00‰"
 *   10 000 → "100,00‰"
 */
export function formatPermilagem(value: number): string {
  const display = new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
  return `${display}‰`;
}

/**
 * Returns true only when the permilagem values of all units in a building
 * sum to exactly 10 000 (representing 100% ownership allocation).
 *
 * An empty array always returns false — a building with no units cannot
 * have a valid permilagem distribution.
 *
 * This mirrors the DB-level enforcement in the check_permilagem_sum trigger
 * (migration 002) and provides a fast, synchronous client-side pre-check.
 */
export function validateBuildingPermilagem(
  units: { permilagem: number }[],
): boolean {
  if (units.length === 0) return false;
  // Every unit must have a strictly positive permilagem — mirrors the DB
  // CHECK (permilagem > 0) constraint in migration 002. Without this guard,
  // negative values that cancel out could produce a sum of 10 000 while
  // individual units are invalid, fooling the UI pre-check.
  if (!units.every((u) => u.permilagem > 0)) return false;
  const sum = units.reduce((acc, unit) => acc + unit.permilagem, 0);
  return sum === 10_000;
}
