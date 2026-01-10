/**
 * PromptGateway
 *
 * Lazy-loading gateway for aggregating prompts from multiple connections
 */

import type {
  GetPromptRequest,
  GetPromptResult,
  ListPromptsResult,
  Prompt,
} from "@modelcontextprotocol/sdk/types.js";
import { lazy } from "../common";
import type { ProxyCollection } from "./proxy-collection";
import type { ToolSelectionMode } from "../storage/types";

/** Cached data structure */
interface PromptCache {
  prompts: Prompt[];
  mappings: Map<string, string>; // name -> connectionId
}

/** Options for PromptGateway */
export interface PromptGatewayOptions {
  selectionMode: ToolSelectionMode;
}

/**
 * Gateway for aggregating and routing prompts from multiple connections
 *
 * Prompts are loaded lazily on first access and cached for subsequent calls.
 * Uses first-wins deduplication for prompt names (same as tools).
 * Uses lazy() to ensure concurrent calls share the same loading promise.
 */
export class PromptGateway {
  private cache: Promise<PromptCache>;

  constructor(
    private proxies: ProxyCollection,
    private options: PromptGatewayOptions,
  ) {
    // Create lazy cache - only loads when first awaited
    this.cache = lazy(() => this.loadPrompts());
  }

  /**
   * Load prompts from all connections
   */
  private async loadPrompts(): Promise<PromptCache> {
    // Fetch prompts from all connections in parallel
    const results = await this.proxies.mapSettled(
      async (entry, connectionId) => {
        try {
          const result = await entry.proxy.client.listPrompts();
          let prompts = result.prompts;

          // Apply selection based on mode
          if (this.options.selectionMode === "exclusion") {
            // Exclusion mode: exclude selected prompts
            if (entry.selectedPrompts && entry.selectedPrompts.length > 0) {
              const excludeSet = new Set(entry.selectedPrompts);
              prompts = prompts.filter((p) => !excludeSet.has(p.name));
            }
            // If selectedPrompts is null/empty in exclusion mode, include all prompts
          } else {
            // Inclusion mode: include only selected prompts
            // Unlike tools, prompts require explicit selection (for ice breakers UX)
            if (!entry.selectedPrompts || entry.selectedPrompts.length === 0) {
              // No prompts selected = no prompts from this connection
              prompts = [];
            } else {
              const selectedSet = new Set(entry.selectedPrompts);
              prompts = prompts.filter((p) => selectedSet.has(p.name));
            }
          }

          return { connectionId, prompts };
        } catch (error) {
          // Error code -32601 is "Method not found" - expected for MCPs without prompts
          const isMethodNotFound =
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === -32601;
          // Spawn failures are already logged by StableStdio
          const isSpawnFailure =
            error instanceof Error && error.message.includes("Spawn failed");
          if (!isMethodNotFound && !isSpawnFailure) {
            console.error(
              `[PromptGateway] Failed to list prompts for connection ${connectionId}:`,
              error,
            );
          }
          return { connectionId, prompts: [] as Prompt[] };
        }
      },
    );

    // Build prompt name -> connection mapping (first-wins, like tools)
    const seenNames = new Set<string>();
    const allPrompts: Prompt[] = [];
    const mappings = new Map<string, string>();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;

      const { connectionId, prompts } = result.value;
      for (const prompt of prompts) {
        if (seenNames.has(prompt.name)) continue;
        seenNames.add(prompt.name);

        allPrompts.push(prompt);
        mappings.set(prompt.name, connectionId);
      }
    }

    return { prompts: allPrompts, mappings };
  }

  /**
   * List all aggregated prompts
   */
  async list(): Promise<ListPromptsResult> {
    const cache = await this.cache;
    return { prompts: cache.prompts };
  }

  /**
   * Get a prompt by name, routing to the correct connection
   */
  async get(params: GetPromptRequest["params"]): Promise<GetPromptResult> {
    const cache = await this.cache;

    const connectionId = cache.mappings.get(params.name);
    if (!connectionId) {
      throw new Error(`Prompt not found: ${params.name}`);
    }

    const proxyEntry = this.proxies.get(connectionId);
    if (!proxyEntry) {
      throw new Error(`Connection not found for prompt: ${params.name}`);
    }

    return await proxyEntry.proxy.client.getPrompt(params);
  }
}
