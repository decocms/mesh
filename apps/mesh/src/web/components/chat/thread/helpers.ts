import type { CollectionUpdateOutput } from "@decocms/bindings/collections";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ThreadUpdateData } from "@/tools/thread/schema.ts";
import type { Thread } from "./types.ts";

/**
 * Call the update thread tool via MCP client
 */
export async function callUpdateThreadTool(
  client: Client | null,
  threadId: string,
  data: ThreadUpdateData,
): Promise<Thread | null> {
  if (!client) {
    throw new Error("MCP client is not available");
  }
  const result = (await client.callTool({
    name: "COLLECTION_THREADS_UPDATE",
    arguments: {
      id: threadId,
      data,
    },
  })) as { structuredContent?: unknown };
  const payload = (result.structuredContent ??
    result) as CollectionUpdateOutput<Thread>;
  return payload.item;
}

/**
 * Build an optimistic thread object for immediate cache insertion
 */
export function buildOptimisticThread(id: string): Thread {
  const now = new Date().toISOString();
  return {
    id,
    title: "New chat", // Empty title until first message generates one
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Find the next available thread when hiding the current one
 */
export function findNextAvailableThread(
  threads: Thread[],
  currentThreadId: string,
): Thread | null {
  return threads.find((thread) => thread.id !== currentThreadId) ?? null;
}
