import Decimal from 'decimal.js';

/**
 * Currency Display & Input Utilities
 *
 * Three narrow-purpose functions that form a strict boundary between the
 * integer-cents domain (all internal arithmetic) and the decimal/string
 * domain (user display and form input).
 *
 * Rule: financial arithmetic NEVER happens here. These functions only
 * convert representation — they do not accumulate, sum, or compare money.
 *
 *   Integer cents  ──formatCurrency──▶  display string   (one-way, lossy)
 *   Integer cents  ──centsToDecimal──▶  decimal number   (display only)
 *   Decimal input  ──decimalToCents──▶  integer cents    (form input only)
 */

/**
 * Formats an integer euro-cent value as a localised currency string.
 *
 * Defaults to pt-PT locale and EUR currency, producing output such as
 * "1\u00A0234,56\u00A0\u20AC" (non-breaking space as thousands separator and
 * as the gap before the symbol — standard pt-PT ICU behaviour).
 *
 * The division by 100 here is display-only: the result flows directly
 * into Intl.NumberFormat and is never stored or used in arithmetic.
 *
 * Requires Node.js with full ICU data (default since Node 18).
 */
export function formatCurrency(
  cents: number,
  locale = 'pt-PT',
  currency = 'EUR',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

/**
 * Converts an integer cent value to a decimal number for display purposes.
 *
 * The result is a JavaScript float and MUST NOT be passed to any
 * arithmetic operation. Its only valid uses are:
 *   – passing to formatCurrency (which formats it immediately)
 *   – populating a read-only display field
 *   – populating a controlled form input as an initial value
 *
 * For all arithmetic, work with the original integer cents value.
 */
export function centsToDecimal(cents: number): number {
  return cents / 100;
}

/**
 * Converts a decimal form-input value to integer euro cents.
 *
 * Uses decimal.js (via String-first construction) to avoid IEEE 754
 * multiplication errors. Passing the number through String() first
 * captures its shortest decimal representation before any arithmetic,
 * ensuring that a float such as 12.34 (stored as ≈12.3399999…) is
 * treated as exactly 12.34 rather than as its binary approximation.
 *
 *   decimalToCents(12.34)  → 1234  ✓
 *   decimalToCents(1.005)  → 101   ✓  (Math.round(1.005 * 100) = 100 — wrong)
 *
 * CONTRACT: this function is for form input conversion only. The caller
 * is responsible for validating the input to a maximum of 2 decimal
 * places before calling this function. Passing a value with more than
 * 2 significant decimal digits produces a rounded result — the rounding
 * mode is ROUND_HALF_UP (Decimal.js default).
 */
export function decimalToCents(value: number): number {
  return new Decimal(String(value))
    .times(100)
    .toDecimalPlaces(0)
    .toNumber();
}
