/**
 * Database Migration Runner
 *
 * Runs Kysely migrations to create/update database schema
 */

import { Migrator } from "kysely";
import migrations from "../../migrations";
import { migrateBetterAuth } from "../auth/migrate";
import { closeDatabase, getDb } from "./index";

/**
 * Run all pending migrations
 */
export async function migrateToLatest(): Promise<void> {
  // Run Better Auth migrations programmatically
  await migrateBetterAuth();

  // Run Kysely migrations
  console.log("📊 Getting database instance...");
  const database = getDb();
  console.log("✅ Database instance obtained");

  console.log("🔧 Creating migrator...");

  const migrator = new Migrator({
    db: database.db,
    provider: { getMigrations: () => Promise.resolve(migrations) },
  });
  console.log("✅ Migrator created");

  console.log("▶️  Running migrations...");
  const { error, results } = await migrator.migrateToLatest();
  console.log("✅ Migrations executed");

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
    // Close database connection before throwing
    await closeDatabase(database).catch(() => {});
    throw error;
  }

  console.log("🎉 All Kysely migrations completed successfully");

  // Close database connection after all migrations
  console.log("🔒 Closing database connection...");
  await closeDatabase(database).catch((err: unknown) => {
    console.warn("Warning: Error closing database:", err);
  });
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
