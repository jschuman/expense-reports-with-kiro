/**
 * Date formatting utilities.
 * Converts UTC ISO 8601 strings to human-readable local time using the browser's
 * built-in Intl API — no explicit timezone configuration required.
 */

/**
 * Formats a UTC ISO 8601 datetime string into a human-readable local date/time string.
 *
 * Uses `Intl.DateTimeFormat` with `undefined` locale (browser default) and no explicit
 * `timeZone` option, so the browser automatically applies its detected local timezone.
 *
 * Returns `"—"` when the input is falsy (null, undefined, or empty string).
 *
 * @param isoString - A UTC ISO 8601 datetime string (e.g. "2026-04-23T17:00:00Z")
 * @returns A human-readable local datetime string, or "—" for falsy input
 */
export function formatUtcDate(isoString: string | null | undefined): string {
  if (!isoString) {
    return '—';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString));
}

/**
 * Formats a calendar date (ISO 8601 date string) into a human-readable local date string.
 *
 * Parses the date as a local date (not UTC) to avoid timezone offset shifting the displayed day.
 * For example, "2026-04-23" is interpreted as April 23, 2026 in the user's local timezone,
 * not as UTC midnight which might shift to the previous day in some timezones.
 *
 * Uses `Intl.DateTimeFormat` with `undefined` locale (browser default) for automatic
 * locale detection.
 *
 * @param isoDate - An ISO 8601 date string (e.g. "2026-04-23")
 * @returns A human-readable local date string (e.g. "Apr 23, 2026")
 */
export function formatIncurredDate(isoDate: string): string {
  // Parse as local date: split "YYYY-MM-DD" and construct a Date in local timezone
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}
