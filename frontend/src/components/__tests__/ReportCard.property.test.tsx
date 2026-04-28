/**
 * Property-based tests for ReportCard component using fast-check.
 *
 * Feature: expense-report-fields
 *
 * Property 5: Reimbursable boolean renders as "Yes" or "No"
 *   For any ExpenseReportResponse, the rendered ReportCard SHALL display "Yes"
 *   when reimbursable_from_client is true and "No" when it is false.
 *   Validates: Requirements 4.3, 7.4
 *
 * Property 8: Empty optional fields display a placeholder
 *   For any ExpenseReportResponse where one or more of description, client, or
 *   admin_notes is null or empty, the rendered ReportCard SHALL display "—" for
 *   each such field rather than leaving it blank.
 *   Validates: Requirements 3.5, 5.7, 6.5, 7.5
 *
 * Property 9: ReportCard renders all required fields
 *   For any fully-populated ExpenseReportResponse, the rendered ReportCard SHALL
 *   contain title, description, formatted total_amount, status, owner_username,
 *   formatted created_at, reimbursable display value, client, and admin_notes.
 *   Validates: Requirements 7.1, 7.2
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { ReportCard } from '../ReportCard';
import type { ExpenseReportResponse } from '../../types/expenseReport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
});

/** Pad a number to a fixed width with leading zeros. */
const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * Generates a random valid ISO 8601 UTC datetime string in the range
 * 2000-01-01T00:00:00Z … 2099-12-31T23:59:59Z.
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

/** Generates a non-empty, non-whitespace string (max 255 chars). */
const nonEmptyString = fc
  .string({ minLength: 1, maxLength: 255 })
  .filter((s) => s.trim().length > 0);

/** Generates a positive amount (0.01 … 999_999.99). */
const positiveAmount = fc.double({ min: 0.01, max: 999_999.99, noNaN: true });

/** Generates a nullable optional string (null or a non-empty string). */
const nullableString = fc.oneof(
  fc.constant(null),
  nonEmptyString
);

/**
 * Generates a fully-populated ExpenseReportResponse with all fields set to
 * non-null, non-empty values.
 */
const fullReport = fc.record<ExpenseReportResponse>({
  id: fc.integer({ min: 1, max: 100_000 }),
  title: nonEmptyString,
  description: nonEmptyString,
  total_amount: positiveAmount,
  status: fc.constantFrom('Pending', 'Approved', 'Rejected'),
  owner_id: fc.integer({ min: 1, max: 100_000 }),
  owner_username: nonEmptyString,
  created_at: validIsoUtcString,
  reimbursable_from_client: fc.boolean(),
  client: nonEmptyString,
  admin_notes: nonEmptyString,
});

/**
 * Generates an ExpenseReportResponse where description, client, and admin_notes
 * are independently nullable (each can be null or a non-empty string).
 */
const reportWithNullableOptionals = fc.record<ExpenseReportResponse>({
  id: fc.integer({ min: 1, max: 100_000 }),
  title: nonEmptyString,
  description: nullableString,
  total_amount: positiveAmount,
  status: fc.constantFrom('Pending', 'Approved', 'Rejected'),
  owner_id: fc.integer({ min: 1, max: 100_000 }),
  owner_username: nonEmptyString,
  created_at: validIsoUtcString,
  reimbursable_from_client: fc.boolean(),
  client: nullableString,
  admin_notes: nullableString,
});

// ---------------------------------------------------------------------------
// Property 5: Reimbursable boolean renders as "Yes" or "No"
// ---------------------------------------------------------------------------

// Feature: expense-report-fields, Property 5: Reimbursable boolean renders as "Yes" or "No"

describe('ReportCard — Property 5: Reimbursable boolean renders as "Yes" or "No"', () => {
  /**
   * Finds the text content of the element immediately following the "Reimbursable" label.
   * The ReportCard renders each field as a label/value pair inside a Box; we locate the
   * label element and read its sibling's text to avoid false positives from other fields
   * that might coincidentally contain "Yes" or "No".
   */
  function getReimbursableValue(container: HTMLElement): string | null {
    const labels = Array.from(container.querySelectorAll('p'));
    const labelEl = labels.find((el) => el.textContent?.trim() === 'Reimbursable');
    if (!labelEl) return null;
    // The value element is the next sibling <p> inside the same parent Box
    const parent = labelEl.parentElement;
    if (!parent) return null;
    const children = Array.from(parent.querySelectorAll('p'));
    const valueEl = children.find((el) => el !== labelEl);
    return valueEl?.textContent?.trim() ?? null;
  }

  it(
    'renders "Yes" for any report where reimbursable_from_client is true',
    () => {
      fc.assert(
        fc.property(
          fullReport.map((r) => ({ ...r, reimbursable_from_client: true })),
          (report) => {
            const { container } = render(<ReportCard report={report} />);
            expect(getReimbursableValue(container)).toBe('Yes');
            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders "No" for any report where reimbursable_from_client is false',
    () => {
      fc.assert(
        fc.property(
          fullReport.map((r) => ({ ...r, reimbursable_from_client: false })),
          (report) => {
            const { container } = render(<ReportCard report={report} />);
            expect(getReimbursableValue(container)).toBe('No');
            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders either "Yes" or "No" (never both, never neither) for any boolean value',
    () => {
      fc.assert(
        fc.property(fullReport, (report) => {
          const { container } = render(<ReportCard report={report} />);
          const value = getReimbursableValue(container);
          const expected = report.reimbursable_from_client ? 'Yes' : 'No';
          expect(value).toBe(expected);
          cleanup();
        }),
        { numRuns: 100 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// Property 8: Empty optional fields display a placeholder
// ---------------------------------------------------------------------------

// Feature: expense-report-fields, Property 8: Empty optional fields display a placeholder

/**
 * Returns the displayed value for a named field by finding the label <p> element
 * and reading its sibling value element's text content.
 */
function getFieldValue(container: HTMLElement, labelText: string): string | null {
  const labels = Array.from(container.querySelectorAll('p'));
  const labelEl = labels.find((el) => el.textContent?.trim() === labelText);
  if (!labelEl) return null;
  const parent = labelEl.parentElement;
  if (!parent) return null;
  const children = Array.from(parent.querySelectorAll('p'));
  const valueEl = children.find((el) => el !== labelEl);
  return valueEl?.textContent?.trim() ?? null;
}

describe('ReportCard — Property 8: Empty optional fields display a placeholder', () => {
  it(
    'renders "—" for each null optional field (description, client, admin_notes)',
    () => {
      fc.assert(
        fc.property(reportWithNullableOptionals, (report) => {
          const { container } = render(<ReportCard report={report} />);

          if (report.description === null || report.description === '') {
            expect(getFieldValue(container, 'Description')).toBe('—');
          }
          if (report.client === null || report.client === '') {
            expect(getFieldValue(container, 'Client')).toBe('—');
          }
          if (report.admin_notes === null || report.admin_notes === '') {
            expect(getFieldValue(container, 'Admin Notes')).toBe('—');
          }

          cleanup();
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders "—" when description is null',
    () => {
      fc.assert(
        fc.property(
          fullReport.map((r) => ({ ...r, description: null as string | null })),
          (report) => {
            const { container } = render(<ReportCard report={report} />);
            expect(getFieldValue(container, 'Description')).toBe('—');
            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders "—" when client is null',
    () => {
      fc.assert(
        fc.property(
          fullReport.map((r) => ({ ...r, client: null as string | null })),
          (report) => {
            const { container } = render(<ReportCard report={report} />);
            expect(getFieldValue(container, 'Client')).toBe('—');
            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders "—" when admin_notes is null',
    () => {
      fc.assert(
        fc.property(
          fullReport.map((r) => ({ ...r, admin_notes: null as string | null })),
          (report) => {
            const { container } = render(<ReportCard report={report} />);
            expect(getFieldValue(container, 'Admin Notes')).toBe('—');
            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders "—" when all three optional fields are null simultaneously',
    () => {
      fc.assert(
        fc.property(
          fullReport.map((r) => ({
            ...r,
            description: null as string | null,
            client: null as string | null,
            admin_notes: null as string | null,
          })),
          (report) => {
            const { container } = render(<ReportCard report={report} />);
            expect(getFieldValue(container, 'Description')).toBe('—');
            expect(getFieldValue(container, 'Client')).toBe('—');
            expect(getFieldValue(container, 'Admin Notes')).toBe('—');
            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// Property 9: ReportCard renders all required fields
// ---------------------------------------------------------------------------

// Feature: expense-report-fields, Property 9: ReportCard renders all required fields

/**
 * Helper: renders a single ReportCard in an isolated container and returns
 * scoped query helpers. Using `within(container)` avoids false positives from
 * stale DOM nodes when fast-check runs many iterations.
 */
function renderCard(report: ExpenseReportResponse) {
  const { container } = render(<ReportCard report={report} />);
  return container;
}

describe('ReportCard — Property 9: ReportCard renders all required fields', () => {
  it(
    'renders title for any fully-populated report',
    () => {
      fc.assert(
        fc.property(fullReport, (report) => {
          const container = renderCard(report);
          // Title is rendered as an h2 heading — query by role within the container
          const heading = container.querySelector('h2');
          expect(heading).not.toBeNull();
          expect(heading!.textContent).toBe(report.title);
          cleanup();
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders total_amount formatted as currency for any fully-populated report',
    () => {
      fc.assert(
        fc.property(fullReport, (report) => {
          const container = renderCard(report);
          const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(report.total_amount);
          expect(container.textContent).toContain(formatted);
          cleanup();
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders status for any fully-populated report',
    () => {
      fc.assert(
        fc.property(fullReport, (report) => {
          const container = renderCard(report);
          expect(container.textContent).toContain(report.status);
          cleanup();
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders created_at as a human-readable string (no raw "T" separator) for any fully-populated report',
    () => {
      fc.assert(
        fc.property(fullReport, (report) => {
          const container = renderCard(report);
          // The raw ISO string must not appear in the rendered output
          expect(container.textContent).not.toContain(report.created_at);
          // No raw ISO "T" separator in the entire rendered output
          expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
          cleanup();
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders reimbursable display value ("Yes" or "No") for any fully-populated report',
    () => {
      fc.assert(
        fc.property(fullReport, (report) => {
          const container = renderCard(report);
          const expected = report.reimbursable_from_client ? 'Yes' : 'No';
          expect(container.textContent).toContain(expected);
          cleanup();
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders all required field labels for any fully-populated report',
    () => {
      fc.assert(
        fc.property(fullReport, (report) => {
          const container = renderCard(report);
          const text = container.textContent ?? '';
          expect(text).toContain('Description');
          expect(text).toContain('Amount');
          expect(text).toContain('Status');
          expect(text).toContain('Owner');
          expect(text).toContain('Created');
          expect(text).toContain('Reimbursable');
          expect(text).toContain('Client');
          expect(text).toContain('Admin Notes');
          cleanup();
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'renders all field values in the card text content for any fully-populated report',
    () => {
      fc.assert(
        fc.property(fullReport, (report) => {
          const container = renderCard(report);
          const text = container.textContent ?? '';

          // All non-null field values must appear somewhere in the card
          expect(text).toContain(report.title);
          expect(text).toContain(report.description as string);
          expect(text).toContain(report.owner_username);
          expect(text).toContain(report.client as string);
          expect(text).toContain(report.admin_notes as string);
          expect(text).toContain(report.status);

          // Reimbursable display
          const reimbursableDisplay = report.reimbursable_from_client ? 'Yes' : 'No';
          expect(text).toContain(reimbursableDisplay);

          // Currency-formatted amount
          const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(report.total_amount);
          expect(text).toContain(formatted);

          cleanup();
        }),
        { numRuns: 100 }
      );
    }
  );
});
