/**
 * Task status utilities.
 *
 * Status is a small colored icon inline with the title.
 * Each status has a "verb" — what this means for you as a manager.
 *
 * Display groups show one section per status key, always rendered even when empty.
 */

import type { Task } from "@/web/components/chat/task/types";
import type { ChatMessage } from "@/web/components/chat/types";
import {
  AlertCircle,
  CheckCircle,
  Circle,
  Hourglass03,
  Loading01,
  XCircle,
} from "@untitledui/icons";

export type StatusKey =
  | "requires_action"
  | "failed"
  | "expired"
  | "in_progress"
  | "completed";

export interface StatusConfig {
  label: string;
  /** What this status means for you — shown as metadata */
  verb: string;
  icon: typeof Loading01;
  iconClassName: string;
  /** Color for the verb/label text */
  labelColor: string;
}

export const STATUS_CONFIG: Record<StatusKey, StatusConfig> = {
  requires_action: {
    label: "Needs review",
    verb: "Waiting for your review",
    icon: AlertCircle,
    iconClassName: "text-orange-500",
    labelColor: "text-orange-600 dark:text-orange-400",
  },
  failed: {
    label: "Failed",
    verb: "Something went wrong",
    icon: XCircle,
    iconClassName: "text-red-500",
    labelColor: "text-red-600 dark:text-red-400",
  },
  expired: {
    label: "Timed out",
    verb: "Stopped responding",
    icon: Hourglass03,
    iconClassName: "text-amber-500",
    labelColor: "text-amber-600 dark:text-amber-400",
  },
  in_progress: {
    label: "Running",
    verb: "Agent is working",
    icon: Loading01,
    iconClassName: "text-blue-500",
    labelColor: "text-blue-600 dark:text-blue-400",
  },
  completed: {
    label: "Done",
    verb: "Completed",
    icon: CheckCircle,
    iconClassName: "text-muted-foreground/50",
    labelColor: "text-muted-foreground",
  },
};

const UNKNOWN: StatusConfig = {
  label: "Unknown",
  verb: "Unknown status",
  icon: Circle,
  iconClassName: "text-muted-foreground",
  labelColor: "text-muted-foreground",
};

function getStatusConfig(status: string | undefined): StatusConfig {
  return STATUS_CONFIG[(status ?? "completed") as StatusKey] ?? UNKNOWN;
}

// ============================================================================
// Display groups — 3 sections: Needs review, Running, Done
// ============================================================================

export type DisplayGroupKey = "needs_review" | "running" | "done";

export interface DisplayGroup {
  key: DisplayGroupKey;
  label: string;
  icon: typeof Loading01;
  iconClassName: string;
  tasks: Task[];
}

const DISPLAY_GROUP_META: Record<
  DisplayGroupKey,
  { label: string; icon: typeof Loading01; iconClassName: string }
> = {
  needs_review: {
    label: "Needs review",
    icon: AlertCircle,
    iconClassName: "text-orange-500",
  },
  running: {
    label: "Running",
    icon: Loading01,
    iconClassName: "text-blue-500",
  },
  done: {
    label: "Done",
    icon: CheckCircle,
    iconClassName: "text-muted-foreground/50",
  },
};

function toDisplayGroupKey(status: string | undefined): DisplayGroupKey {
  switch (status) {
    case "requires_action":
    case "failed":
    case "expired":
      return "needs_review";
    case "in_progress":
      return "running";
    default:
      return "done";
  }
}

/** Build 3 display groups, always rendered even when empty. */
export function buildDisplayGroups(tasks: Task[]): DisplayGroup[] {
  const buckets: Record<DisplayGroupKey, Task[]> = {
    needs_review: [],
    running: [],
    done: [],
  };

  for (const task of tasks) {
    buckets[toDisplayGroupKey(task.status)].push(task);
  }

  // Sort within each bucket by updated_at desc
  for (const group of Object.values(buckets)) {
    group.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }

  const order: DisplayGroupKey[] = ["needs_review", "running", "done"];

  return order.map((key) => ({
    key,
    ...DISPLAY_GROUP_META[key],
    tasks: buckets[key],
  }));
}

// ============================================================================
// "Needs your answer" detection from cached messages
// ============================================================================

/**
 * Check if a task has a pending user_ask tool call (unanswered question).
 * Only works when messages are cached in the store.
 */
function hasPendingUserAsk(messages: ChatMessage[] | undefined): boolean {
  if (!messages || messages.length === 0) return false;
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  return last.parts.some(
    (part) =>
      "type" in part &&
      part.type === "tool-user_ask" &&
      "state" in part &&
      part.state === "input-available",
  );
}

/**
 * Check if a task has a pending tool approval request.
 * Only works when messages are cached in the store.
 */
function hasPendingApproval(messages: ChatMessage[] | undefined): boolean {
  if (!messages || messages.length === 0) return false;
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  return last.parts.some(
    (part) => "state" in part && part.state === "approval-requested",
  );
}

/**
 * Get the display verb for a task, considering cached message state.
 * Returns null when no verb should be shown (normal in_progress/completed).
 * Only shows a verb when the task actually needs attention:
 * - Pending user_ask → "Needs your answer"
 * - Pending approval → "Needs approval"
 * - Failed/expired → "Something went wrong" / "Stopped responding"
 */
export function getTaskVerb(
  task: Task,
  cachedMessages?: ChatMessage[],
): { verb: string; labelColor: string } | null {
  const config = getStatusConfig(task.status);

  if (task.status === "requires_action") {
    if (hasPendingUserAsk(cachedMessages)) {
      return { verb: "Needs your answer", labelColor: config.labelColor };
    }
    if (hasPendingApproval(cachedMessages)) {
      return { verb: "Needs approval", labelColor: config.labelColor };
    }
    // No specific action detected — don't show a generic verb
    return null;
  }

  if (task.status === "failed" || task.status === "expired") {
    return { verb: config.verb, labelColor: config.labelColor };
  }

  // in_progress, completed — no verb needed
  return null;
}
