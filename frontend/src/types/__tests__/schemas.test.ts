/**
 * Unit tests for Zod validation schemas.
 * Validates that client-side validation rules match backend Pydantic constraints.
 */

import { describe, it, expect } from 'vitest';
import { loginRequestSchema, expenseReportCreateSchema } from '../schemas';

describe('loginRequestSchema', () => {
  it('should accept valid login credentials', () => {
    const validInput = {
      username: 'alice',
      password: 'securePassword123',
    };

    const result = loginRequestSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validInput);
    }
  });

  it('should reject empty username', () => {
    const invalidInput = {
      username: '',
      password: 'securePassword123',
    };

    const result = loginRequestSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('username');
      expect(result.error.issues[0].message).toBe('Username is required');
    }
  });

  it('should reject empty password', () => {
    const invalidInput = {
      username: 'alice',
      password: '',
    };

    const result = loginRequestSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('password');
      expect(result.error.issues[0].message).toBe('Password is required');
    }
  });

  it('should reject missing username field', () => {
    const invalidInput = {
      password: 'securePassword123',
    };

    const result = loginRequestSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject missing password field', () => {
    const invalidInput = {
      username: 'alice',
    };

    const result = loginRequestSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });
});

describe('expenseReportCreateSchema', () => {
  it('should accept valid expense report data', () => {
    const validInput = {
      title: 'Q1 Travel Expenses',
      purpose: 'Client visit to New York office',
      total_amount: 450.75,
    };

    const result = expenseReportCreateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validInput);
    }
  });

  it('should reject empty title', () => {
    const invalidInput = {
      title: '',
      purpose: 'Client visit',
      total_amount: 450.75,
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('title');
      expect(result.error.issues[0].message).toBe('Title is required');
    }
  });

  it('should reject title exceeding 255 characters', () => {
    const invalidInput = {
      title: 'a'.repeat(256),
      purpose: 'Client visit',
      total_amount: 450.75,
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('title');
      expect(result.error.issues[0].message).toBe('Title must be 255 characters or less');
    }
  });

  it('should accept title with exactly 255 characters', () => {
    const validInput = {
      title: 'a'.repeat(255),
      purpose: 'Client visit',
      total_amount: 450.75,
    };

    const result = expenseReportCreateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject empty purpose', () => {
    const invalidInput = {
      title: 'Q1 Travel',
      purpose: '',
      total_amount: 450.75,
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('purpose');
      expect(result.error.issues[0].message).toBe('Purpose is required');
    }
  });

  it('should reject total_amount of zero', () => {
    const invalidInput = {
      title: 'Q1 Travel',
      purpose: 'Client visit',
      total_amount: 0,
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('total_amount');
      expect(result.error.issues[0].message).toBe('Amount must be positive');
    }
  });

  it('should reject negative total_amount', () => {
    const invalidInput = {
      title: 'Q1 Travel',
      purpose: 'Client visit',
      total_amount: -1,
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('total_amount');
      expect(result.error.issues[0].message).toBe('Amount must be positive');
    }
  });

  it('should reject non-number total_amount (string)', () => {
    const invalidInput = {
      title: 'Q1 Travel',
      purpose: 'Client visit',
      total_amount: 'not a number',
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('total_amount');
      expect(result.error.issues[0].message).toBe('Amount must be a number');
    }
  });

  it('should reject non-number total_amount (null)', () => {
    const invalidInput = {
      title: 'Q1 Travel',
      purpose: 'Client visit',
      total_amount: null,
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject missing title field', () => {
    const invalidInput = {
      purpose: 'Client visit',
      total_amount: 450.75,
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject missing purpose field', () => {
    const invalidInput = {
      title: 'Q1 Travel',
      total_amount: 450.75,
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject missing total_amount field', () => {
    const invalidInput = {
      title: 'Q1 Travel',
      purpose: 'Client visit',
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should accept very small positive amounts', () => {
    const validInput = {
      title: 'Coffee',
      purpose: 'Team meeting',
      total_amount: 0.01,
    };

    const result = expenseReportCreateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept large amounts', () => {
    const validInput = {
      title: 'Annual Conference',
      purpose: 'Company-wide event',
      total_amount: 999999.99,
    };

    const result = expenseReportCreateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });
});
