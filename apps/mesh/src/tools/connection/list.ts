/**
 * COLLECTION_CONNECTIONS_LIST Tool
 *
 * List all connections in the organization with collection binding compliance.
 * Supports filtering, sorting, and pagination.
 */

import { type Binder, createBindingChecker } from "@decocms/bindings";
import { ASSISTANTS_BINDING } from "@decocms/bindings/assistant";
import {
  CollectionListInputSchema,
  applyOrderBy,
  createCollectionListOutputSchema,
  evaluateWhereExpression,
  resolveCollectionListInput,
} from "@decocms/bindings/collections";
import { LANGUAGE_MODEL_BINDING } from "@decocms/bindings/llm";
import { OBJECT_STORAGE_BINDING } from "@decocms/bindings/object-storage";
import { WellKnownOrgMCPId } from "@decocms/mesh-sdk";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { getBaseUrl } from "../../core/server-constants";
import { requireOrganization } from "../../core/mesh-context";
import { createDevAssetsConnectionEntity, isDevMode } from "./dev-assets";
import { type ConnectionEntity, ConnectionEntitySchema } from "./schema";

const BUILTIN_BINDING_CHECKERS: Record<string, Binder> = {
  LLM: LANGUAGE_MODEL_BINDING,
  ASSISTANTS: ASSISTANTS_BINDING,
  OBJECT_STORAGE: OBJECT_STORAGE_BINDING,
};

/**
 * Extended input schema with optional binding and include_virtual parameters
 */
const ConnectionListInputSchema = CollectionListInputSchema.extend({
  binding: z.union([z.object({}).passthrough(), z.string()]).optional(),
  include_virtual: z
    .boolean()
    .optional()
    .describe(
      "Whether to include VIRTUAL connections in the results. Defaults to false.",
    ),
});

/**
 * Output schema using the ConnectionEntitySchema
 */
const ConnectionListOutputSchema = createCollectionListOutputSchema(
  ConnectionEntitySchema,
);

export const COLLECTION_CONNECTIONS_LIST = defineTool({
  name: "COLLECTION_CONNECTIONS_LIST",
  description:
    "List connections. Use 'search' to find by name/description, 'sort' for ordering (newest, oldest, a-z, z-a).",
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

    // Resolve simple search/sort params into where/orderBy
    const resolved = resolveCollectionListInput(input);

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

    // Filter connections by binding if specified (tools are pre-populated at create/update time)
    let filteredConnections = bindingChecker
      ? await Promise.all(
          connections.map(async (connection) => {
            if (!connection.tools || connection.tools.length === 0) {
              return null;
            }

            const isValid = bindingChecker.isImplementedBy(
              connection.tools.map((t) => ({
                name: t.name,
                inputSchema: t.inputSchema as Record<string, unknown>,
                outputSchema: t.outputSchema as
                  | Record<string, unknown>
                  | undefined,
              })),
            );

            return isValid ? connection : null;
          }),
        ).then((results) =>
          results.filter((c): c is ConnectionEntity => c !== null),
        )
      : connections;

    // Apply where filter if specified
    if (resolved.where) {
      filteredConnections = filteredConnections.filter((conn) =>
        evaluateWhereExpression(
          conn as unknown as Record<string, unknown>,
          resolved.where!,
        ),
      );
    }

    // Apply orderBy if specified
    if (resolved.orderBy && resolved.orderBy.length > 0) {
      filteredConnections = applyOrderBy(
        filteredConnections as unknown as Record<string, unknown>[],
        resolved.orderBy,
      ) as unknown as ConnectionEntity[];
    }

    // Calculate pagination
    const totalCount = filteredConnections.length;
    const offset = resolved.offset ?? 0;
    const limit = resolved.limit ?? 100;
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
