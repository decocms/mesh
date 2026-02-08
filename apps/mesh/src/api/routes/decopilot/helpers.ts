/**
 * Decopilot Helper Functions
 *
 * Utility functions for request validation, context management, and tool conversion.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { jsonSchema, JSONSchema7, JSONValue, tool, ToolSet } from "ai";
import type { Context } from "hono";

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import { MCP_TOOL_CALL_TIMEOUT_MS } from "../proxy";

/**
 * Ensure organization context exists and matches route param
 */
export function ensureOrganization(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
): OrganizationScope {
  const organization = c.get("meshContext").organization;
  if (!organization) {
    throw new Error("Organization context is required");
  }
  if ((organization.slug ?? organization.id) !== c.req.param("org")) {
    throw new Error("Organization mismatch");
  }
  return organization;
}

/**
 * Ensure user ID exists in context
 */
export function ensureUser(ctx: MeshContext): string {
  if (!ctx.auth?.user?.id) {
    throw new Error("User ID is required");
  }
  return ctx.auth.user.id;
}

/**
 * Convert MCP tools to AI SDK ToolSet
 */
export async function toolsFromMCP(client: Client): Promise<ToolSet> {
  const list = await client.listTools();

  const toolEntries = list.tools.map((t) => {
    const { name, title, description, inputSchema, outputSchema } = t;

    return [
      name,
      tool<Record<string, unknown>, CallToolResult>({
        title: title ?? name,
        description,
        inputSchema: jsonSchema(inputSchema as JSONSchema7),
        outputSchema: outputSchema
          ? jsonSchema(outputSchema as JSONSchema7)
          : undefined,
        execute: (input, options) => {
          return client.callTool(
            {
              name: t.name,
              arguments: input as Record<string, unknown>,
            },
            CallToolResultSchema,
            { signal: options.abortSignal, timeout: MCP_TOOL_CALL_TIMEOUT_MS },
          ) as Promise<CallToolResult>;
        },
        toModelOutput: ({ output }) => {
          if (output.isError) {
            const textContent = output.content
              .map((c) => (c.type === "text" ? c.text : null))
              .filter(Boolean)
              .join("\n");
            return {
              type: "error-text",
              value: textContent || "Unknown error",
            };
          }
          if ("structuredContent" in output) {
            return {
              type: "json",
              value: output.structuredContent as JSONValue,
            };
          }
          // Convert MCP content parts to text for the model output.
          // "content" is not a valid AI SDK output type — using it causes
          // downstream providers (e.g. xAI) to reject the serialized prompt
          // with a 422 deserialization error on the next step.
          const textValue = output.content
            .map((c) => {
              if (c.type === "text") return c.text;
              return JSON.stringify(c);
            })
            .join("\n");
          return { type: "text", value: textValue };
        },
      }),
    ];
  });

  return Object.fromEntries(toolEntries);
}
