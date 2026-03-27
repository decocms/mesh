/**
 * Registry Service Layer
 *
 * Shared logic for unified registry tools: fan-out, retry, normalization,
 * tool name inference, and registry source management.
 */

import type { MeshContext } from "@/core/mesh-context";
import { WellKnownOrgMCPId } from "@decocms/mesh-sdk";
import { InternalCursorSchema, type RegistryItem } from "./schema";

// ============================================================================
// Types
// ============================================================================

export interface RegistrySource {
  id: string;
  title: string;
  icon: string | null;
  isCommunity: boolean;
}

export interface RegistryFanOutResult {
  registryId: string;
  registryName: string;
  data: unknown;
  error?: string;
}

type RegistryOperation = "LIST" | "GET" | "SEARCH" | "VERSIONS" | "FILTERS";

// ============================================================================
// Constants
// ============================================================================

const PER_REGISTRY_TIMEOUT_MS = 15_000;
const OVERALL_DEADLINE_MS = 30_000;
const MAX_RETRIES = 3;
const MAX_CONCURRENCY = 5;

/** Tool name mapping for well-known registries */
const WELL_KNOWN_TOOL_NAMES: Record<RegistryOperation, string> = {
  LIST: "COLLECTION_REGISTRY_APP_LIST",
  GET: "COLLECTION_REGISTRY_APP_GET",
  SEARCH: "COLLECTION_REGISTRY_APP_SEARCH",
  VERSIONS: "COLLECTION_REGISTRY_APP_VERSIONS",
  FILTERS: "COLLECTION_REGISTRY_APP_FILTERS",
};

/** Tool name mapping for private registries */
const PRIVATE_TOOL_NAMES: Record<RegistryOperation, string> = {
  LIST: "REGISTRY_ITEM_LIST",
  GET: "REGISTRY_ITEM_GET",
  SEARCH: "REGISTRY_ITEM_SEARCH",
  VERSIONS: "REGISTRY_ITEM_VERSIONS",
  FILTERS: "REGISTRY_ITEM_FILTERS",
};

// ============================================================================
// Registry Source Management
// ============================================================================

/**
 * Get all enabled registry sources for the organization.
 * Reads registry_config from org settings and combines with well-known IDs.
 *
 * Default-enabled logic:
 * - Deco Store is enabled by default unless explicitly disabled
 * - Community Registry is enabled by default unless explicitly disabled
 * - Private registries require explicit enablement
 */
export async function getEnabledRegistries(
  ctx: MeshContext,
): Promise<RegistrySource[]> {
  const orgId = ctx.organization?.id;
  if (!orgId) throw new Error("Organization context required");

  const settings = await ctx.storage.organizationSettings.get(orgId);
  const config = settings?.registry_config;

  const decoStoreId = WellKnownOrgMCPId.REGISTRY(orgId);
  const communityId = WellKnownOrgMCPId.COMMUNITY_REGISTRY(orgId);

  const registries: RegistrySource[] = [];

  // Deco Store: enabled by default unless explicitly disabled
  const decoStoreEntry = config?.registries?.[decoStoreId];
  if (!decoStoreEntry || decoStoreEntry.enabled !== false) {
    const conn = await ctx.storage.connections.findById(decoStoreId, orgId);
    registries.push({
      id: decoStoreId,
      title: conn?.title ?? "Deco Store",
      icon: conn?.icon ?? null,
      isCommunity: false,
    });
  }

  // Community Registry: enabled by default unless explicitly disabled
  const communityEntry = config?.registries?.[communityId];
  if (!communityEntry || communityEntry.enabled !== false) {
    const conn = await ctx.storage.connections.findById(communityId, orgId);
    if (conn) {
      registries.push({
        id: communityId,
        title: conn.title ?? "MCP Registry",
        icon: conn.icon ?? null,
        isCommunity: true,
      });
    }
  }

  // Private registries: only if explicitly enabled
  if (config?.registries) {
    for (const [id, entry] of Object.entries(config.registries)) {
      if (id === decoStoreId || id === communityId) continue;
      if (!entry.enabled) continue;
      const conn = await ctx.storage.connections.findById(id, orgId);
      if (conn) {
        registries.push({
          id,
          title: conn.title ?? id,
          icon: conn.icon ?? null,
          isCommunity: false,
        });
      }
    }
  }

  return registries;
}

/**
 * Validate that a user-supplied registryId is in the enabled registries list.
 * Throws a structured error if not found.
 */
export function validateRegistryId(
  registryId: string,
  enabledRegistries: RegistrySource[],
): RegistrySource {
  const source = enabledRegistries.find((r) => r.id === registryId);
  if (!source) {
    throw new Error(
      `Registry "${registryId}" is not enabled or does not exist`,
    );
  }
  return source;
}

/**
 * Classify registries into non-community and community groups.
 */
export function classifyRegistries(registries: RegistrySource[]): {
  nonCommunity: RegistrySource[];
  community: RegistrySource[];
} {
  const nonCommunity: RegistrySource[] = [];
  const community: RegistrySource[] = [];
  for (const r of registries) {
    if (r.isCommunity) {
      community.push(r);
    } else {
      nonCommunity.push(r);
    }
  }
  return { nonCommunity, community };
}

// ============================================================================
// Tool Name Inference
// ============================================================================

/**
 * Check if a connection ID belongs to a well-known (non-private) registry.
 */
function isWellKnownRegistry(connectionId: string, orgId: string): boolean {
  return (
    connectionId === WellKnownOrgMCPId.REGISTRY(orgId) ||
    connectionId === WellKnownOrgMCPId.COMMUNITY_REGISTRY(orgId)
  );
}

/**
 * Infer the correct tool name for a registry operation.
 * Well-known registries use COLLECTION_REGISTRY_APP_* tools.
 * Private registries use REGISTRY_ITEM_* tools.
 */
export function inferToolName(
  connectionId: string,
  orgId: string,
  operation: RegistryOperation,
): string {
  if (isWellKnownRegistry(connectionId, orgId)) {
    return WELL_KNOWN_TOOL_NAMES[operation];
  }
  return PRIVATE_TOOL_NAMES[operation];
}

/**
 * Resolve the actual tool name on a connection, with fallback.
 * If the inferred name doesn't exist, lists tools and searches by suffix.
 */
async function resolveToolName(
  ctx: MeshContext,
  connectionId: string,
  operation: RegistryOperation,
  toolListCache: Map<string, string[]>,
): Promise<string | null> {
  const orgId = ctx.organization!.id;
  const inferred = inferToolName(connectionId, orgId, operation);

  // Check cache first
  let toolNames = toolListCache.get(connectionId);
  if (toolNames) {
    if (toolNames.includes(inferred)) return inferred;
    const suffix = `_${operation}`;
    return toolNames.find((n) => n.endsWith(suffix)) ?? null;
  }

  // List tools to populate cache
  let client;
  try {
    client = await ctx.createMCPProxy(connectionId);
    const result = await client.listTools();
    toolNames = result.tools.map((t) => t.name);
    toolListCache.set(connectionId, toolNames);

    if (toolNames.includes(inferred)) return inferred;
    const suffix = `_${operation}`;
    return toolNames.find((n) => n.endsWith(suffix)) ?? null;
  } finally {
    await client?.close().catch(() => {});
  }
}

// ============================================================================
// Registry Tool Calls
// ============================================================================

/**
 * Call a tool on a registry connection with retry logic.
 * Per-call timeout: 15 seconds. Retries: up to 3 total attempts.
 */
export async function callRegistryTool(
  ctx: MeshContext,
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let client;
    try {
      client = await ctx.createMCPProxy(connectionId);
      const result = await client.callTool(
        { name: toolName, arguments: args },
        undefined,
        { timeout: PER_REGISTRY_TIMEOUT_MS },
      );
      const payload = result as { structuredContent?: unknown };
      return payload.structuredContent ?? result;
    } catch (err) {
      lastError = err;
    } finally {
      await client?.close().catch(() => {});
    }
  }

  throw lastError;
}

// ============================================================================
// Fan-Out
// ============================================================================

/**
 * Simple semaphore for concurrency limiting.
 */
function createSemaphore(max: number) {
  let current = 0;
  const queue: Array<() => void> = [];

  return {
    async acquire(): Promise<void> {
      if (current < max) {
        current++;
        return;
      }
      await new Promise<void>((resolve) => queue.push(resolve));
    },
    release(): void {
      current--;
      const next = queue.shift();
      if (next) {
        current++;
        next();
      }
    },
  };
}

/**
 * Fan out a tool call to multiple registries in parallel with error isolation.
 * - Max 5 concurrent calls
 * - Per-registry error isolation
 * - Overall deadline: 30 seconds
 */
export async function fanOutToRegistries(
  ctx: MeshContext,
  registries: RegistrySource[],
  operation: RegistryOperation,
  argsPerRegistry: (registry: RegistrySource) => Record<string, unknown>,
  toolListCache: Map<string, string[]>,
): Promise<RegistryFanOutResult[]> {
  if (registries.length === 0) return [];

  const semaphore = createSemaphore(MAX_CONCURRENCY);
  const deadline = AbortSignal.timeout(OVERALL_DEADLINE_MS);

  const results = await Promise.all(
    registries.map(async (registry): Promise<RegistryFanOutResult> => {
      await semaphore.acquire();
      try {
        if (deadline.aborted) {
          return {
            registryId: registry.id,
            registryName: registry.title,
            data: null,
            error: "Overall deadline exceeded",
          };
        }

        const toolName = await resolveToolName(
          ctx,
          registry.id,
          operation,
          toolListCache,
        );
        if (!toolName) {
          return {
            registryId: registry.id,
            registryName: registry.title,
            data: null,
          };
        }

        const args = argsPerRegistry(registry);
        const data = await callRegistryTool(ctx, registry.id, toolName, args);
        return {
          registryId: registry.id,
          registryName: registry.title,
          data,
        };
      } catch (err) {
        return {
          registryId: registry.id,
          registryName: registry.title,
          data: null,
          error: (err as Error).message,
        };
      } finally {
        semaphore.release();
      }
    }),
  );

  return results;
}

// ============================================================================
// Item Normalization
// ============================================================================

/**
 * Extract items array from various response formats.
 */
function extractItems(response: unknown): unknown[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (typeof response === "object" && response !== null) {
    const obj = response as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.data)) return obj.data;
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return [];
}

/**
 * Normalize a raw registry response item into the unified RegistryItemSchema format.
 * Handles both well-known (COLLECTION_REGISTRY_APP) and private (REGISTRY_ITEM) response shapes.
 */
export function normalizeItem(
  raw: unknown,
  registryId: string,
  registryName: string,
): RegistryItem {
  if (!raw || typeof raw !== "object") {
    return createEmptyItem(registryId, registryName);
  }

  const item = raw as Record<string, unknown>;
  const meta = item._meta as Record<string, unknown> | undefined;
  const mesh = meta?.["mcp.mesh"] as Record<string, unknown> | undefined;

  const server = item.server as Record<string, unknown> | undefined;

  return {
    id: String(item.id ?? ""),
    name: asNullableString(item.name),
    title: asNullableString(item.title ?? mesh?.friendly_name),
    description: asNullableString(
      item.description ?? server?.description ?? mesh?.short_description,
    ),
    icon: asNullableString(item.icon ?? item.image ?? item.logo),
    verified: mesh?.verified === true || item.verified === true || undefined,
    publisher: asNullableString(item.publisher ?? mesh?.owner),
    registryId,
    registryName,
    server: {
      name: String(server?.name ?? item.name ?? ""),
      description: asOptionalString(server?.description),
      version: asOptionalString(server?.version),
      remotes: normalizeRemotes(server?.remotes),
      packages: normalizePackages(server?.packages),
      repository: server?.repository
        ? {
            url: asOptionalString(
              (server.repository as Record<string, unknown>)?.url,
            ),
          }
        : undefined,
    },
    tags:
      mesh?.tags && Array.isArray(mesh.tags)
        ? mesh.tags.filter((t): t is string => typeof t === "string")
        : item.tags && Array.isArray(item.tags)
          ? item.tags.filter((t): t is string => typeof t === "string")
          : undefined,
    categories:
      mesh?.categories && Array.isArray(mesh.categories)
        ? mesh.categories.filter((c): c is string => typeof c === "string")
        : item.categories && Array.isArray(item.categories)
          ? item.categories.filter((c): c is string => typeof c === "string")
          : undefined,
    updatedAt: asNullableString(
      item.updated_at ?? item.updatedAt ?? mesh?.updatedAt,
    ),
  };
}

/**
 * Normalize and extract items from a fan-out result.
 */
export function normalizeItems(result: RegistryFanOutResult): RegistryItem[] {
  const rawItems = extractItems(result.data);
  return rawItems.map((raw) =>
    normalizeItem(raw, result.registryId, result.registryName),
  );
}

// ============================================================================
// Cursor Helpers
// ============================================================================

/**
 * Encode an internal cursor to an opaque string.
 */
export function encodeCursor(cursor: {
  phase: string;
  registryCursors: Record<string, string>;
}): string {
  return btoa(JSON.stringify(cursor));
}

/**
 * Decode an opaque cursor string. Returns null if invalid.
 */
export function decodeCursor(cursor: string): {
  phase: "non-community" | "community";
  registryCursors: Record<string, string>;
} | null {
  try {
    const decoded = JSON.parse(atob(cursor));
    const parsed = InternalCursorSchema.safeParse(decoded);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function createEmptyItem(
  registryId: string,
  registryName: string,
): RegistryItem {
  return {
    id: "",
    name: null,
    title: null,
    description: null,
    icon: null,
    publisher: null,
    registryId,
    registryName,
    server: { name: "" },
    updatedAt: null,
  };
}

function normalizeRemotes(
  remotes: unknown,
): Array<{ type?: string; url?: string }> | undefined {
  if (!Array.isArray(remotes)) return undefined;
  return remotes
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      type: asOptionalString((r as Record<string, unknown>).type),
      url: asOptionalString((r as Record<string, unknown>).url),
    }));
}

function normalizePackages(
  packages: unknown,
): Array<{ identifier: string; name?: string; version?: string }> | undefined {
  if (!Array.isArray(packages)) return undefined;
  return packages
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      identifier: String((p as Record<string, unknown>).identifier ?? ""),
      name: asOptionalString((p as Record<string, unknown>).name),
      version: asOptionalString((p as Record<string, unknown>).version),
    }));
}
