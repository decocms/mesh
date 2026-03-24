/**
 * COLLECTION_CONNECTIONS_LIST Tool
 *
 * List all connections in the organization.
 * Supports binding filtering and pagination.
 */

import {
  type Binder,
  createBindingChecker,
  EVENT_BUS_BINDING,
  TRIGGER_BINDING,
} from "@decocms/bindings";
import { ASSISTANTS_BINDING } from "@decocms/bindings/assistant";
import { LANGUAGE_MODEL_BINDING } from "@decocms/bindings/llm";
import { MCP_BINDING } from "@decocms/bindings/mcp";
import { OBJECT_STORAGE_BINDING } from "@decocms/bindings/object-storage";
import {
  WORKFLOW_BINDING,
  WORKFLOW_EXECUTION_BINDING,
} from "@decocms/bindings/workflow";
import { AI_GATEWAY_BILLING_BINDING } from "@decocms/bindings/ai-gateway";
import { WellKnownOrgMCPId } from "@decocms/mesh-sdk";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { getBaseUrl } from "../../core/server-constants";
import { requireOrganization } from "../../core/mesh-context";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  getMcpListCache,
  fetchWithCache,
} from "../../mcp-clients/mcp-list-cache";
import { clientFromConnection } from "../../mcp-clients";
import { createDevAssetsConnectionEntity, isDevMode } from "./dev-assets";
import { type ConnectionEntity, ConnectionEntitySchema } from "./schema";

/**
 * Registry binding: matches connections that expose COLLECTION_REGISTRY_APP_LIST
 * or REGISTRY_ITEM_LIST tools (i.e., can act as a store/registry).
 */
const REGISTRY_BINDING: Binder = [
  {
    name: /^(COLLECTION_REGISTRY_APP_LIST|REGISTRY_ITEM_LIST)$/,
    inputSchema: z.object({}),
  },
] as unknown as Binder;

const BUILTIN_BINDING_CHECKERS: Record<string, Binder> = {
  LLM: LANGUAGE_MODEL_BINDING,
  LLMS: LANGUAGE_MODEL_BINDING,
  ASSISTANTS: ASSISTANTS_BINDING,
  MCP: MCP_BINDING,
  OBJECT_STORAGE: OBJECT_STORAGE_BINDING,
  WORKFLOW: WORKFLOW_BINDING,
  WORKFLOW_EXECUTION: WORKFLOW_EXECUTION_BINDING,
  AI_GATEWAY_BILLING: AI_GATEWAY_BILLING_BINDING,
  EVENT_BUS: EVENT_BUS_BINDING,
  TRIGGER: TRIGGER_BINDING,
  REGISTRY: REGISTRY_BINDING,
};

const ConnectionListInputSchema = z.object({
  binding: z
    .union([z.object({}).passthrough(), z.string()])
    .optional()
    .describe(
      "Filter by binding. Well-known name (e.g. 'LLM') or a binding schema object.",
    ),
  include_virtual: z
    .boolean()
    .optional()
    .describe(
      "Whether to include VIRTUAL connections in the results. Defaults to false.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Maximum number of items to return"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of items to skip"),
});

const ConnectionListOutputSchema = z.object({
  items: z.array(ConnectionEntitySchema),
  totalCount: z.number(),
  hasMore: z.boolean(),
});

export const COLLECTION_CONNECTIONS_LIST = defineTool({
  name: "COLLECTION_CONNECTIONS_LIST",
  description: "List all connections in the organization",
  annotations: {
    title: "List Connections",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: ConnectionListInputSchema,
  outputSchema: ConnectionListOutputSchema,

  handler: async (input, ctx) => {
    await ctx.access.check();

    const organization = requireOrganization(ctx);

    // Determine which binding to use: well-known binding (string) or provided JSON schema (object)
    const bindingDefinition: Binder | undefined = input.binding
      ? typeof input.binding === "string"
        ? (() => {
            const wellKnownBinding =
              BUILTIN_BINDING_CHECKERS[input.binding.toUpperCase()];
            if (!wellKnownBinding) {
              throw new Error(`Unknown binding: ${input.binding}`);
            }
            return wellKnownBinding;
          })()
        : (input.binding as unknown as Binder)
      : undefined;

    // Create binding checker from the binding definition
    const bindingChecker = bindingDefinition
      ? createBindingChecker(bindingDefinition)
      : undefined;

    // By default, exclude VIRTUAL connections unless explicitly requested
    const connections = await ctx.storage.connections.list(organization.id, {
      includeVirtual: input.include_virtual ?? false,
    });

    const cache = getMcpListCache();
    const selfId = WellKnownOrgMCPId.SELF(organization.id);
    await Promise.all(
      connections.map(async (connection) => {
        if (connection.tools !== null) return;
        // The self MCP requires session auth, so an HTTP round-trip would
        // fail without forwarding cookies. Use in-process transport instead.
        const fetchLive =
          connection.id === selfId
            ? async () => {
                const { listManagementTools } = await import("../../tools");
                return listManagementTools(ctx) as Promise<unknown[]>;
              }
            : async () => {
                const client = await clientFromConnection(
                  connection,
                  ctx,
                  true,
                );
                try {
                  const result = await client.listTools();
                  return result.tools;
                } finally {
                  await client.close().catch(() => {});
                }
              };
        const tools = await fetchWithCache(
          "tools",
          connection.id,
          fetchLive,
          cache,
        );
        if (tools !== null) {
          connection.tools = tools as Tool[];
        }
      }),
    );

    // In dev mode, inject the dev-assets connection for local file storage
    // This provides object storage functionality without requiring an external S3 bucket
    if (isDevMode()) {
      const baseUrl = getBaseUrl();
      const devAssetsId = WellKnownOrgMCPId.DEV_ASSETS(organization.id);

      // Only add if not already in the list (shouldn't be, but just in case)
      if (!connections.some((c) => c.id === devAssetsId)) {
        const devAssetsConnection = createDevAssetsConnectionEntity(
          organization.id,
          baseUrl,
        );
        connections.unshift(devAssetsConnection);
      }
    }

    // Filter connections by binding if specified
    const filteredConnections = bindingChecker
      ? connections.filter((connection) => {
          if (!connection.tools || connection.tools.length === 0) {
            return false;
          }
          return bindingChecker.isImplementedBy(
            connection.tools.map((t) => ({
              name: t.name,
              inputSchema: t.inputSchema as Record<string, unknown>,
              outputSchema: t.outputSchema as
                | Record<string, unknown>
                | undefined,
            })),
          );
        })
      : connections;

    // Calculate pagination
    const totalCount = filteredConnections.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 100;
    const paginatedConnections = filteredConnections.slice(
      offset,
      offset + limit,
    );
    const hasMore = offset + limit < totalCount;

    return {
      items: paginatedConnections,
      totalCount,
      hasMore,
    };
  },
});
