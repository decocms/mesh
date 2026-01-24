/**
 * User Sandbox Plugin - Query Keys
 *
 * Centralized query key constants for React Query.
 */

export const KEYS = {
  session: (sessionId: string) => ["user-sandbox-session", sessionId] as const,
};
