/**
 * Zod validation schemas mirroring backend Pydantic validation rules.
 */

import { z } from 'zod';

export const loginRequestSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const expenseReportCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less'),
  purpose: z.string().min(1, 'Purpose is required'),
  total_amount: z.number({ invalid_type_error: 'Amount must be a number' }).positive('Amount must be positive'),
});

// Inferred types for form data
export type LoginFormData = z.infer<typeof loginRequestSchema>;
export type ExpenseReportFormData = z.infer<typeof expenseReportCreateSchema>;
