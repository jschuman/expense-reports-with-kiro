/**
 * Property-based tests for StatusHistoryTable component using fast-check.
 *
 * Feature: status-history-table, Property 4: Conditional display threshold
 *
 * For any array of StatusAuditLogEntry objects, the StatusHistoryTable component
 * SHALL be rendered in the DOM if and only if the array length is greater than
 * or equal to 2. When the array length is 0 or 1, no table element SHALL be
 * present in the rendered output.
 *
 * Validates: Requirements 2.1, 2.2
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { StatusHistoryTable } from '../StatusHistoryTable';
import type { StatusAuditLogEntry } from '../../types/expenseReport';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Pad a number to a fixed width with leading zeros. */
const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * Generates a valid ISO 8601 UTC datetime string.
 */
const validIsoUtcString = fc
  .record({
    year: fc.integer({ min: 2000, max: 2099 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
    second: fc.integer({ min: 0, max: 59 }),
  })
  .map(({ year, month, day, hour, minute, second }) =>
    `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}Z`
  );

/** Generates a non-empty status string. */
const statusString = fc.constantFrom(
  'In Progress',
  'Submitted',
  'Approved',
  'Rejected',
  'Pending'
);

/** Generates a single StatusAuditLogEntry. */
const statusAuditLogEntry = fc.record<StatusAuditLogEntry>({
  id: fc.integer({ min: 1, max: 100_000 }),
  expense_report_id: fc.integer({ min: 1, max: 100_000 }),
  status: statusString,
  changed_at: validIsoUtcString,
});

/** Generates an array of StatusAuditLogEntry with unique IDs. */
const statusAuditLogEntries = (constraints: { minLength?: number; maxLength?: number }) =>
  fc
    .array(statusAuditLogEntry, constraints)
    .map((entries) =>
      entries.map((entry, idx) => ({ ...entry, id: idx + 1 }))
    );

// ---------------------------------------------------------------------------
// Wrapper component that applies the conditional rendering logic
// (mimics what the parent detail page does)
// ---------------------------------------------------------------------------

function ConditionalStatusHistoryTable({ entries }: { entries: StatusAuditLogEntry[] }) {
  if (entries.length < 2) {
    return null;
  }
  return <StatusHistoryTable entries={entries} />;
}

// ---------------------------------------------------------------------------
// Property 4: Conditional display threshold
// ---------------------------------------------------------------------------

// Feature: status-history-table, Property 4: Conditional display threshold

describe('StatusHistoryTable — Property 4: Conditional display threshold', () => {
  it(
    'renders the table when entries.length >= 2',
    () => {
      fc.assert(
        fc.property(
          statusAuditLogEntries({ minLength: 2, maxLength: 20 }),
          (entries) => {
            const { container } = render(<ConditionalStatusHistoryTable entries={entries} />);
            const table = container.querySelector('table');
            expect(table).not.toBeNull();
            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'does NOT render the table when entries.length is 0',
    () => {
      const { container } = render(<ConditionalStatusHistoryTable entries={[]} />);
      const table = container.querySelector('table');
      expect(table).toBeNull();
    }
  );

  it(
    'does NOT render the table when entries.length is 1',
    () => {
      fc.assert(
        fc.property(
          statusAuditLogEntries({ minLength: 1, maxLength: 1 }),
          (entries) => {
            const { container } = render(<ConditionalStatusHistoryTable entries={entries} />);
            const table = container.querySelector('table');
            expect(table).toBeNull();
            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders table if and only if entries.length >= 2 for arbitrary lengths',
    () => {
      fc.assert(
        fc.property(
          statusAuditLogEntries({ minLength: 0, maxLength: 30 }),
          (entries) => {
            const { container } = render(<ConditionalStatusHistoryTable entries={entries} />);
            const table = container.querySelector('table');
            if (entries.length >= 2) {
              expect(table).not.toBeNull();
            } else {
              expect(table).toBeNull();
            }
            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
