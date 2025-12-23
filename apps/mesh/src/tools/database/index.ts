import { sql } from "kysely";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
const QueryResult = z.object({
  results: z.array(z.unknown()).optional(),
  success: z.boolean().optional(),
});

/**
 * Safely escape and quote SQL values
 * This is still not as safe as parameterized queries, but better than raw replacement
 */
function escapeSqlValue(value: any): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  if (typeof value === "string") {
    // Escape single quotes by doubling them (SQL standard)
    // and wrap in quotes
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  // For arrays, objects, etc - serialize to JSON string
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

/**
 * Replace ALL placeholders (?, $1, $2, etc.) with escaped values
 *
 * IMPORTANT: We find all placeholder positions FIRST, then replace from end to start.
 * This prevents ? characters inside interpolated values from being treated as placeholders.
 */
function interpolateParams(sql: string, params: any[]): string {
  // First, handle $1, $2, etc. style placeholders (unambiguous)
  let result = sql;
  for (let i = params.length; i >= 1; i--) {
    const placeholder = `$${i}`;
    if (result.includes(placeholder)) {
      result = result.replaceAll(placeholder, escapeSqlValue(params[i - 1]));
    }
  }

  // For ? placeholders, find all positions FIRST, then replace from end to start
  // This prevents ? inside interpolated values from being matched
  const questionMarkPositions: number[] = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i] === "?") {
      questionMarkPositions.push(i);
    }
  }

  // Replace from end to start so positions don't shift
  for (
    let i = Math.min(questionMarkPositions.length, params.length) - 1;
    i >= 0;
    i--
  ) {
    const pos = questionMarkPositions[i];
    const escaped = escapeSqlValue(params[i]);
    result = result.slice(0, pos!) + escaped + result.slice(pos! + 1);
  }

  return result;
}

export type QueryResult = z.infer<typeof QueryResult>;
const DatatabasesRunSqlInputSchema = z.object({
  sql: z.string().describe("The SQL query to run"),
  params: z
    .array(z.any())
    .describe("The parameters to pass to the SQL query")
    .optional(),
});

export const DATABASES_RUN_SQL = defineTool({
  name: "DATABASES_RUN_SQL",
  description: "Run a SQL query against the database",

  inputSchema: DatatabasesRunSqlInputSchema,
  outputSchema: z.object({
    result: z.array(QueryResult),
  }),
  handler: async (input, ctx) => {
    // Require authentication
    requireAuth(ctx);

    // Check authorization
    await ctx.access.check();
    const interpolatedSql = interpolateParams(input.sql, input.params || []);
    const query = sql.raw(interpolatedSql);
    const result = await query.execute(ctx.db);

    return {
      result: [{ results: result.rows, success: true }],
    };
  },
});
