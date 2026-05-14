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
  description: z.string().optional(),
  reimbursable_from_client: z.boolean().default(false),
  client: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.reimbursable_from_client && !data.client) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['client'],
      message: 'Client is required when reimbursable from client is selected',
    });
  }
});

export const expenseReportUpdateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less').optional(),
  description: z.string().optional(),
  total_amount: z.number({ invalid_type_error: 'Amount must be a number' }).positive('Amount must be positive').optional(),
  reimbursable_from_client: z.boolean().optional(),
  client: z.string().optional(),
  admin_notes: z.string().max(1000, 'Admin notes must be 1000 characters or less').optional(),
}).superRefine((data, ctx) => {
  if (data.reimbursable_from_client && !data.client) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['client'],
      message: 'Client is required when reimbursable from client is selected',
    });
  }
});

// Inferred types for form data
export type LoginFormData = z.infer<typeof loginRequestSchema>;
export type ExpenseReportFormData = z.infer<typeof expenseReportCreateSchema>;
export type ExpenseReportUpdateFormData = z.infer<typeof expenseReportUpdateSchema>;
