/**
 * MCP List Cache
 *
 * Provides a cross-pod cache for MCP tool, resource, and prompt lists via NATS JetStream KV.
 *
 * Used by the withMcpCaching decorator and lazy clients in PassthroughClient.
 */

import { JSONCodec, StorageType, type JetStreamClient, type KV } from "nats";

export type McpListType = "tools" | "resources" | "prompts";

export interface McpListCache {
  get(type: McpListType, connectionId: string): Promise<unknown[] | null>;
  set(type: McpListType, connectionId: string, data: unknown[]): Promise<void>;
  invalidate(connectionId: string): Promise<void>;
  teardown(): void;
}

const KV_BUCKET = "DECOCMS_MCP_LISTS";
const KV_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface JetStreamKVMcpListCacheOptions {
  getJetStream: () => JetStreamClient;
}

export class JetStreamKVMcpListCache implements McpListCache {
  private kv: KV | null = null;
  private readonly codec = JSONCodec<unknown[]>();

  constructor(private readonly options: JetStreamKVMcpListCacheOptions) {}

  async init(): Promise<void> {
    const js = this.options.getJetStream();
    this.kv = await js.views.kv(KV_BUCKET, {
      ttl: KV_TTL_MS,
      storage: StorageType.Memory,
    });
  }

  async get(
    type: McpListType,
    connectionId: string,
  ): Promise<unknown[] | null> {
    if (!this.kv) return null;
    try {
      const entry = await this.kv.get(`${type}.${connectionId}`);
      if (!entry?.value?.length) return null;
      // DEL/PURGE entries have no meaningful value
      if (entry.operation === "DEL" || entry.operation === "PURGE") return null;
      return this.codec.decode(entry.value);
    } catch {
      return null;
    }
  }

  async set(
    type: McpListType,
    connectionId: string,
    data: unknown[],
  ): Promise<void> {
    if (!this.kv) return;
    try {
      await this.kv.put(`${type}.${connectionId}`, this.codec.encode(data));
    } catch {
      // best-effort, non-critical
    }
  }

  async invalidate(connectionId: string): Promise<void> {
    if (!this.kv) return;
    const types: McpListType[] = ["tools", "resources", "prompts"];
    await Promise.all(
      types.map(async (type) => {
        try {
          await this.kv!.delete(`${type}.${connectionId}`);
        } catch {
          // best-effort, non-critical
        }
      }),
    );
  }

  teardown(): void {
    this.kv = null;
  }
}

// Module-level revalidation tracking (prevents thundering herd)
const revalidating = new Set<string>();

/**
 * Fetch with cache: checks cache first, then revalidates in background.
 * On cache hit, returns cached data immediately and revalidates in background.
 * On cache miss, waits for upstream and populates cache.
 */
export async function fetchWithCache(
  type: McpListType,
  connectionId: string,
  fetchLive: () => Promise<unknown[]>,
  cache: McpListCache | null,
): Promise<unknown[] | null> {
  const t0 = performance.now();

  if (!cache) {
    console.log(
      `[fetchWithCache] ${type}:${connectionId} no-cache, fetching live`,
    );
    try {
      const data = await fetchLive();
      console.log(
        `[fetchWithCache] ${type}:${connectionId} no-cache live OK (${(performance.now() - t0).toFixed(1)}ms, ${data.length} items)`,
      );
      return data;
    } catch (err) {
      console.log(
        `[fetchWithCache] ${type}:${connectionId} no-cache live FAILED (${(performance.now() - t0).toFixed(1)}ms): ${err}`,
      );
      return null;
    }
  }

  // Check cache first
  const cached = await cache.get(type, connectionId);
  const cacheMs = (performance.now() - t0).toFixed(1);

  if (cached === null) {
    // Cache miss: fetch live and populate cache
    console.log(
      `[fetchWithCache] ${type}:${connectionId} MISS (cache lookup ${cacheMs}ms), waiting for upstream`,
    );
    try {
      const data = await fetchLive();
      console.log(
        `[fetchWithCache] ${type}:${connectionId} MISS→live OK (${(performance.now() - t0).toFixed(1)}ms, ${data.length} items)`,
      );
      cache.set(type, connectionId, data).catch(() => {});
      return data;
    } catch (err) {
      console.log(
        `[fetchWithCache] ${type}:${connectionId} MISS→live FAILED (${(performance.now() - t0).toFixed(1)}ms): ${err}`,
      );
      return null;
    }
  }

  // Cache hit: return immediately, revalidate in background
  console.log(
    `[fetchWithCache] ${type}:${connectionId} HIT (${cacheMs}ms, ${cached.length} items), returning cached`,
  );
  const revalKey = `${type}:${connectionId}`;
  if (!revalidating.has(revalKey)) {
    revalidating.add(revalKey);
    fetchLive()
      .then((data) => {
        console.log(
          `[fetchWithCache] ${type}:${connectionId} background reval OK (${(performance.now() - t0).toFixed(1)}ms, ${data.length} items)`,
        );
        return cache.set(type, connectionId, data);
      })
      .catch((err) => {
        console.log(
          `[fetchWithCache] ${type}:${connectionId} background reval FAILED: ${err}`,
        );
      })
      .finally(() => revalidating.delete(revalKey));
  } else {
    console.log(
      `[fetchWithCache] ${type}:${connectionId} reval already in-flight, skipping`,
    );
  }

  return cached;
}

// Module-level active cache — set once at app startup, read by withMcpCaching
let activeCache: McpListCache | null = null;

export function setMcpListCache(cache: McpListCache | null): void {
  activeCache = cache;
}

export function getMcpListCache(): McpListCache | null {
  return activeCache;
}
