export type ThreadStatus =
  | "in_progress"
  | "requires_action"
  | "completed"
  | "failed"
  | "queued"
  | string;

export function statusVerb(thread: {
  status?: ThreadStatus | null;
  hidden?: boolean | null;
}): string {
  if (thread.hidden) return "Archived";
  switch (thread.status) {
    case "in_progress":
      return "Running";
    case "requires_action":
      return "Needs action";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return "Queued";
  }
}
