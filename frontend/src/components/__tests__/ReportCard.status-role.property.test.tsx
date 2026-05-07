/**
 * Property-based tests for ReportCard — Property 8: Dashboard Controls Match Status and Role
 *
 * Feature: expense-report-status
 *
 * Property 8: Dashboard Controls Match Status and Role
 *   For any expense report in any state rendered for any user, the set of action
 *   controls displayed (Submit, Edit, Delete, Accept, Reject, View) MUST exactly match
 *   the controls permitted by the state machine and the user's role:
 *     - No permitted action may be hidden
 *     - No forbidden action may be shown
 *
 * Permitted controls per (status, role/ownership) combination:
 *   "In Progress"           + owner (User):  Edit, Delete, Submit
 *   "Submitted"             + admin (Admin): View, Accept, Reject
 *   "Rejected"              + owner (User):  Edit, Delete, Submit
 *   "Submitted"             + owner (User):  View
 *   "Scheduled for Payment" + owner (User):  View
 *   "Scheduled for Payment" + admin:         View
 *   Any status              + non-owner non-admin: View
 *
 * The View button is shown whenever the owner has no editable actions,
 * giving read-only access to the report detail and its expense lines.
 *
 * Validates: Requirements 2.3, 3.1, 4.3, 5.1, 7.3, 7.4, 8.3, 10.1
 */

import { describe, it, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import * as fc from 'fast-check';
import { ReportCard } from '../ReportCard';
import type { ExpenseReportResponse } from '../../types/expenseReport';
import type { UserResponse } from '../../types/auth';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_STATUSES = [
  'In Progress',
  'Submitted',
  'Rejected',
  'Scheduled for Payment',
] as const;

type Status = (typeof ALL_STATUSES)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
});

/**
 * Returns the set of action button aria-labels that are expected to be visible
 * for a given (status, isOwner, isAdmin) combination.
 *
 * This is the ground-truth specification of the state machine's permitted controls.
 */
function expectedButtons(
  status: Status,
  isOwner: boolean,
  isAdmin: boolean
): Set<string> {
  // Owner-editable states: In Progress or Rejected, and the viewer is the owner
  if (isOwner && (status === 'In Progress' || status === 'Rejected')) {
    return new Set(['edit report', 'delete report', 'submit report']);
  }
  // Admin reviewing a submitted report — View + Accept + Reject
  if (isAdmin && status === 'Submitted') {
    return new Set(['view report', 'accept report', 'reject report']);
  }
  // All other combinations: only the View button (read-only access)
  return new Set(['view report']);
}

/** All possible action button aria-labels in the component. */
const ALL_BUTTON_LABELS = [
  'view report',
  'edit report',
  'delete report',
  'submit report',
  'accept report',
  'reject report',
] as const;

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a non-empty, non-whitespace string (max 100 chars). */
const nonEmptyString = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Generates a valid ISO 8601 UTC datetime string. */
const isoUtcString = fc
  .record({
    year: fc.integer({ min: 2000, max: 2099 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
    second: fc.integer({ min: 0, max: 59 }),
  })
  .map(
    ({ year, month, day, hour, minute, second }) =>
      `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}Z`
  );

/** Generates an ExpenseReportResponse with a fixed owner_id of 1. */
const reportArbitrary = fc
  .record({
    id: fc.integer({ min: 1, max: 100_000 }),
    title: nonEmptyString,
    description: fc.oneof(fc.constant(null), nonEmptyString),
    total_amount: fc.double({ min: 0.01, max: 999_999.99, noNaN: true }),
    status: fc.constantFrom(...ALL_STATUSES),
    owner_id: fc.constant(1), // fixed so we can control isOwner via currentUser.id
    owner_username: nonEmptyString,
    created_at: isoUtcString,
    reimbursable_from_client: fc.boolean(),
    client: fc.oneof(fc.constant(null), nonEmptyString),
    admin_notes: fc.oneof(fc.constant(null), nonEmptyString),
  })
  .map((r): ExpenseReportResponse => r);

/** Generates a UserResponse for the owner (id=1, role="User"). */
const ownerUserArbitrary = fc.constant<UserResponse>({
  id: 1,
  username: 'alice',
  role: 'User',
});

/** Generates a UserResponse for a non-owner regular user (id=2, role="User"). */
const nonOwnerUserArbitrary = fc.constant<UserResponse>({
  id: 2,
  username: 'bob',
  role: 'User',
});

/** Generates a UserResponse for an admin (id=99, role="Admin"). */
const adminUserArbitrary = fc.constant<UserResponse>({
  id: 99,
  username: 'admin',
  role: 'Admin',
});

/** Generates one of the three user types. */
const anyUserArbitrary = fc.oneof(
  ownerUserArbitrary,
  nonOwnerUserArbitrary,
  adminUserArbitrary
);

// ---------------------------------------------------------------------------
// Property 8: Dashboard Controls Match Status and Role
// ---------------------------------------------------------------------------

// Feature: expense-report-status, Property 8: Dashboard Controls Match Status and Role

describe(
  'ReportCard — Property 8: Dashboard Controls Match Status and Role',
  () => {
    /**
     * Core property: for any (report, user) combination, the rendered action
     * buttons must exactly match the permitted set — no more, no less.
     */
    it(
      'renders exactly the permitted action buttons for any (status, role) combination',
      () => {
        fc.assert(
          fc.property(reportArbitrary, anyUserArbitrary, (report, currentUser) => {
            const isOwner = currentUser.id === report.owner_id;
            const isAdmin = currentUser.role === 'Admin';
            const permitted = expectedButtons(report.status as Status, isOwner, isAdmin);

            const { container } = render(
              <ReportCard report={report} currentUser={currentUser} />
            );

            for (const label of ALL_BUTTON_LABELS) {
              const button = container.querySelector(
                `[aria-label="${label}"]`
              ) as HTMLButtonElement | null;

              if (permitted.has(label)) {
                // Permitted action MUST be visible
                if (!button) {
                  throw new Error(
                    `Expected button "${label}" to be present for status="${report.status}", ` +
                      `isOwner=${isOwner}, isAdmin=${isAdmin}, but it was absent.`
                  );
                }
              } else {
                // Forbidden action MUST NOT be visible
                if (button) {
                  throw new Error(
                    `Expected button "${label}" to be absent for status="${report.status}", ` +
                      `isOwner=${isOwner}, isAdmin=${isAdmin}, but it was present.`
                  );
                }
              }
            }

            cleanup();
          }),
          { numRuns: 100 }
        );
      }
    );

    /**
     * Focused sub-property: owner in editable states always sees Edit, Delete, Submit.
     */
    it(
      'owner always sees Edit, Delete, Submit when status is "In Progress" or "Rejected"',
      () => {
        fc.assert(
          fc.property(
            reportArbitrary.filter(
              (r) => r.status === 'In Progress' || r.status === 'Rejected'
            ),
            ownerUserArbitrary,
            (report, currentUser) => {
              const { container } = render(
                <ReportCard report={report} currentUser={currentUser} />
              );

              for (const label of ['edit report', 'delete report', 'submit report']) {
                const button = container.querySelector(`[aria-label="${label}"]`);
                if (!button) {
                  throw new Error(
                    `Expected button "${label}" for owner in status="${report.status}" but it was absent.`
                  );
                }
              }

              cleanup();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    /**
     * Focused sub-property: admin always sees View, Accept, Reject when status is "Submitted".
     */
    it(
      'admin always sees Accept, Reject when status is "Submitted"',
      () => {
        fc.assert(
          fc.property(
            reportArbitrary.filter((r) => r.status === 'Submitted'),
            adminUserArbitrary,
            (report, currentUser) => {
              const { container } = render(
                <ReportCard report={report} currentUser={currentUser} />
              );

              for (const label of ['view report', 'accept report', 'reject report']) {
                const button = container.querySelector(`[aria-label="${label}"]`);
                if (!button) {
                  throw new Error(
                    `Expected button "${label}" for admin in status="Submitted" but it was absent.`
                  );
                }
              }

              cleanup();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    /**
     * Focused sub-property: View button is shown for all users when status is "Scheduled for Payment".
     */
    it(
      'View button is shown for any user when status is "Scheduled for Payment"',
      () => {
        fc.assert(
          fc.property(
            reportArbitrary.filter((r) => r.status === 'Scheduled for Payment'),
            anyUserArbitrary,
            (report, currentUser) => {
              const { container } = render(
                <ReportCard report={report} currentUser={currentUser} />
              );

              const viewButton = container.querySelector(`[aria-label="view report"]`);
              if (!viewButton) {
                throw new Error(
                  `Expected "view report" button for "Scheduled for Payment" but it was absent.`
                );
              }

              // No edit/delete/submit/accept/reject
              for (const label of ['edit report', 'delete report', 'submit report', 'accept report', 'reject report']) {
                const button = container.querySelector(`[aria-label="${label}"]`);
                if (button) {
                  throw new Error(
                    `Expected no "${label}" button for "Scheduled for Payment" but it was present.`
                  );
                }
              }

              cleanup();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    /**
     * Focused sub-property: owner sees only View when status is "Submitted".
     */
    it(
      'owner sees only View button when status is "Submitted"',
      () => {
        fc.assert(
          fc.property(
            reportArbitrary.filter((r) => r.status === 'Submitted'),
            ownerUserArbitrary,
            (report, currentUser) => {
              const { container } = render(
                <ReportCard report={report} currentUser={currentUser} />
              );

              const viewButton = container.querySelector(`[aria-label="view report"]`);
              if (!viewButton) {
                throw new Error(`Expected "view report" for owner in "Submitted" but it was absent.`);
              }

              for (const label of ['edit report', 'delete report', 'submit report', 'accept report', 'reject report']) {
                const button = container.querySelector(`[aria-label="${label}"]`);
                if (button) {
                  throw new Error(
                    `Expected no "${label}" for owner in "Submitted" but found it.`
                  );
                }
              }

              cleanup();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    /**
     * Focused sub-property: non-owner non-admin sees only View in any state.
     */
    it(
      'non-owner non-admin sees only View button in any state',
      () => {
        fc.assert(
          fc.property(
            reportArbitrary,
            nonOwnerUserArbitrary,
            (report, currentUser) => {
              const { container } = render(
                <ReportCard report={report} currentUser={currentUser} />
              );

              const viewButton = container.querySelector(`[aria-label="view report"]`);
              if (!viewButton) {
                throw new Error(
                  `Expected "view report" for non-owner in status="${report.status}" but it was absent.`
                );
              }

              for (const label of ['edit report', 'delete report', 'submit report', 'accept report', 'reject report']) {
                const button = container.querySelector(`[aria-label="${label}"]`);
                if (button) {
                  throw new Error(
                    `Expected no "${label}" for non-owner in status="${report.status}" but found it.`
                  );
                }
              }

              cleanup();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    /**
     * Focused sub-property: admin sees no owner-only buttons (Edit, Delete, Submit)
     * when viewing a submitted report.
     */
    it(
      'admin never sees Edit, Delete, or Submit buttons when status is "Submitted"',
      () => {
        fc.assert(
          fc.property(
            reportArbitrary.filter((r) => r.status === 'Submitted'),
            adminUserArbitrary,
            (report, currentUser) => {
              const { container } = render(
                <ReportCard report={report} currentUser={currentUser} />
              );

              for (const label of ['edit report', 'delete report', 'submit report']) {
                const button = container.querySelector(`[aria-label="${label}"]`);
                if (button) {
                  throw new Error(
                    `Admin should not see "${label}" for "Submitted" status but it was present.`
                  );
                }
              }

              cleanup();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    /**
     * Focused sub-property: admin_notes rejection alert is shown only when
     * status is "Rejected" AND admin_notes is non-null/non-empty.
     */
    it(
      'rejection alert is shown only when status is "Rejected" and admin_notes is non-empty',
      () => {
        fc.assert(
          fc.property(
            reportArbitrary,
            anyUserArbitrary,
            (report, currentUser) => {
              const { container } = render(
                <ReportCard report={report} currentUser={currentUser} />
              );

              const alert = container.querySelector('[role="alert"]');
              const shouldShowAlert =
                report.status === 'Rejected' &&
                report.admin_notes !== null &&
                report.admin_notes !== '';

              if (shouldShowAlert && !alert) {
                throw new Error(
                  `Expected rejection alert for status="Rejected" with admin_notes="${report.admin_notes}" but it was absent.`
                );
              }
              if (!shouldShowAlert && alert) {
                throw new Error(
                  `Expected no rejection alert for status="${report.status}" but one was present.`
                );
              }

              cleanup();
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Exhaustive coverage: all (status × role) combinations
// ---------------------------------------------------------------------------

describe(
  'ReportCard — exhaustive (status × role) button matrix',
  () => {
    /**
     * Explicitly tests every (status, role/ownership) combination to ensure
     * the property holds for all 8 meaningful combinations.
     */

    const OWNER: UserResponse = { id: 1, username: 'alice', role: 'User' };
    const ADMIN: UserResponse = { id: 99, username: 'admin', role: 'Admin' };
    const NON_OWNER: UserResponse = { id: 2, username: 'bob', role: 'User' };

    function makeReport(status: Status): ExpenseReportResponse {
      return {
        id: 1,
        title: 'Test Report',
        description: null,
        total_amount: 100,
        status,
        owner_id: 1,
        owner_username: 'alice',
        created_at: '2026-01-01T00:00:00Z',
        reimbursable_from_client: false,
        client: null,
        admin_notes: status === 'Rejected' ? 'Missing receipts' : null,
      };
    }

    const cases: Array<{
      status: Status;
      user: UserResponse;
      expectedPresent: string[];
      expectedAbsent: string[];
    }> = [
      {
        status: 'In Progress',
        user: OWNER,
        expectedPresent: ['edit report', 'delete report', 'submit report'],
        expectedAbsent: ['accept report', 'reject report'],
      },
      {
        status: 'In Progress',
        user: NON_OWNER,
        expectedPresent: [],
        expectedAbsent: ['edit report', 'delete report', 'submit report', 'accept report', 'reject report'],
      },
      {
        status: 'Submitted',
        user: OWNER,
        expectedPresent: [],
        expectedAbsent: ['edit report', 'delete report', 'submit report', 'accept report', 'reject report'],
      },
      {
        status: 'Submitted',
        user: ADMIN,
        expectedPresent: ['accept report', 'reject report'],
        expectedAbsent: ['edit report', 'delete report', 'submit report'],
      },
      {
        status: 'Rejected',
        user: OWNER,
        expectedPresent: ['edit report', 'delete report', 'submit report'],
        expectedAbsent: ['accept report', 'reject report'],
      },
      {
        status: 'Rejected',
        user: NON_OWNER,
        expectedPresent: [],
        expectedAbsent: ['edit report', 'delete report', 'submit report', 'accept report', 'reject report'],
      },
      {
        status: 'Scheduled for Payment',
        user: OWNER,
        expectedPresent: [],
        expectedAbsent: ['edit report', 'delete report', 'submit report', 'accept report', 'reject report'],
      },
      {
        status: 'Scheduled for Payment',
        user: ADMIN,
        expectedPresent: [],
        expectedAbsent: ['edit report', 'delete report', 'submit report', 'accept report', 'reject report'],
      },
    ];

    for (const { status, user, expectedPresent, expectedAbsent } of cases) {
      it(
        `status="${status}", role="${user.role}", isOwner=${user.id === 1}: shows [${expectedPresent.join(', ') || 'none'}]`,
        () => {
          const report = makeReport(status);
          const { container } = render(
            <ReportCard report={report} currentUser={user} />
          );

          for (const label of expectedPresent) {
            const button = container.querySelector(`[aria-label="${label}"]`);
            if (!button) {
              throw new Error(
                `Expected button "${label}" to be present but it was absent.`
              );
            }
          }

          for (const label of expectedAbsent) {
            const button = container.querySelector(`[aria-label="${label}"]`);
            if (button) {
              throw new Error(
                `Expected button "${label}" to be absent but it was present.`
              );
            }
          }
        }
      );
    }
  }
);
