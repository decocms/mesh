/**
 * Task (thread) hooks — backed by COLLECTION_THREADS_* tools.
 *
 * The actions wrapper has been retired now that thread creation is owned
 * exclusively by the lazy path in chat-context's sendMessage. Re-exports
 * useEnsureTask for callers that just want to look up a task by id.
 */

import type { ThreadEntity } from "@/tools/thread/schema";

export type Task = ThreadEntity;

export { useEnsureTask } from "./use-ensure-task";
