/**
 * MCP Well-Known Binding
 *
 * Defines the interface for retrieving MCP configuration.
 */

import { z } from "zod";
import type { Binder } from "../core/binder";
export type { ServerClient } from "../core/client/mcp-client";

/**
 * MCP Configuration Output Schema
 */
export const McpConfigurationOutputSchema = z.object({
  scopes: z.array(z.string()).describe("List of scopes available"),
  stateSchema: z
    .record(z.string(), z.unknown())
    .describe("JSON Schema (draft-07) defining the state structure"),
});

export type McpConfigurationOutput = z.infer<
  typeof McpConfigurationOutputSchema
>;

/**
 * MCP Binding
 *
 * Tool to retrieve the MCP configuration including scopes and state schema.
 */
export const MCP_BINDING = [
  {
    name: "MCP_CONFIGURATION",
    inputSchema: z.object({}),
    outputSchema: McpConfigurationOutputSchema,
  },
] as const satisfies Binder;
