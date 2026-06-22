import { describe, expect, it } from 'vitest';

import { centsToDecimal, decimalToCents, formatCurrency } from './currency';

// U+00A0 is the non-breaking space used by the pt-PT ICU locale as both
// the thousands-group separator and the gap between the number and the
// currency symbol. All formatCurrency assertions below use it explicitly.
// Written as an explicit Unicode escape so it cannot be silently corrupted
// by copy-paste or a formatter into a regular space (U+0020).
// These tests require Node.js with full ICU data (default since Node 18).
const NBSP = '\u00A0';

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------

describe('formatCurrency', () => {
  describe('pt-PT / EUR defaults', () => {
    it('formats 1 cent', () => {
      expect(formatCurrency(1)).toBe(`0,01${NBSP}€`);
    });

    it('formats 100 cents (€1)', () => {
      expect(formatCurrency(100)).toBe(`1,00${NBSP}€`);
    });

    it('formats a four-digit euro value without a thousands separator', () => {
      // 1234.56 € — fewer than 5 integer digits, no grouping
      expect(formatCurrency(123_456)).toBe(`1234,56${NBSP}€`);
    });

    it('formats zero', () => {
      expect(formatCurrency(0)).toBe(`0,00${NBSP}€`);
    });

    it('formats a negative cent value', () => {
      expect(formatCurrency(-100)).toBe(`-1,00${NBSP}€`);
    });

    it('uses a non-breaking space (U+00A0) as the thousands separator', () => {
      // 999 999,99 € — U+00A0 between 999 and 999
      const result = formatCurrency(99_999_999);
      expect(result).toBe(`999${NBSP}999,99${NBSP}€`);
      // Confirm it is NOT a regular space (U+0020)
      expect(result).not.toContain(' ');
    });

    it('uses a comma as the decimal separator', () => {
      expect(formatCurrency(123_456)).toContain(',');
      expect(formatCurrency(123_456)).not.toMatch(/\d\.\d/);
    });

    it('always formats to two decimal places', () => {
      expect(formatCurrency(100)).toMatch(/,\d{2}/);
      expect(formatCurrency(99_999_999)).toMatch(/,\d{2}/);
    });

    it('places the € symbol after the number', () => {
      expect(formatCurrency(100)).toMatch(/€$/);
    });
  });

  describe('locale and currency overrides', () => {
    it('accepts a different locale (en-US)', () => {
      const result = formatCurrency(123_456, 'en-US', 'EUR');
      // en-US formats with dot decimal and standard spacing — just verify it
      // returns a string containing the digits and EUR marker
      expect(typeof result).toBe('string');
      expect(result).toMatch(/1[,.]?234/);
    });

    it('accepts a different currency (USD)', () => {
      const result = formatCurrency(100, 'en-US', 'USD');
      expect(result).toContain('1');
      expect(result).toContain('$');
    });

    it('round-trips: formatCurrency(100, "pt-PT", "EUR") contains €', () => {
      expect(formatCurrency(100, 'pt-PT', 'EUR')).toContain('€');
    });
  });
});

// ---------------------------------------------------------------------------
// centsToDecimal
// ---------------------------------------------------------------------------

describe('centsToDecimal', () => {
  it('converts 100 cents to 1', () => {
    expect(centsToDecimal(100)).toBe(1);
  });

  it('converts 123456 cents to 1234.56', () => {
    expect(centsToDecimal(123_456)).toBeCloseTo(1234.56, 10);
  });

  it('converts 1 cent to 0.01', () => {
    expect(centsToDecimal(1)).toBeCloseTo(0.01, 10);
  });

  it('converts 0 cents to 0', () => {
    expect(centsToDecimal(0)).toBe(0);
  });

  it('converts negative cents', () => {
    expect(centsToDecimal(-100)).toBe(-1);
  });

  it('converts a large value without overflow', () => {
    // 99 999 999 cents = 999 999.99 €
    expect(centsToDecimal(99_999_999)).toBeCloseTo(999_999.99, 5);
  });

  it('result is a number (for use as a display/form initial value)', () => {
    expect(typeof centsToDecimal(100)).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// decimalToCents
// ---------------------------------------------------------------------------

describe('decimalToCents', () => {
  it('converts 12.34 to 1234', () => {
    expect(decimalToCents(12.34)).toBe(1234);
  });

  it('converts 0 to 0', () => {
    expect(decimalToCents(0)).toBe(0);
  });

  it('converts 1 (whole euro) to 100', () => {
    expect(decimalToCents(1)).toBe(100);
  });

  it('converts 0.01 (1 cent) to 1', () => {
    expect(decimalToCents(0.01)).toBe(1);
  });

  it('converts 0.10 to 10', () => {
    expect(decimalToCents(0.1)).toBe(10);
  });

  it('converts a negative decimal', () => {
    expect(decimalToCents(-12.34)).toBe(-1234);
  });

  it('converts a large value correctly', () => {
    expect(decimalToCents(9999.99)).toBe(999_999);
  });

  it('always returns an integer', () => {
    expect(Number.isInteger(decimalToCents(12.34))).toBe(true);
    expect(Number.isInteger(decimalToCents(0.07))).toBe(true);
  });

  it('is the inverse of centsToDecimal for clean cent values', () => {
    expect(decimalToCents(centsToDecimal(1234))).toBe(1234);
    expect(decimalToCents(centsToDecimal(100))).toBe(100);
  });

  describe('IEEE 754 safety (why decimal.js is used)', () => {
    it('correctly handles 1.005 — Math.round(1.005 * 100) = 100, but the correct answer is 101', () => {
      // 1.005 is stored as ≈1.004999… in IEEE 754; naive Math.round gives 100.
      // decimal.js (String-first) treats it as exactly 1.005 → rounds to 1.01 → 101.
      expect(decimalToCents(1.005)).toBe(101);
    });

    it('correctly handles 1.015 — another value where Math.round(1.015 * 100) = 101 (wrong)', () => {
      // 1.015 in IEEE 754 ≈ 1.014999…; naive Math.round gives 101 instead of 102.
      // decimal.js: String("1.015") → Decimal("1.015") * 100 = 101.5 → rounds to 102 ✓
      expect(decimalToCents(1.015)).toBe(102);
    });

    it('correctly handles 0.07 — 0.07 * 100 = 7.000000000000001 in IEEE 754, must be exactly 7', () => {
      // Math.round(7.000000000000001) = 7 — both approaches agree on this value.
      // The test pins the safe behaviour regardless of implementation.
      expect(decimalToCents(0.07)).toBe(7);
    });

    it('correctly handles 0.57 — 0.57 * 100 = 57.00000000000001 in IEEE 754, must be exactly 57', () => {
      // Math.round rounds correctly here too, but decimal.js guarantees it.
      expect(decimalToCents(0.57)).toBe(57);
    });
  });
});
