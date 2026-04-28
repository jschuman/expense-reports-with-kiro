/**
 * Unit tests for frontend/src/utils/formatDate.ts
 * 100% coverage required.
 */

import { describe, it, expect } from 'vitest';
import { formatUtcDate } from '../formatDate';

// ---------------------------------------------------------------------------
// Valid ISO 8601 UTC strings
// ---------------------------------------------------------------------------

describe('formatUtcDate() — valid ISO 8601 UTC strings', () => {
  it('returns a non-empty string for a valid UTC ISO string', () => {
    const result = formatUtcDate('2026-04-23T17:00:00Z');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not contain a raw "T" separator (output is human-readable, not raw ISO)', () => {
    const result = formatUtcDate('2026-04-23T17:00:00Z');
    expect(result).not.toContain('T');
  });

  it('returns a non-empty string for a UTC string with milliseconds', () => {
    const result = formatUtcDate('2026-01-15T09:30:45.123Z');
    expect(result).toBeTruthy();
    expect(result).not.toContain('T');
  });

  it('returns a non-empty string for a UTC string at midnight', () => {
    const result = formatUtcDate('2026-12-31T00:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toContain('T');
  });
});

// ---------------------------------------------------------------------------
// Falsy / empty inputs → "—"
// ---------------------------------------------------------------------------

describe('formatUtcDate() — falsy inputs return "—"', () => {
  it('returns "—" for null', () => {
    expect(formatUtcDate(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(formatUtcDate(undefined)).toBe('—');
  });

  it('returns "—" for an empty string', () => {
    expect(formatUtcDate('')).toBe('—');
  });
});
