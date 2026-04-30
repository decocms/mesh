/**
 * Helpers for detecting + formatting access-denied errors that come back
 * from the MCP layer or Better Auth.
 *
 * Used by the error boundary fallback to swap "Something went wrong + raw
 * MCP error" for a friendlier "no permission" panel, and by mutation
 * onError handlers to format toasts.
 */

const ACCESS_DENIED_PATTERNS = [
  /access denied to:?\s*([\w-]+)/i,
  /you[' ]?re not allowed/i,
  /you are not allowed/i,
  /forbidden/i,
  /permission denied/i,
  /not authorized/i,
  /\b403\b/,
];

const TOOL_NAME_PATTERN = /access denied to:?\s*([\w-]+)/i;

export interface AccessDeniedInfo {
  /** The tool / capability name we detected, if the error mentioned one. */
  resource: string | null;
}

/**
 * Returns AccessDeniedInfo if the error looks like a permission failure,
 * otherwise null.
 */
export function detectAccessDenied(error: unknown): AccessDeniedInfo | null {
  if (!error) return null;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!message) return null;

  let matched = false;
  for (const pattern of ACCESS_DENIED_PATTERNS) {
    if (pattern.test(message)) {
      matched = true;
      break;
    }
  }
  if (!matched) return null;

  const toolMatch = message.match(TOOL_NAME_PATTERN);
  return { resource: toolMatch?.[1] ?? null };
}

/**
 * Convert any error to a user-friendly message. If the error is an
 * access-denied error, returns a clean "no permission" string; otherwise
 * returns the original message.
 */
export function toFriendlyErrorMessage(
  error: unknown,
  fallback = "Something went wrong",
): string {
  const denied = detectAccessDenied(error);
  if (denied) {
    return denied.resource
      ? `You don't have permission to use ${denied.resource}. Ask an admin to update your role.`
      : "You don't have permission to do this. Ask an admin to update your role.";
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}
