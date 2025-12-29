/**
 * Database Migration Runner
 *
 * Runs Kysely migrations to create/update database schema
 */

import { Migrator, type Kysely } from "kysely";
import migrations from "../../migrations";
import { runSeed, type SeedName } from "../../migrations/seeds";
import { migrateBetterAuth } from "../auth/migrate";
import { closeDatabase, getDb, type MeshDatabase } from "./index";
import type { Database } from "../storage/types";

export { runSeed, type SeedName };

/**
 * Migration options
 */
export interface MigrateOptions {
  /**
   * Keep the database connection open after migrations.
   * Set to true when running migrations before starting a server.
   * Default: false (closes connection after migrations)
   */
  keepOpen?: boolean;

  /**
   * Custom database instance to migrate.
   * If not provided, uses the global database from getDb().
   * When provided, Better Auth migrations are skipped (they use their own connection).
   */
  database?: MeshDatabase;

  /**
   * Skip Better Auth migrations.
   * Useful when providing a custom database that doesn't need Better Auth tables.
   * Default: false
   */
  skipBetterAuth?: boolean;

  /**
   * Seed to run after migrations.
   * Seeds populate the database with initial/test data.
   */
  seed?: SeedName;
}

/**
 * Run Kysely migrations on a specific database instance
 */
export async function runKyselyMigrations(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: () => Promise.resolve(migrations) },
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`✅ Migration "${it.migrationName}" executed successfully`);
    } else if (it.status === "Error") {
      console.error(`❌ Failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error("Failed to migrate");
    console.error(error);
    throw error;
  }
}

/**
 * Migration result with optional seed data
 */
export interface MigrateResult<T = unknown> {
  seedResult?: T;
}

/**
 * Run all pending migrations
 */
export async function migrateToLatest<T = unknown>(
  options?: MigrateOptions,
): Promise<MigrateResult<T>> {
  const {
    keepOpen = false,
    database: customDb,
    skipBetterAuth = false,
    seed,
  } = options ?? {};

  // Run Better Auth migrations (unless skipped or using custom db)
  if (!skipBetterAuth && !customDb) {
    await migrateBetterAuth();
  }

  // Get database instance
  const database = customDb ?? getDb();

  // Helper to close database if needed
  const maybeCloseDatabase = async () => {
    // Only close database connection if not keeping open for server
    // and we're using the global database (not a custom one)
    if (!keepOpen && !customDb) {
      console.log("🔒 Closing database connection...");
      await closeDatabase(database).catch((err: unknown) => {
        console.warn("Warning: Error closing database:", err);
      });
    }
  };

  try {
    console.log("📊 Running Kysely migrations...");
    await runKyselyMigrations(database.db);
    console.log("🎉 All Kysely migrations completed successfully");

    // Run seed if specified
    let seedResult: T | undefined;
    if (seed) {
      seedResult = await runSeed<T>(database.db, seed);
    }

    // Close database on success if needed
    await maybeCloseDatabase();

    return { seedResult };
  } catch (error) {
    // Ensure database is closed on failure
    await maybeCloseDatabase();
    throw error;
  }
}

/**
 * Rollback the last migration
 */
export async function migrateDown(): Promise<void> {
  const database = getDb();

  const migrator = new Migrator({
    db: database.db,
    provider: { getMigrations: () => Promise.resolve(migrations) },
  });

  const { error, results } = await migrator.migrateDown();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(
        `✅ Migration "${it.migrationName}" rolled back successfully`,
      );
    } else if (it.status === "Error") {
      console.error(`❌ Failed to rollback migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error("Failed to rollback migration");
    console.error(error);
    throw error;
  }
}

// Entry point: Run migrations when executed directly
if (import.meta.main) {
  console.log("🚀 Migration script starting...");
  console.log("📦 Imported migrateToLatest function");

  (async () => {
    console.log("🏃 Executing migration function...");
    try {
      await migrateToLatest();
      console.log("✅ All migrations completed. Exiting...");
      process.exit(0);
    } catch (error) {
      console.error("❌ Migration failed:", error);
      process.exit(1);
    }
  })();
}
