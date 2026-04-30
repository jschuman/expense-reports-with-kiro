/**
 * User types mirroring backend auth schemas.
 */

export interface User {
  /**
   * Unique identifier for the user, corresponding to the database primary key.
   */
  id: number;

  /**
   * The user's login name, unique across the system.
   */
  username: string;

  /**
   * The user's assigned role name (e.g., "User" or "Admin").
   * Determines what expense reports the user can view.
   */
  role: string;
}
