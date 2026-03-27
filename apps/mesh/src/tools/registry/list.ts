import { defineTool } from "@/core/define-tool";
import { requireOrganization } from "@/core/mesh-context";
import { RegistryListInputSchema, RegistryListOutputSchema } from "./schema";
import {
  classifyRegistries,
  decodeCursor,
  encodeCursor,
  fanOutToRegistries,
  getEnabledRegistries,
  normalizeItems,
  validateRegistryId,
} from "./registry-service";
import type { RegistryItem } from "./schema";

export const REGISTRY_LIST = defineTool({
  name: "REGISTRY_LIST",
  description:
    "Browse available MCP servers across all registries in your organization. Returns a paginated list of items from all enabled registries, with non-community results first.",
  inputSchema: RegistryListInputSchema,
  outputSchema: RegistryListOutputSchema,
  annotations: {
    title: "Browse Registry",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (input, ctx) => {
    await ctx.access.check();
    requireOrganization(ctx);

    const enabledRegistries = await getEnabledRegistries(ctx);
    const toolListCache = new Map<string, string[]>();

    // If registryId is provided, scope to that single registry
    if (input.registryId) {
      const source = validateRegistryId(input.registryId, enabledRegistries);
      const results = await fanOutToRegistries(
        ctx,
        [source],
        "LIST",
        () => buildListArgs(input),
        toolListCache,
      );
      const items = results.flatMap(normalizeItems);
      const nextCursor = extractNextCursorFromResults(results);
      return {
        items: items.slice(0, input.limit),
        nextCursor,
        hasMore: nextCursor !== null,
      };
    }

    // Multi-registry: phase-based pagination
    const { nonCommunity, community } = classifyRegistries(enabledRegistries);
    let cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const phase = cursor?.phase ?? "non-community";
    const registryCursors = cursor?.registryCursors ?? {};

    // Track items per registry so we only advance cursors for registries
    // whose items actually made it into the output (avoids skipping items).
    interface TaggedItems {
      registryId: string;
      items: RegistryItem[];
      nextCursor: string | null;
    }

    const taggedResults: TaggedItems[] = [];
    let nextPhase = phase;

    if (phase === "non-community") {
      const activeNonCommunity = nonCommunity.filter(
        (r) => registryCursors[r.id] !== "EXHAUSTED",
      );

      if (activeNonCommunity.length > 0) {
        const results = await fanOutToRegistries(
          ctx,
          activeNonCommunity,
          "LIST",
          (r) => buildListArgs(input, registryCursors[r.id]),
          toolListCache,
        );

        for (const result of results) {
          taggedResults.push({
            registryId: result.registryId,
            items: normalizeItems(result),
            nextCursor: extractNextCursorFromResult(result),
          });
        }
      }

      // Check if all non-community registries are exhausted
      const allExhausted = nonCommunity.every((r) => {
        const tagged = taggedResults.find((t) => t.registryId === r.id);
        return (
          registryCursors[r.id] === "EXHAUSTED" ||
          (tagged && !tagged.nextCursor)
        );
      });
      if (allExhausted && community.length > 0) {
        nextPhase = "community";
      }
    }

    const allItemsSoFar = taggedResults.flatMap((t) => t.items);

    if (
      (phase === "community" || nextPhase === "community") &&
      allItemsSoFar.length < input.limit
    ) {
      const activeCommunity = community.filter(
        (r) => registryCursors[r.id] !== "EXHAUSTED",
      );
      if (activeCommunity.length > 0) {
        const results = await fanOutToRegistries(
          ctx,
          activeCommunity,
          "LIST",
          (r) => buildListArgs(input, registryCursors[r.id]),
          toolListCache,
        );
        for (const result of results) {
          taggedResults.push({
            registryId: result.registryId,
            items: normalizeItems(result),
            nextCursor: extractNextCursorFromResult(result),
          });
        }
      }
      nextPhase = "community";
    }

    // Flatten all items and determine which registries had items included
    const allItems = taggedResults.flatMap((t) => t.items);
    const limitedItems = allItems.slice(0, input.limit);
    const includedCount = limitedItems.length;

    // Build next cursors: only advance cursors for registries whose items
    // were fully included in the output. If a registry's items were
    // partially or fully truncated, keep the old cursor so those items
    // are re-fetched on the next page.
    const nextRegistryCursors: Record<string, string> = {
      ...registryCursors,
    };
    let consumed = 0;
    for (const tagged of taggedResults) {
      const prevConsumed = consumed;
      consumed += tagged.items.length;
      if (consumed <= includedCount) {
        // All items from this registry were included — advance cursor
        nextRegistryCursors[tagged.registryId] =
          tagged.nextCursor ?? "EXHAUSTED";
      } else if (prevConsumed >= includedCount) {
        // No items from this registry were included — keep old cursor
        // (don't set anything, preserving the existing cursor from input)
      } else {
        // Partially included — don't advance cursor (re-fetch next time)
        // Keep the existing cursor from input
      }
    }

    const allRegistriesExhausted = [...nonCommunity, ...community].every(
      (r) => nextRegistryCursors[r.id] === "EXHAUSTED",
    );
    const hasMore = !allRegistriesExhausted || allItems.length > includedCount;

    const nextCursor = hasMore
      ? encodeCursor({
          phase: nextPhase,
          registryCursors: nextRegistryCursors,
        })
      : null;

    return {
      items: limitedItems,
      nextCursor,
      hasMore,
    };
  },
});

function buildListArgs(
  input: { limit: number; tags?: string[]; categories?: string[] },
  cursor?: string,
): Record<string, unknown> {
  const args: Record<string, unknown> = { limit: input.limit };
  if (cursor && cursor !== "EXHAUSTED") args.cursor = cursor;
  if (input.tags?.length) args.tags = input.tags;
  if (input.categories?.length) args.categories = input.categories;
  return args;
}

function extractNextCursorFromResults(
  results: Array<{ data: unknown }>,
): string | null {
  for (const r of results) {
    const nc = extractNextCursorFromResult(r);
    if (nc) return nc;
  }
  return null;
}

function extractNextCursorFromResult(result: { data: unknown }): string | null {
  if (!result.data || typeof result.data !== "object") return null;
  const data = result.data as Record<string, unknown>;
  return (data.nextCursor as string) ?? (data.cursor as string) ?? null;
}
