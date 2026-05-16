// Feature: expense-reports-data-table, Property 1: Row actions correctness
// Feature: expense-reports-data-table, Property 2: Currency formatting value preservation
// Feature: expense-reports-data-table, Property 3: Placeholder logic correctness
// Feature: expense-reports-data-table, Property 4: Column visibility correctness
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { GridColDef } from '@mui/x-data-grid';
import {
  getRowActions,
  formatCurrency,
  displayOrPlaceholder,
  getVisibleColumns,
  type ActionType,
} from '../tableUtils';
import type { ExpenseReportResponse } from '../../types/expenseReport';
import type { UserResponse } from '../../types/auth';

/**
 * Validates: Requirements 5.2, 5.3, 5.4, 5.5
 *
 * Property 1: Row actions correctness
 * For any combination of report status, user role, and ownership,
 * getRowActions returns exactly the action set specified by the requirements matrix.
 */
describe('getRowActions - Property 1: Row actions correctness', () => {
  const knownStatuses = ['In Progress', 'Submitted', 'Scheduled for Payment', 'Rejected'];
  const unknownStatuses = ['Paid', 'Cancelled', 'Draft', 'Unknown', ''];

  const statusArb = fc.oneof(
    fc.constantFrom(...knownStatuses),
    fc.constantFrom(...unknownStatuses)
  );

  const roleArb = fc.constantFrom('Admin', 'User');
  const ownershipArb = fc.boolean(); // true = owner, false = not owner

  function buildInputs(status: string, role: string, isOwner: boolean) {
    const userId = 1;
    const ownerId = isOwner ? userId : 999;

    const report: ExpenseReportResponse = {
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

    const currentUser: UserResponse = {
      id: userId,
      username: 'testuser',
      role,
    };

    return { report, currentUser };
  }

  /**
   * Computes the expected actions based on the requirements matrix:
   * 1. Status "In Progress" or "Rejected" AND user is owner → ['edit', 'delete', 'submit']
   * 2. Status "Submitted" AND user is Admin → ['edit', 'accept', 'reject']
   * 3. Admin (any non-Submitted status) → ['edit', 'view']
   * 4. Status "Submitted" or "Scheduled for Payment" AND user is owner (non-admin) → ['view']
   * 5. Any other case → ['view']
   */
  function expectedActions(status: string, role: string, isOwner: boolean): ActionType[] {
    const isAdmin = role === 'Admin';

    if ((status === 'In Progress' || status === 'Rejected') && isOwner) {
      return ['edit', 'delete', 'submit'];
    }

    if (status === 'Submitted' && isAdmin) {
      return ['edit', 'accept', 'reject'];
    }

    if (isAdmin) {
      return ['edit', 'view'];
    }

    if ((status === 'Submitted' || status === 'Scheduled for Payment') && isOwner) {
      return ['view'];
    }

    return ['view'];
  }

  it('should return the correct action set for any status, role, and ownership combination', () => {
    fc.assert(
      fc.property(statusArb, roleArb, ownershipArb, (status, role, isOwner) => {
        const { report, currentUser } = buildInputs(status, role, isOwner);
        const actual = getRowActions(report, currentUser);
        const expected = expectedActions(status, role, isOwner);

        expect(actual).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Validates: Requirements 2.1, 2.3
 *
 * Unit tests for admin edit access in getRowActions.
 * Admin users should see edit action for all statuses and all reports (regardless of ownership).
 * Regular users should only see edit for owned reports with editable statuses.
 */
describe('getRowActions - Admin edit access (Requirements 2.1, 2.3)', () => {
  const adminUser: UserResponse = { id: 1, username: 'admin', role: 'Admin' };
  const regularUser: UserResponse = { id: 2, username: 'user', role: 'User' };

  function makeReport(overrides: Partial<ExpenseReportResponse> = {}): ExpenseReportResponse {
    return {
      id: 10,
      title: 'Test Report',
      description: null,
      total_amount: 500,
      status: 'In Progress',
      owner_id: 99,
      owner_username: 'someone_else',
      created_at: '2026-01-01T00:00:00Z',
      reimbursable_from_client: false,
      client: null,
      admin_notes: null,
      ...overrides,
    };
  }

  describe('Admin gets edit action for all statuses', () => {
    it('returns edit for In Progress status', () => {
      const report = makeReport({ status: 'In Progress', owner_id: 99 });
      const actions = getRowActions(report, adminUser);
      expect(actions).toContain('edit');
    });

    it('returns edit for Submitted status', () => {
      const report = makeReport({ status: 'Submitted', owner_id: 99 });
      const actions = getRowActions(report, adminUser);
      expect(actions).toContain('edit');
    });

    it('returns edit for Rejected status', () => {
      const report = makeReport({ status: 'Rejected', owner_id: 99 });
      const actions = getRowActions(report, adminUser);
      expect(actions).toContain('edit');
    });

    it('returns edit for Scheduled for Payment status', () => {
      const report = makeReport({ status: 'Scheduled for Payment', owner_id: 99 });
      const actions = getRowActions(report, adminUser);
      expect(actions).toContain('edit');
    });
  });

  describe('Admin gets edit for reports they do not own', () => {
    it('returns edit for non-owned In Progress report', () => {
      const report = makeReport({ status: 'In Progress', owner_id: 999 });
      const actions = getRowActions(report, adminUser);
      expect(actions).toContain('edit');
    });

    it('returns edit for non-owned Rejected report', () => {
      const report = makeReport({ status: 'Rejected', owner_id: 999 });
      const actions = getRowActions(report, adminUser);
      expect(actions).toContain('edit');
    });

    it('returns edit for non-owned Submitted report', () => {
      const report = makeReport({ status: 'Submitted', owner_id: 999 });
      const actions = getRowActions(report, adminUser);
      expect(actions).toContain('edit');
    });

    it('returns edit for non-owned Scheduled for Payment report', () => {
      const report = makeReport({ status: 'Scheduled for Payment', owner_id: 999 });
      const actions = getRowActions(report, adminUser);
      expect(actions).toContain('edit');
    });
  });

  describe('Submitted status for admin still includes accept/reject', () => {
    it('returns accept and reject for Submitted reports', () => {
      const report = makeReport({ status: 'Submitted', owner_id: 99 });
      const actions = getRowActions(report, adminUser);
      expect(actions).toContain('accept');
      expect(actions).toContain('reject');
    });

    it('returns exactly edit, accept, reject for Submitted reports', () => {
      const report = makeReport({ status: 'Submitted', owner_id: 99 });
      const actions = getRowActions(report, adminUser);
      expect(actions).toEqual(['edit', 'accept', 'reject']);
    });
  });

  describe('Regular user only gets edit for owned editable reports', () => {
    it('returns edit for owned In Progress report', () => {
      const report = makeReport({ status: 'In Progress', owner_id: regularUser.id });
      const actions = getRowActions(report, regularUser);
      expect(actions).toContain('edit');
    });

    it('returns edit for owned Rejected report', () => {
      const report = makeReport({ status: 'Rejected', owner_id: regularUser.id });
      const actions = getRowActions(report, regularUser);
      expect(actions).toContain('edit');
    });

    it('does not return edit for owned Submitted report', () => {
      const report = makeReport({ status: 'Submitted', owner_id: regularUser.id });
      const actions = getRowActions(report, regularUser);
      expect(actions).not.toContain('edit');
    });

    it('does not return edit for owned Scheduled for Payment report', () => {
      const report = makeReport({ status: 'Scheduled for Payment', owner_id: regularUser.id });
      const actions = getRowActions(report, regularUser);
      expect(actions).not.toContain('edit');
    });

    it('does not return edit for non-owned In Progress report', () => {
      const report = makeReport({ status: 'In Progress', owner_id: 999 });
      const actions = getRowActions(report, regularUser);
      expect(actions).not.toContain('edit');
    });

    it('does not return edit for non-owned Rejected report', () => {
      const report = makeReport({ status: 'Rejected', owner_id: 999 });
      const actions = getRowActions(report, regularUser);
      expect(actions).not.toContain('edit');
    });
  });
});

/**
 * Validates: Requirements 1.3
 *
 * Property 2: Currency formatting value preservation
 * For any finite non-negative number, formatting it as US currency and then
 * parsing the numeric value back (stripping $ and ,) produces a value equal
 * to the original number rounded to two decimal places.
 */
describe('formatCurrency - Property 2: Currency formatting value preservation', () => {
  it('parsing the formatted string back equals the original rounded to 2 decimal places', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e12, noNaN: true, noDefaultInfinity: true }),
        (amount) => {
          const formatted = formatCurrency(amount);

          // Strip $ and , to parse back to a number
          const parsed = parseFloat(formatted.replace(/[$,]/g, ''));

          // The original rounded to 2 decimal places
          const expected = Math.round(amount * 100) / 100;

          expect(parsed).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Validates: Requirements 1.6
 *
 * Property 3: Placeholder logic correctness
 * For any null, undefined, or whitespace-only string, displayOrPlaceholder returns "—".
 * For any string with at least one non-whitespace character, displayOrPlaceholder returns the original string.
 */
describe('displayOrPlaceholder - Property 3: Placeholder logic correctness', () => {
  it('returns "—" for null, undefined, and whitespace-only strings', () => {
    const whitespaceCharArb = fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v');
    const whitespaceOnlyArb = fc
      .array(whitespaceCharArb, { minLength: 0, maxLength: 20 })
      .map((chars) => chars.join(''));
    const emptyishArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      whitespaceOnlyArb
    );

    fc.assert(
      fc.property(emptyishArb, (value) => {
        expect(displayOrPlaceholder(value as string | null | undefined)).toBe('—');
      }),
      { numRuns: 100 }
    );
  });

  it('returns the original string for strings with at least one non-whitespace character', () => {
    const nonEmptyStringArb = fc
      .string({ minLength: 1, maxLength: 100 })
      .filter((s) => s.trim().length > 0);

    fc.assert(
      fc.property(nonEmptyStringArb, (value) => {
        expect(displayOrPlaceholder(value)).toBe(value);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Validates: Requirements 4.3, 4.4, 4.5
 *
 * Property 4: Column visibility correctness
 * Admin sees all columns including owner_username.
 * Non-admin sees all columns except owner_username.
 * Order of other columns is preserved in both cases.
 */
describe('getVisibleColumns - Property 4: Column visibility correctness', () => {
  const nonOwnerFieldArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => s !== 'owner_username' && s.trim().length > 0);

  const colDefArb = (fieldArb: fc.Arbitrary<string>): fc.Arbitrary<GridColDef> =>
    fieldArb.map((field) => ({
      field,
      headerName: field.charAt(0).toUpperCase() + field.slice(1),
    }));

  const columnsWithOwnerArb: fc.Arbitrary<GridColDef[]> = fc
    .tuple(
      fc.array(colDefArb(nonOwnerFieldArb), { minLength: 0, maxLength: 10 }),
      fc.nat({ max: 10 })
    )
    .map(([otherCols, insertIndex]) => {
      const ownerCol: GridColDef = { field: 'owner_username', headerName: 'Owner' };
      const idx = Math.min(insertIndex, otherCols.length);
      const result = [...otherCols];
      result.splice(idx, 0, ownerCol);
      return result;
    });

  it('admin sees all columns including owner_username', () => {
    fc.assert(
      fc.property(columnsWithOwnerArb, (columns) => {
        const visible = getVisibleColumns(columns, true);

        expect(visible).toHaveLength(columns.length);
        expect(visible).toEqual(columns);

        const hasOwner = visible.some((col) => col.field === 'owner_username');
        expect(hasOwner).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('non-admin sees all columns except owner_username', () => {
    fc.assert(
      fc.property(columnsWithOwnerArb, (columns) => {
        const visible = getVisibleColumns(columns, false);

        const hasOwner = visible.some((col) => col.field === 'owner_username');
        expect(hasOwner).toBe(false);

        const expectedCols = columns.filter((col) => col.field !== 'owner_username');
        expect(visible).toHaveLength(expectedCols.length);
      }),
      { numRuns: 100 }
    );
  });

  it('order of non-owner columns is preserved for both admin and non-admin', () => {
    fc.assert(
      fc.property(columnsWithOwnerArb, (columns) => {
        const nonOwnerColumns = columns.filter((col) => col.field !== 'owner_username');

        const adminVisible = getVisibleColumns(columns, true);
        const adminNonOwner = adminVisible.filter((col) => col.field !== 'owner_username');
        expect(adminNonOwner.map((c) => c.field)).toEqual(nonOwnerColumns.map((c) => c.field));

        const userVisible = getVisibleColumns(columns, false);
        expect(userVisible.map((c) => c.field)).toEqual(nonOwnerColumns.map((c) => c.field));
      }),
      { numRuns: 100 }
    );
  });
});
