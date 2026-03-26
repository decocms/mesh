/**
 * Better Auth Migration Runner
 *
 * Runs Better Auth migrations programmatically without requiring the CLI.
 * This gets bundled with the application, avoiding the need for node_modules.
 *
 * IMPORTANT: Uses a fresh database dialect from the current env.DATABASE_URL
 * because the `auth` object is created at module load time — before
 * ensureServices starts Postgres on its dynamic port and updates DATABASE_URL.
 */

import { getMigrations } from "better-auth/db";
import { auth } from "./index";
import { getDatabaseUrl, getDbDialect } from "../database";

/**
 * Run Better Auth migrations programmatically.
 *
 * Creates a fresh database dialect using the current DATABASE_URL to avoid
 * the stale connection from the eagerly-created `auth` object.
 * Throws on failure — Kysely migrations depend on Better Auth tables
 * (e.g. `organization`) so they cannot proceed if this fails.
 */
export async function migrateBetterAuth(): Promise<string> {
  const freshDatabase = getDbDialect(getDatabaseUrl());
  const options = { ...auth.options, database: freshDatabase };

  const { toBeAdded, toBeCreated, runMigrations } =
    await getMigrations(options);

  if (!toBeAdded.length && !toBeCreated.length) {
    return "up to date";
  }

  await runMigrations();

  const count = toBeCreated.length + toBeAdded.length;
  return `${count} table(s) migrated`;
}
