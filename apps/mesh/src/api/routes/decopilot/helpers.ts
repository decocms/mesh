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
import type { ConnectionEntity } from "@/tools/connection/schema";

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
 * Get connection by ID with organization and status validation
 */
export async function getConnectionById(
  ctx: MeshContext,
  organizationId: string,
  connectionId: string,
): Promise<ConnectionEntity | null> {
  const connection = await ctx.storage.connections.findById(connectionId);
  if (!connection) return null;
  if (connection.organization_id !== organizationId) {
    throw new Error("Connection does not belong to organization");
  }
  if (connection.status !== "active") {
    throw new Error(
      `Connection is ${connection.status.toUpperCase()}, not active`,
    );
  }
  return connection;
}

/**
 * Convert MCP tools to AI SDK ToolSet
 */
export async function toolsFromMCP(
  client: Client,
  properties?: Record<string, string>,
): Promise<ToolSet> {
  const list = await client.listTools();

  console.log({
    tools: list.tools.map((t) => ({
      name: t.name,
      description: t.description,
    })),
  });

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
          const argsWithMeta =
            properties && Object.keys(properties).length > 0
              ? { ...input, _meta: { properties } }
              : input;

          return client.callTool(
            {
              name: t.name,
              arguments: argsWithMeta as Record<string, unknown>,
            },
            CallToolResultSchema,
            { signal: options.abortSignal },
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
          return { type: "content", value: output.content as any };
        },
      }),
    ];
  });

  return Object.fromEntries(toolEntries);
}
