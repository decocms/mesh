/**
 * User Sandbox Plugin - Storage Utilities
 */

/**
 * Generate a prefixed unique ID
 */
export function generatePrefixedId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}${randomPart}`;
}
