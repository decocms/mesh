/**
 * Benchmark Seed
 *
 * Creates test organization, user, and API key for benchmark testing.
 * This seed is used by the benchmark suite to set up the database.
 *
 * Note: This seed also creates Better Auth tables because the auth singleton
 * is configured with a different database at module load time.
 */

import type { Kysely } from "kysely";
import type { Database } from "../../src/storage/types";
import { createBetterAuthTables } from "../../src/storage/test-helpers";

export interface BenchmarkSeedResult {
  organizationId: string;
  userId: string;
  apiKeyId: string;
  apiKeyHash: string;
}

/**
 * Generate a unique ID with prefix
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Run the benchmark seed
 */
export async function seed(db: Kysely<Database>): Promise<BenchmarkSeedResult> {
  // Create Better Auth tables (not created by Kysely migrations)
  await createBetterAuthTables(db);
  const orgId = generateId("org");
  const userId = generateId("user");
  const apiKeyId = generateId("apikey");
  const now = new Date().toISOString();

  // Create organization
  await db
    .insertInto("organization")
    .values({
      id: orgId,
      slug: "benchmark-org",
      name: "Benchmark Organization",
      createdAt: now,
    })
    .execute();

  // Create user
  await db
    // @ts-ignore: Better Auth user table
    .insertInto("user")
    .values({
      id: userId,
      email: "benchmark@test.local",
      name: "Benchmark User",
      role: "admin",
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  // Create member linking user to organization
  await db
    .insertInto("member")
    .values({
      id: generateId("member"),
      organizationId: orgId,
      userId: userId,
      role: "owner",
      createdAt: now,
    })
    .execute();

  // Create API key hash (we'll use a known pattern for the benchmark)
  const apiKeyHash = `benchmark_hash_${apiKeyId}`;

  // Create API key record
  await db
    // @ts-ignore: Better Auth apikey table
    .insertInto("apikey")
    .values({
      id: apiKeyId,
      name: "Benchmark API Key",
      userId: userId,
      key: apiKeyHash,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  return {
    organizationId: orgId,
    userId,
    apiKeyId,
    apiKeyHash,
  };
}
