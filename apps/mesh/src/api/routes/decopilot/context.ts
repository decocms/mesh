/**
 * AgentContext Implementation
 *
 * Simple Map-based mutable context for storing working memory
 * that the LLM can read/write during conversation loops.
 */

import type { AgentContext } from "./types";

/**
 * Map-based implementation of AgentContext
 */
class MapAgentContext implements AgentContext {
  private store = new Map<string, unknown>();

  get<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set<T = unknown>(key: string, value: T): void {
    this.store.set(key, value);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  snapshot(): Readonly<Record<string, unknown>> {
    return Object.fromEntries(this.store);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Create a new AgentContext with optional initial values
 */
export function createAgentContext(
  initial?: Record<string, unknown>,
): AgentContext {
  const ctx = new MapAgentContext();
  if (initial) {
    for (const [key, value] of Object.entries(initial)) {
      ctx.set(key, value);
    }
  }
  return ctx;
}
