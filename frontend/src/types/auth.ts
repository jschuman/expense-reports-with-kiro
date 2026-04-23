/**
 * Authentication types mirroring backend Pydantic schemas.
 */

export interface LoginRequest {
  username: string;
  password: string;
}

export interface UserResponse {
  id: number;
  username: string;
}
