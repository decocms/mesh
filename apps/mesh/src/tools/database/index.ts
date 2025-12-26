// apps/mesh/src/tools/database/index.ts
import { sql } from "kysely";
import type { Kysely } from "kysely";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

const QueryResult = z.object({
  results: z.array(z.unknown()).optional(),
  success: z.boolean().optional(),
});

export type QueryResult = z.infer<typeof QueryResult>;

const DatatabasesRunSqlInputSchema = z.object({
  sql: z.string().describe("The SQL query to run"),
  params: z
    .array(z.any())
    .describe("The parameters to pass to the SQL query")
    .optional(),
});

function sanitizeIdentifier(connectionId: string): string {
  return connectionId.replace(/-/g, "_");
}

function getSchemaName(connectionId: string): string {
  return `app_${sanitizeIdentifier(connectionId)}`;
}

function getRoleName(connectionId: string): string {
  return `app_role_${sanitizeIdentifier(connectionId)}`;
}

function isRoleOrSchemaNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // PostgreSQL error codes:
    // 3F000 - invalid_schema_name (schema doesn't exist)
    // 42704 - undefined_object (role doesn't exist)
    const code = (error as { code?: string }).code;
    return (
      code === "3F000" ||
      code === "42704" ||
      (msg.includes("schema") && msg.includes("does not exist")) ||
      (msg.includes("role") && msg.includes("does not exist"))
    );
  }
  return false;
}

/**
 * Create schema and role for a connection with proper isolation.
 * - Creates a dedicated schema for the connection
 * - Creates a dedicated role with access ONLY to that schema
 * - Revokes access to public schema for this role
 */
async function createSchemaAndRole(
  db: Kysely<any>,
  schemaName: string,
  roleName: string,
): Promise<void> {
  // Create the schema
  await sql`CREATE SCHEMA IF NOT EXISTS ${sql.id(schemaName)}`.execute(db);

  // Create the role (NOLOGIN = can't be used to connect directly)
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ${roleName}) THEN
        CREATE ROLE ${sql.id(roleName)} NOLOGIN;
      END IF;
    END
    $$
  `.execute(db);

  // Grant access to the connection's schema only
  await sql`GRANT USAGE, CREATE ON SCHEMA ${sql.id(schemaName)} TO ${sql.id(roleName)}`.execute(
    db,
  );
  await sql`GRANT ALL ON ALL TABLES IN SCHEMA ${sql.id(schemaName)} TO ${sql.id(roleName)}`.execute(
    db,
  );
  await sql`GRANT ALL ON ALL SEQUENCES IN SCHEMA ${sql.id(schemaName)} TO ${sql.id(roleName)}`.execute(
    db,
  );

  // Ensure future tables in this schema are also accessible
  await sql`ALTER DEFAULT PRIVILEGES IN SCHEMA ${sql.id(schemaName)} GRANT ALL ON TABLES TO ${sql.id(roleName)}`.execute(
    db,
  );
  await sql`ALTER DEFAULT PRIVILEGES IN SCHEMA ${sql.id(schemaName)} GRANT ALL ON SEQUENCES TO ${sql.id(roleName)}`.execute(
    db,
  );

  // Revoke access to public schema (isolation)
  await sql`REVOKE ALL ON SCHEMA public FROM ${sql.id(roleName)}`.execute(db);
}

/**
 * Execute a query with proper schema and role isolation.
 * Uses a transaction with SET LOCAL to ensure concurrency safety.
 * SET LOCAL only affects the current transaction - when it ends,
 * settings are automatically reset, preventing cross-request leakage.
 */
async function executeWithIsolation(
  db: Kysely<any>,
  schemaName: string,
  roleName: string,
  sqlQuery: string,
): Promise<any> {
  try {
    // Use a transaction with SET LOCAL for concurrency-safe isolation
    // SET LOCAL only affects the current transaction - no leakage to other requests
    return await db.transaction().execute(async (trx) => {
      await sql`SET LOCAL ROLE ${sql.id(roleName)}`.execute(trx);
      await sql`SET LOCAL search_path TO ${sql.id(schemaName)}`.execute(trx);
      return await sql.raw(sqlQuery).execute(trx);
    });
  } catch (error) {
    if (isRoleOrSchemaNotFoundError(error)) {
      // Schema or role doesn't exist - create them (outside transaction)
      await createSchemaAndRole(db, schemaName, roleName);

      // Retry with new transaction
      return await db.transaction().execute(async (trx) => {
        await sql`SET LOCAL ROLE ${sql.id(roleName)}`.execute(trx);
        await sql`SET LOCAL search_path TO ${sql.id(schemaName)}`.execute(trx);
        return await sql.raw(sqlQuery).execute(trx);
      });
    }
    throw error;
  }
}

export const DATABASES_RUN_SQL = defineTool({
  name: "DATABASES_RUN_SQL",
  description: "Run a SQL query against the database",

  inputSchema: DatatabasesRunSqlInputSchema,
  outputSchema: z.lazy(() =>
    z.object({
      result: z.array(QueryResult),
    }),
  ),
  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    if (!ctx.connectionId) {
      throw new Error("Connection context required for database access");
    }

    const schemaName = getSchemaName(ctx.connectionId);
    const roleName = getRoleName(ctx.connectionId);

    let sqlQuery = input.sql;
    for (let i = 0; i < (input.params?.length ?? 0); i++) {
      const param = input.params?.[i];
      sqlQuery = sqlQuery.replace(
        `?`,
        typeof param === "string" ? `'${param}'` : `${param}`,
      );
    }

    const result = await executeWithIsolation(
      ctx.db,
      schemaName,
      roleName,
      sqlQuery,
    );

    return {
      result: [
        { results: (result as { rows: unknown[] }).rows, success: true },
      ],
    };
  },
});
