/**
 * Unit tests for the User type.
 *
 * Validates that the User interface structure matches the backend UserResponse schema:
 *   class UserResponse(BaseModel):
 *       id: int
 *       username: str
 *       role: str
 *
 * Requirements: 7.1, 7.2
 */

import { describe, it, expect } from 'vitest';
import type { User } from '../user';

describe('User type', () => {
  it('should accept a valid user object with all required fields', () => {
    const user: User = {
      id: 1,
      username: 'alice',
      role: 'User',
    };

    expect(user.id).toBe(1);
    expect(user.username).toBe('alice');
    expect(user.role).toBe('User');
  });

  it('should accept a user with Admin role', () => {
    const adminUser: User = {
      id: 2,
      username: 'admin',
      role: 'Admin',
    };

    expect(adminUser.id).toBe(2);
    expect(adminUser.username).toBe('admin');
    expect(adminUser.role).toBe('Admin');
  });

  it('should have id as a number field', () => {
    const user: User = {
      id: 42,
      username: 'bob',
      role: 'User',
    };

    expect(typeof user.id).toBe('number');
  });

  it('should have username as a string field', () => {
    const user: User = {
      id: 1,
      username: 'charlie',
      role: 'User',
    };

    expect(typeof user.username).toBe('string');
  });

  it('should have role as a string field', () => {
    const user: User = {
      id: 1,
      username: 'diana',
      role: 'User',
    };

    expect(typeof user.role).toBe('string');
  });

  it('should mirror the backend UserResponse shape', () => {
    // Simulates a response from POST /auth/login or GET /auth/me
    const backendResponse = {
      id: 10,
      username: 'testuser',
      role: 'User',
    };

    const user: User = backendResponse;

    expect(user).toEqual({
      id: 10,
      username: 'testuser',
      role: 'User',
    });
  });

  it('should work with any role string value', () => {
    const roles = ['User', 'Admin'];

    roles.forEach((role, index) => {
      const user: User = {
        id: index + 1,
        username: `user${index}`,
        role,
      };
      expect(user.role).toBe(role);
    });
  });
});
