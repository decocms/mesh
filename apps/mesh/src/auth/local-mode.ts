/**
 * Local Mode Setup
 *
 * Handles auto-seeding an admin user and "Local" organization
 * for the zero-ceremony local developer experience.
 *
 * Only runs when MESH_LOCAL_MODE=true (set by CLI).
 */

import { getDb } from "@/database";
import { auth } from "./index";

const LOCAL_ADMIN_EMAIL = "admin@localhost.mesh";
const LOCAL_ADMIN_PASSWORD = "admin@mesh";
const LOCAL_ADMIN_NAME = "Local Admin";

/**
 * Check if the database already has users.
 * Returns true if the database is fresh (no users).
 */
async function isDatabaseFresh(): Promise<boolean> {
  const database = getDb();
  const result = await database.db
    .selectFrom("user")
    .select(database.db.fn.countAll().as("count"))
    .executeTakeFirst();
  return Number(result?.count ?? 0) === 0;
}

/**
 * Seed the local mode environment.
 * Creates an admin user and a default organization if the database is fresh.
 *
 * The signup triggers Better Auth's databaseHooks.user.create.after hook
 * which automatically creates a default organization with seeded connections.
 *
 * Returns true if seeding was performed, false if skipped (already set up).
 */
export async function seedLocalMode(): Promise<boolean> {
  const fresh = await isDatabaseFresh();
  if (!fresh) {
    return false;
  }

  // Create admin user via Better Auth signup.
  // The databaseHooks.user.create.after hook in auth/index.ts will
  // automatically create a default organization for this user.
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: LOCAL_ADMIN_EMAIL,
      password: LOCAL_ADMIN_PASSWORD,
      name: LOCAL_ADMIN_NAME,
    },
  });

  if (!signUpResult?.user?.id) {
    throw new Error("Failed to create local admin user");
  }

  const userId = signUpResult.user.id;

  // Set user as admin directly in the database (avoids needing auth headers)
  const database = getDb();
  await database.db
    .updateTable("user")
    .set({ role: "admin" })
    .where("id", "=", userId)
    .execute();

  return true;
}

/**
 * Get the local admin user, if it exists.
 * Used by the auto-login middleware.
 */
export async function getLocalAdminUser() {
  const database = getDb();
  return database.db
    .selectFrom("user")
    .where("email", "=", LOCAL_ADMIN_EMAIL)
    .selectAll()
    .executeTakeFirst();
}

export function isLocalMode(): boolean {
  return process.env.MESH_LOCAL_MODE === "true";
}
