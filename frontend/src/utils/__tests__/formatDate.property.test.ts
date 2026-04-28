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
