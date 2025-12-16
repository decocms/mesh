/**
 * Built-in Role Definitions
 *
 * Separated to avoid circular dependencies between auth and context-factory modules.
 */

/**
 * Built-in roles that have full access (owner, admin, user)
 * These bypass custom permission checks
 */
export const BUILTIN_ROLES = ["owner", "admin", "user"] as const;

export type BuiltinRole = (typeof BUILTIN_ROLES)[number];

/**
 * Roles that have admin privileges
 */
export const ADMIN_ROLES: BuiltinRole[] = ["owner", "admin"];
