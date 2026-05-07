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

// ---------------------------------------------------------------------------
// formatIncurredDate() — calendar date formatting
// ---------------------------------------------------------------------------

import { formatIncurredDate } from '../formatDate';

describe('formatIncurredDate() — valid ISO 8601 date strings', () => {
  it('formats a known date string to human-readable format', () => {
    const result = formatIncurredDate('2026-04-23');
    // Expected format: "Apr 23, 2026" (month short, day, year)
    expect(result).toMatch(/Apr\s+23,\s+2026/);
    expect(result).not.toContain('2026-04-23');
  });

  it('does not return a raw ISO string (YYYY-MM-DD)', () => {
    const result = formatIncurredDate('2026-04-23');
    expect(result).not.toBe('2026-04-23');
    expect(result).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('formats January 1st correctly', () => {
    const result = formatIncurredDate('2026-01-01');
    expect(result).toMatch(/Jan\s+1,\s+2026/);
  });

  it('formats December 31st correctly', () => {
    const result = formatIncurredDate('2026-12-31');
    expect(result).toMatch(/Dec\s+31,\s+2026/);
  });

  it('formats a mid-month date correctly', () => {
    const result = formatIncurredDate('2026-06-15');
    expect(result).toMatch(/Jun\s+15,\s+2026/);
  });

  it('formats a date in February correctly', () => {
    const result = formatIncurredDate('2026-02-28');
    expect(result).toMatch(/Feb\s+28,\s+2026/);
  });

  it('formats a leap year February 29th correctly', () => {
    const result = formatIncurredDate('2024-02-29');
    expect(result).toMatch(/Feb\s+29,\s+2024/);
  });

  it('does not include time component (calendar date only)', () => {
    const result = formatIncurredDate('2026-04-23');
    // Should not contain hour/minute/second indicators
    expect(result).not.toMatch(/\d{1,2}:\d{2}/);
    expect(result).not.toMatch(/AM|PM|am|pm/);
  });

  it('parses as local date, not UTC (no timezone offset shifting)', () => {
    // This test verifies that "2026-04-23" is interpreted as April 23 in local time,
    // not as UTC midnight which might shift to April 22 in some timezones.
    // We construct the date the same way the function does and verify the output.
    const [year, month, day] = '2026-04-23'.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const result = formatIncurredDate('2026-04-23');

    // The formatted result should contain the day "23", not "22"
    expect(result).toContain('23');
    expect(result).not.toContain('22');
  });

  it('returns a non-empty string', () => {
    const result = formatIncurredDate('2026-04-23');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats multiple dates consistently', () => {
    const result1 = formatIncurredDate('2026-04-23');
    const result2 = formatIncurredDate('2026-04-23');
    expect(result1).toBe(result2);
  });

  it('formats different dates with different outputs', () => {
    const result1 = formatIncurredDate('2026-04-23');
    const result2 = formatIncurredDate('2026-04-24');
    expect(result1).not.toBe(result2);
  });

  it('formats dates from different months with correct month abbreviations', () => {
    const jan = formatIncurredDate('2026-01-15');
    const feb = formatIncurredDate('2026-02-15');
    const mar = formatIncurredDate('2026-03-15');
    const apr = formatIncurredDate('2026-04-15');
    const may = formatIncurredDate('2026-05-15');
    const jun = formatIncurredDate('2026-06-15');
    const jul = formatIncurredDate('2026-07-15');
    const aug = formatIncurredDate('2026-08-15');
    const sep = formatIncurredDate('2026-09-15');
    const oct = formatIncurredDate('2026-10-15');
    const nov = formatIncurredDate('2026-11-15');
    const dec = formatIncurredDate('2026-12-15');

    expect(jan).toContain('Jan');
    expect(feb).toContain('Feb');
    expect(mar).toContain('Mar');
    expect(apr).toContain('Apr');
    expect(may).toContain('May');
    expect(jun).toContain('Jun');
    expect(jul).toContain('Jul');
    expect(aug).toContain('Aug');
    expect(sep).toContain('Sep');
    expect(oct).toContain('Oct');
    expect(nov).toContain('Nov');
    expect(dec).toContain('Dec');
  });

  it('formats dates from different years correctly', () => {
    const result2024 = formatIncurredDate('2024-04-23');
    const result2025 = formatIncurredDate('2025-04-23');
    const result2026 = formatIncurredDate('2026-04-23');

    expect(result2024).toContain('2024');
    expect(result2025).toContain('2025');
    expect(result2026).toContain('2026');
  });
});
