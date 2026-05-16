/**
 * Property-based tests for frontend/src/utils/tableUtils.ts using fast-check.
 *
 * Feature: admin-edit-and-notes
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getRowActions } from '../tableUtils';
import type { ExpenseReportResponse } from '../../types/expenseReport';
import type { UserResponse } from '../../types/auth';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** All valid expense report statuses. */
const allStatuses = ['In Progress', 'Submitted', 'Rejected', 'Scheduled for Payment'] as const;

/** Statuses that allow editing for regular users. */
const editableStatuses = ['In Progress', 'Rejected'] as const;

/** Statuses that do NOT allow editing for regular users. */
const nonEditableStatuses = ['Submitted', 'Scheduled for Payment'] as const;

/** Arbitrary for any valid status. */
const arbStatus = fc.constantFrom(...allStatuses);

/** Arbitrary for editable statuses only. */
const arbEditableStatus = fc.constantFrom(...editableStatuses);

/** Arbitrary for non-editable statuses only. */
const arbNonEditableStatus = fc.constantFrom(...nonEditableStatuses);

/** Arbitrary for a positive user ID. */
const arbUserId = fc.integer({ min: 1, max: 10000 });

/** Generates a minimal ExpenseReportResponse with the given owner_id and status. */
function makeReport(ownerId: number, status: string): ExpenseReportResponse {
  return {
    id: 1,
    title: 'Test Report',
    description: null,
    total_amount: 100,
    status,
    owner_id: ownerId,
    owner_username: 'testuser',
    created_at: '2026-01-01T00:00:00Z',
    reimbursable_from_client: false,
    client: null,
    admin_notes: null,
  };
}

/** Generates a UserResponse for a regular (non-admin) user. */
function makeRegularUser(id: number): UserResponse {
  return {
    id,
    username: 'regularuser',
    role: 'User',
  };
}

// ---------------------------------------------------------------------------
// Property 6: Regular user dashboard shows edit action only for owned editable reports
// ---------------------------------------------------------------------------

// Feature: admin-edit-and-notes, Property 6: Regular user dashboard shows edit action only for owned editable reports

describe('getRowActions() — Property 6: Regular user dashboard shows edit action only for owned editable reports', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * For any expense report, when getRowActions is called with a non-Admin user,
   * "edit" SHALL appear in the returned actions if and only if the user owns the
   * report AND the report status is "In Progress" or "Rejected".
   */

  it('regular user who owns a report with editable status gets "edit" in actions', () => {
    fc.assert(
      fc.property(arbUserId, arbEditableStatus, (userId, status) => {
        const report = makeReport(userId, status);
        const user = makeRegularUser(userId);
        const actions = getRowActions(report, user);
        expect(actions).toContain('edit');
      }),
      { numRuns: 100 }
    );
  });

  it('regular user who does NOT own a report with editable status does NOT get "edit"', () => {
    fc.assert(
      fc.property(
        arbUserId,
        arbUserId.filter((id) => id > 1).map((id) => id - 1),
        arbEditableStatus,
        (ownerId, userIdOffset, status) => {
          // Ensure user ID differs from owner ID
          const userId = ownerId + 1 > 10000 ? ownerId - 1 : ownerId + 1;
          const report = makeReport(ownerId, status);
          const user = makeRegularUser(userId);
          const actions = getRowActions(report, user);
          expect(actions).not.toContain('edit');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('regular user who owns a report with non-editable status does NOT get "edit"', () => {
    fc.assert(
      fc.property(arbUserId, arbNonEditableStatus, (userId, status) => {
        const report = makeReport(userId, status);
        const user = makeRegularUser(userId);
        const actions = getRowActions(report, user);
        expect(actions).not.toContain('edit');
      }),
      { numRuns: 100 }
    );
  });

  it('regular user who does NOT own a report with non-editable status does NOT get "edit"', () => {
    fc.assert(
      fc.property(arbUserId, arbNonEditableStatus, (userId, status) => {
        const userId2 = userId + 1 > 10000 ? userId - 1 : userId + 1;
        const report = makeReport(userId, status);
        const user = makeRegularUser(userId2);
        const actions = getRowActions(report, user);
        expect(actions).not.toContain('edit');
      }),
      { numRuns: 100 }
    );
  });

  it('"edit" appears iff user owns report AND status is editable (biconditional)', () => {
    fc.assert(
      fc.property(
        arbUserId,
        arbUserId,
        arbStatus,
        (ownerId, userId, status) => {
          const report = makeReport(ownerId, status);
          const user = makeRegularUser(userId);
          const actions = getRowActions(report, user);

          const isOwner = ownerId === userId;
          const isEditable = status === 'In Progress' || status === 'Rejected';
          const shouldHaveEdit = isOwner && isEditable;

          if (shouldHaveEdit) {
            expect(actions).toContain('edit');
          } else {
            expect(actions).not.toContain('edit');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
