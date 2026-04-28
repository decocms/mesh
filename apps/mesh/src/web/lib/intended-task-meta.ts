/**
 * Intended task meta — module-level Map keyed by taskId, holding metadata
 * (currently the carried branch) for not-yet-created threads.
 *
 * Threads are created lazily on the first user message so empty page-load
 * navigations don't flood the task list. When a "+ New chat" entry point
 * outside the chat context (panel/toolbar) navigates to a fresh task id, it
 * stashes the source task's branch here so the eventual lazy create lands on
 * the same warm sandbox.
 *
 * Cleared by sendMessage's create path on success and on lazy-create failure.
 */

interface IntendedTaskMeta {
  branch: string | null;
}

const STORE = new Map<string, IntendedTaskMeta>();

export function setIntendedTaskMeta(
  taskId: string,
  meta: IntendedTaskMeta,
): void {
  if (!taskId) return;
  if (!meta.branch) {
    STORE.delete(taskId);
    return;
  }
  STORE.set(taskId, meta);
}

export function getIntendedTaskMeta(
  taskId: string,
): IntendedTaskMeta | undefined {
  if (!taskId) return undefined;
  return STORE.get(taskId);
}

export function clearIntendedTaskMeta(taskId: string): void {
  STORE.delete(taskId);
}
