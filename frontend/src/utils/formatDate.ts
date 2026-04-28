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
