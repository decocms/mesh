import { sql } from "kysely";
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
    // Require authentication
    requireAuth(ctx);

    // Check authorization
    await ctx.access.check();
    let sqlQuery = input.sql;
    for (let i = 0; i < (input.params?.length ?? 0); i++) {
      const param = input.params?.[i];
      sqlQuery = sqlQuery.replace(
        `?`,
        typeof param === "string" ? `'${param}'` : `${param}`,
      );
    }
    const result = await sql.raw(sqlQuery).execute(ctx.db);
    return {
      result: [{ results: result.rows, success: true }],
    };
  },
});
