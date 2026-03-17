/**
 * Better Auth Migration Runner
 *
 * Runs Better Auth migrations programmatically without requiring the CLI.
 * This gets bundled with the application, avoiding the need for node_modules.
 *
 * IMPORTANT: This file creates a minimal auth configuration to avoid bundling
 * the entire application (tools registry, plugins, etc.) which would cause OOM.
 */

import { getMigrations } from "better-auth/db";
import { auth } from "./index";

/**
 * Create a minimal auth configuration for migrations only.
 * This avoids loading the tools registry and other heavy dependencies.
 *
 * Note: We use minimal plugin configuration here. The schema will be
 * the same, but the roles/permissions are simplified for migration purposes.
 */

/**
 * Run Better Auth migrations programmatically
 */
export async function migrateBetterAuth(): Promise<string> {
  try {
    const { toBeAdded, toBeCreated, runMigrations } = await getMigrations(
      auth.options,
    );

    if (!toBeAdded.length && !toBeCreated.length) {
      return "up to date";
    }

    await runMigrations();

    const count = toBeCreated.length + toBeAdded.length;
    return `${count} table(s) migrated`;
  } catch (error) {
    console.warn(
      "Better Auth migration failed (tables may be created on first use):",
      error,
    );
    return "failed (will retry on first use)";
  }
}
