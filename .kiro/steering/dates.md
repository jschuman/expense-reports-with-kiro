# Date and Time Handling

## Storage

- All date and time values MUST be stored in UTC in the database.
- Backend timestamps MUST be generated server-side (e.g. `datetime.utcnow()` or `datetime.now(timezone.utc)`). Client-supplied timestamps MUST NOT be trusted for fields like `created_at`.

## API

- All date/time fields in API responses MUST be serialized as ISO 8601 strings in UTC (e.g. `"2026-04-23T17:00:00Z"`).
- Pydantic response schemas MUST use `datetime` types so FastAPI serializes them correctly.

## Frontend Display

- The frontend MUST convert all UTC timestamps to the user's local timezone before displaying them.
- Timezone detection MUST use the browser's built-in `Intl` API (e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone`) — no user preference or manual configuration required.
- Dates MUST be formatted as human-readable strings (e.g. `"Apr 23, 2026, 5:00 PM"`) using `Intl.DateTimeFormat` or equivalent.
- Raw ISO strings MUST NOT be displayed directly to the user.
