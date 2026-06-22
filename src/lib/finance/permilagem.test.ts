import { describe, expect, it } from 'vitest';

import {
  calculateReserve,
  calculateUnitQuota,
  formatPermilagem,
  validateBuildingPermilagem,
} from './permilagem';

// ---------------------------------------------------------------------------
// calculateUnitQuota
// ---------------------------------------------------------------------------

describe('calculateUnitQuota', () => {
  it('allocates exactly when division is whole', () => {
    // 10% of 100 000 cents = 10 000 cents
    expect(calculateUnitQuota(100_000, 1_000)).toBe(10_000);
  });

  it('rounds half up (0.5 → 1)', () => {
    // 3 cents × 5 000/10 000 = 1.5 → Math.round → 2
    expect(calculateUnitQuota(3, 5_000)).toBe(2);
  });

  it('rounds down when fractional part is below 0.5', () => {
    // 3 cents × 3 000/10 000 = 0.9 → Math.round → 1
    expect(calculateUnitQuota(3, 3_000)).toBe(1);
  });

  it('returns the full budget when permilagem equals 10 000', () => {
    expect(calculateUnitQuota(1_200_000, 10_000)).toBe(1_200_000);
  });

  it('returns 0 for a zero budget regardless of permilagem', () => {
    expect(calculateUnitQuota(0, 850)).toBe(0);
  });

  it('handles minimum permilagem of 1', () => {
    // ROUND(10 000 × 1 / 10 000) = ROUND(1.0) = 1
    expect(calculateUnitQuota(10_000, 1)).toBe(1);
  });

  it('calculates a realistic annual quota (€120 000 budget, 850 permilagem)', () => {
    // 12 000 000 × 850 / 10 000 = 1 020 000 cents = €10 200
    expect(calculateUnitQuota(12_000_000, 850)).toBe(1_020_000);
  });

  it('rounds down with an indivisible budget', () => {
    // 100 001 × 3 333 / 10 000 = 33 330.333… → 33 330
    expect(calculateUnitQuota(100_001, 3_333)).toBe(33_330);
  });

  it('rounds up with an indivisible budget', () => {
    // 100 001 × 6 667 / 10 000 = 66 670.666… → 66 671
    expect(calculateUnitQuota(100_001, 6_667)).toBe(66_671);
  });

  it('always returns an integer (no decimal output)', () => {
    expect(Number.isInteger(calculateUnitQuota(999_999, 3_333))).toBe(true);
    expect(Number.isInteger(calculateUnitQuota(777_777, 7_777))).toBe(true);
  });

  it('three units with complementary permilagem sum correctly to total budget', () => {
    const total = 100_000;
    const a = calculateUnitQuota(total, 5_000); // 50 000
    const b = calculateUnitQuota(total, 3_000); // 30 000
    const c = calculateUnitQuota(total, 2_000); // 20 000
    // exact division — no rounding remainder here
    expect(a + b + c).toBe(total);
  });
});

// ---------------------------------------------------------------------------
// calculateReserve
// ---------------------------------------------------------------------------

describe('calculateReserve', () => {
  it('allocates reserve proportionally', () => {
    // Reserve: 1 200 000 cents; unit 850 permilagem → 102 000 cents
    expect(calculateReserve(1_200_000, 850)).toBe(102_000);
  });

  it('returns the full reserve when permilagem equals 10 000', () => {
    expect(calculateReserve(50_000, 10_000)).toBe(50_000);
  });

  it('returns 0 for a zero reserve', () => {
    expect(calculateReserve(0, 850)).toBe(0);
  });

  it('rounds half up (0.5 → 1)', () => {
    // 3 × 5 000 / 10 000 = 1.5 → 2
    expect(calculateReserve(3, 5_000)).toBe(2);
  });

  it('rounds down when fractional part is below 0.5', () => {
    // 3 × 3 000 / 10 000 = 0.9 → 1
    expect(calculateReserve(3, 3_000)).toBe(1);
  });

  it('always returns an integer', () => {
    expect(Number.isInteger(calculateReserve(777_777, 1_234))).toBe(true);
    expect(Number.isInteger(calculateReserve(123_456, 9_876))).toBe(true);
  });

  it('calculates 10% minimum reserve threshold correctly', () => {
    // Annual budget: €120 000 = 12 000 000 cents
    // 10% reserve = 1 200 000 cents; unit with permilagem 1 000 (10%)
    // → ROUND(1 200 000 × 1 000 / 10 000) = 120 000 cents = €1 200
    expect(calculateReserve(1_200_000, 1_000)).toBe(120_000);
  });
});

// ---------------------------------------------------------------------------
// formatPermilagem
// ---------------------------------------------------------------------------

// These tests assert pt-PT locale output (comma decimal separator).
// They require Node.js with full ICU data, which is the default since Node 18.
// A Node build using --with-intl=small-icu will produce a different separator
// and cause every assertion below to fail.
describe('formatPermilagem', () => {
  it('formats the canonical spec example: 850 → "8,50‰"', () => {
    expect(formatPermilagem(850)).toBe('8,50‰');
  });

  it('formats a round thousand: 1 000 → "10,00‰"', () => {
    expect(formatPermilagem(1_000)).toBe('10,00‰');
  });

  it('formats full-building permilagem: 10 000 → "100,00‰"', () => {
    expect(formatPermilagem(10_000)).toBe('100,00‰');
  });

  it('formats a sub-100 value: 125 → "1,25‰"', () => {
    expect(formatPermilagem(125)).toBe('1,25‰');
  });

  it('formats zero: 0 → "0,00‰"', () => {
    expect(formatPermilagem(0)).toBe('0,00‰');
  });

  it('formats the minimum non-zero permilagem: 1 → "0,01‰"', () => {
    expect(formatPermilagem(1)).toBe('0,01‰');
  });

  it('formats a half-building value: 5 000 → "50,00‰"', () => {
    expect(formatPermilagem(5_000)).toBe('50,00‰');
  });

  it('uses a comma (not dot) as decimal separator', () => {
    const result = formatPermilagem(850);
    expect(result).toContain(',');
    expect(result).not.toMatch(/\d\.\d/);
  });

  it('appends the per-mille symbol (U+2030)', () => {
    expect(formatPermilagem(850)).toContain('‰');
  });

  it('always produces exactly two decimal places', () => {
    // Regex: digits, comma, exactly two digits, ‰
    const twoDecimalPattern = /\d+,\d{2}‰$/;
    expect(formatPermilagem(850)).toMatch(twoDecimalPattern);
    expect(formatPermilagem(1_000)).toMatch(twoDecimalPattern);
    expect(formatPermilagem(1)).toMatch(twoDecimalPattern);
  });
});

// ---------------------------------------------------------------------------
// validateBuildingPermilagem
// ---------------------------------------------------------------------------

describe('validateBuildingPermilagem', () => {
  it('returns true when three units sum to exactly 10 000', () => {
    expect(
      validateBuildingPermilagem([
        { permilagem: 1_000 },
        { permilagem: 2_000 },
        { permilagem: 7_000 },
      ]),
    ).toBe(true);
  });

  it('returns false when the sum is one below 10 000', () => {
    expect(
      validateBuildingPermilagem([
        { permilagem: 1_000 },
        { permilagem: 2_000 },
        { permilagem: 6_999 },
      ]),
    ).toBe(false);
  });

  it('returns false when the sum exceeds 10 000 by one', () => {
    expect(
      validateBuildingPermilagem([
        { permilagem: 1_000 },
        { permilagem: 2_000 },
        { permilagem: 7_001 },
      ]),
    ).toBe(false);
  });

  it('returns false for an empty unit list', () => {
    expect(validateBuildingPermilagem([])).toBe(false);
  });

  it('returns true for a single unit that owns the entire building', () => {
    expect(validateBuildingPermilagem([{ permilagem: 10_000 }])).toBe(true);
  });

  it('returns false for a single unit with permilagem below 10 000', () => {
    expect(validateBuildingPermilagem([{ permilagem: 9_999 }])).toBe(false);
  });

  it('handles ten equal units of 1 000 each', () => {
    const units = Array.from({ length: 10 }, () => ({ permilagem: 1_000 }));
    expect(validateBuildingPermilagem(units)).toBe(true);
  });

  it('returns false when ten equal units of 999 leave a gap', () => {
    const units = Array.from({ length: 10 }, () => ({ permilagem: 999 }));
    expect(validateBuildingPermilagem(units)).toBe(false);
  });

  it('validates a realistic multi-unit building with uneven fractions', () => {
    // 11 units at 850 + 1 unit at 650 = 9 350 + 650 = 10 000
    expect(
      validateBuildingPermilagem([
        { permilagem: 850 },
        { permilagem: 850 },
        { permilagem: 850 },
        { permilagem: 850 },
        { permilagem: 850 },
        { permilagem: 850 },
        { permilagem: 850 },
        { permilagem: 850 },
        { permilagem: 850 },
        { permilagem: 850 },
        { permilagem: 850 },
        { permilagem: 650 },
      ]),
    ).toBe(true);
  });

  it('ignores extra properties on unit objects (structural typing)', () => {
    // Intermediate variables bypass TypeScript excess-property checking on literals;
    // the runtime behaviour is the same — the function only reads `permilagem`.
    const unitA = { permilagem: 6_000, identifier: '1ºA', floor: 1 };
    const unitB = { permilagem: 4_000, identifier: '1ºB', floor: 1 };
    expect(validateBuildingPermilagem([unitA, unitB])).toBe(true);
  });

  it('returns false when any unit has permilagem of zero even if the sum is 10 000', () => {
    // A zero-permilagem unit is invalid (mirrors DB CHECK permilagem > 0).
    // Without this guard, [{0}, {10000}] would pass the sum check.
    expect(
      validateBuildingPermilagem([
        { permilagem: 0 },
        { permilagem: 10_000 },
      ]),
    ).toBe(false);
  });

  it('returns false when any unit has a negative permilagem even if the sum is 10 000', () => {
    // Negative values that cancel out must not fool the pre-check.
    // e.g. -5 000 + 15 000 = 10 000, but both units are invalid.
    expect(
      validateBuildingPermilagem([
        { permilagem: -5_000 },
        { permilagem: 15_000 },
      ]),
    ).toBe(false);
  });

  it('returns false when a single unit has negative permilagem', () => {
    expect(validateBuildingPermilagem([{ permilagem: -1 }])).toBe(false);
  });
});
