/**
 * Table Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_TABLE = defineTool({
  name: "UI_TABLE",
  description: "Display data in a sortable, scrollable table",
  inputSchema: z.object({
    title: z.string().optional().describe("Table title"),
    columns: z
      .array(
        z.object({
          key: z.string().describe("Column key matching data fields"),
          label: z.string().describe("Column header label"),
          align: z.enum(["left", "center", "right"]).optional(),
        }),
      )
      .describe("Column definitions"),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .describe("Array of row data objects"),
  }),
  outputSchema: z.object({
    title: z.string().optional(),
    columnCount: z.number(),
    rowCount: z.number(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      title: input.title,
      columnCount: input.columns.length,
      rowCount: input.rows.length,
      _meta: { "ui/resourceUri": "ui://mesh/table" },
    };
  },
});
