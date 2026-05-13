/**
 * Property-based tests for frontend/src/utils/formatDate.ts using fast-check.
 *
 * Feature: expense-report-fields
 * Property 3: UTC datetime is formatted as human-readable local time
 *
 * For any valid ISO 8601 UTC datetime string, formatUtcDate SHALL return a
 * non-empty string that does not contain a raw "T" separator (i.e. it is
 * human-readable, not a raw ISO string).
 *
 * Validates: Requirements 2.3, 7.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatUtcDate } from '../formatDate';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a random valid ISO 8601 UTC datetime string.
 *
 * Builds the string from independently-generated date/time components so that
 * fast-check can shrink each component independently, producing more useful
 * counterexamples when a property fails.
 *
 * Range: 2000-01-01T00:00:00Z … 2099-12-31T23:59:59Z
 */
const validIsoUtcString = fc
  .record({
    year: fc.integer({ min: 2000, max: 2099 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // cap at 28 to avoid invalid dates for all months
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
    second: fc.integer({ min: 0, max: 59 }),
  })
  .map(({ year, month, day, hour, minute, second }) => {
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}Z`;
  });

// ---------------------------------------------------------------------------
// Property 3: UTC datetime is formatted as human-readable local time
// ---------------------------------------------------------------------------

// Feature: expense-report-fields, Property 3: UTC datetime is formatted as human-readable local time

describe('formatUtcDate() — property-based tests', () => {
  it(
    'Property 3: returns a non-empty string for any valid ISO 8601 UTC string',
    () => {
      fc.assert(
        fc.property(validIsoUtcString, (isoString) => {
          const result = formatUtcDate(isoString);
          expect(result).toBeTruthy();
          expect(result.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'Property 3: output contains no raw "T" separator for any valid ISO 8601 UTC string',
    () => {
      fc.assert(
        fc.property(validIsoUtcString, (isoString) => {
          const result = formatUtcDate(isoString);
          // The raw ISO "T" separator must not appear — the date is human-readable
          expect(result).not.toContain('T');
        }),
        { numRuns: 100 }
      );
    }
  );
});


// ---------------------------------------------------------------------------
// Feature: status-history-table, Property 6: Date formatting produces human-readable non-ISO output
// ---------------------------------------------------------------------------

/**
 * Property 6: Date formatting produces human-readable non-ISO output
 *
 * For any valid UTC ISO 8601 datetime string, formatUtcDate SHALL return a string
 * that does NOT match the ISO 8601 pattern (/\d{4}-\d{2}-\d{2}T/) and that contains
 * recognizable date components (a month abbreviation, a numeric day, a numeric year,
 * and a time component).
 *
 * Validates: Requirements 3.4, 3.5, 3.6
 */

describe('formatUtcDate() — Property 6: Date formatting produces human-readable non-ISO output', () => {
  it(
    'output does NOT match ISO 8601 pattern for any valid UTC ISO string',
    () => {
      fc.assert(
        fc.property(validIsoUtcString, (isoString) => {
          const result = formatUtcDate(isoString);
          // Must NOT match ISO 8601 pattern
          const isoPattern = /\d{4}-\d{2}-\d{2}T/;
          expect(result).not.toMatch(isoPattern);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'output contains recognizable date components (month, day, year, time)',
    () => {
      fc.assert(
        fc.property(validIsoUtcString, (isoString) => {
          const result = formatUtcDate(isoString);

          // Should contain a numeric year (4 digits)
          expect(result).toMatch(/\d{4}/);

          // Should contain a numeric day (1 or 2 digits)
          expect(result).toMatch(/\d{1,2}/);

          // Should contain a time component (digits with colon separator, e.g. "5:00" or "17:00")
          expect(result).toMatch(/\d{1,2}:\d{2}/);

          // Should contain a month abbreviation (3+ letter word like "Jan", "Feb", etc.)
          const monthAbbreviations = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
          expect(result).toMatch(monthAbbreviations);
        }),
        { numRuns: 100 }
      );
    }
  );
});
