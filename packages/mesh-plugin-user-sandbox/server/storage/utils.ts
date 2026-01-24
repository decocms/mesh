/**
 * User Sandbox Plugin - Storage Utilities
 */

/**
 * Generate a prefixed unique ID using crypto-grade randomness.
 * Format: prefix_timestamp_random (e.g., usb_m1abc_4f3a2b1c)
 */
export function generatePrefixedId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  // Use crypto.randomUUID for secure randomness, take first 8 chars
  const randomPart = crypto.randomUUID().replace(/-/g, "").substring(0, 8);
  return `${prefix}_${timestamp}${randomPart}`;
}
