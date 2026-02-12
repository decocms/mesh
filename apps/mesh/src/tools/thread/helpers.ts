/**
 * Thread normalization helpers for API responses.
 *
 * Provides consistent status derivation (e.g. "expired" for stale in_progress)
 * and hidden defaulting across all thread tools.
 */

import type { Thread, ThreadStatus } from "../../storage/types";

/**
 * Threads stuck in "in_progress" longer than this are surfaced as "expired".
 * This is a virtual status (never stored in the DB) so the thread can
 * resume if the stream reconnects.
 */
export const THREAD_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/** Status values that may appear in API responses (includes virtual "expired"). */
export type ThreadStatusForResponse = ThreadStatus | "expired";

/**
 * Normalize a thread for API response:
 * - Defaults `hidden` to `false` when null
 * - Detects in_progress threads older than 30 minutes and marks them as "expired"
 *
 * @param thread - The thread from storage
 * @param now - Current timestamp in ms (for testing only; never pass user input)
 */
export function normalizeThreadForResponse(
  thread: Thread,
  now: number = Date.now(),
): Omit<Thread, "status" | "hidden"> & {
  status: ThreadStatusForResponse;
  hidden: boolean;
} {
  let status: ThreadStatusForResponse = thread.status;

  if (status === "in_progress") {
    const updatedAtMs = new Date(thread.updated_at).getTime();
    if (!Number.isFinite(updatedAtMs) || now - updatedAtMs > THREAD_EXPIRY_MS) {
      status = "expired";
    }
  }

  return {
    ...thread,
    status,
    hidden: thread.hidden ?? false,
  };
}
