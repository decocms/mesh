import type { CollectionUpdateOutput } from "@decocms/bindings/collections";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ThreadUpdateData } from "@/tools/thread/schema.ts";
import type { Task } from "./types.ts";

/**
 * Call the update task tool via MCP client
 */
export async function callUpdateTaskTool(
  client: Client | null,
  taskId: string,
  data: ThreadUpdateData,
): Promise<Task | null> {
  if (!client) {
    console.error("[chat] callUpdateTaskTool: MCP client is null", {
      taskId,
      data,
    });
    throw new Error("MCP client is not available");
  }
  console.log("[chat] callUpdateTaskTool: calling COLLECTION_THREADS_UPDATE", {
    taskId,
    data,
  });
  const result = (await client.callTool({
    name: "COLLECTION_THREADS_UPDATE",
    arguments: {
      id: taskId,
      data,
    },
  })) as { structuredContent?: unknown };
  const payload = (result.structuredContent ??
    result) as CollectionUpdateOutput<Task>;
  console.log("[chat] callUpdateTaskTool: result", {
    taskId,
    hasItem: !!payload.item,
    isError: (result as { isError?: boolean }).isError,
  });
  return payload.item;
}

/**
 * Build an optimistic task object for immediate cache insertion
 */
export function buildOptimisticTask(id: string): Task {
  const now = new Date().toISOString();
  return {
    id,
    title: "New chat", // Empty title until first message generates one
    created_at: now,
    updated_at: now,
    // agent_ids intentionally omitted — populated on first sendMessage via addAgentToTask
  };
}
