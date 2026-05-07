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
      description: 'Client visit to New York office',
      reimbursable_from_client: false,
    };

    const result = expenseReportCreateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe(validInput.title);
      expect(result.data.description).toBe(validInput.description);
      expect(result.data.reimbursable_from_client).toBe(false);
    }
  });

  it('should accept expense report with no description', () => {
    const validInput = {
      title: 'Q1 Travel Expenses',
      reimbursable_from_client: false,
    };

    const result = expenseReportCreateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
    }
  });

  it('should accept expense report with empty description', () => {
    const validInput = {
      title: 'Q1 Travel Expenses',
      description: '',
      reimbursable_from_client: false,
    };

    const result = expenseReportCreateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('');
    }
  });

  it('should accept valid client when reimbursable is true', () => {
    const validInput = {
      title: 'Q1 Travel Expenses',
      description: 'Client visit',
      reimbursable_from_client: true,
      client: 'Acme Corp',
    };

    const result = expenseReportCreateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.client).toBe('Acme Corp');
    }
  });

  it('should reject reimbursable=true with no client', () => {
    const invalidInput = {
      title: 'Q1 Travel Expenses',
      description: 'Client visit',
      reimbursable_from_client: true,
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      const clientError = result.error.issues.find(issue => issue.path.includes('client'));
      expect(clientError).toBeDefined();
      expect(clientError?.message).toBe('Client is required when reimbursable from client is selected');
    }
  });

  it('should reject empty title', () => {
    const invalidInput = {
      title: '',
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
    };

    const result = expenseReportCreateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should default reimbursable_from_client to false when omitted', () => {
    const validInput = {
      title: 'Q1 Travel',
    };

    const result = expenseReportCreateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reimbursable_from_client).toBe(false);
    }
  });

  it('should reject missing title field', () => {
    const invalidInput = {
      reimbursable_from_client: false,
    };

    const result = expenseReportCreateSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });
});
