export type ToolPartStatus =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

export interface ToolCallMetrics {
  usage?: { tokens: number; cost?: number };
  latencySeconds?: number;
}

/**
 * Format usage and latency for display.
 * Returns "120 tokens · 0.3s" or "120 tokens · $0.0012", etc.
 * Cost is shown only when cost > 0. Returns null when nothing to display.
 */
export function formatToolMetrics(metrics: ToolCallMetrics): string | null {
  const parts: string[] = [];

  if (metrics.usage?.tokens != null) {
    parts.push(`${metrics.usage.tokens.toLocaleString()} tokens`);
    if (metrics.usage.cost != null && metrics.usage.cost > 0) {
      parts.push(`$${metrics.usage.cost.toFixed(4)}`);
    }
  }

  if (metrics.latencySeconds != null) {
    parts.push(`${metrics.latencySeconds.toFixed(1)}s`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Convert a tool name to a friendly display name.
 * Converts SCREAMING_SNAKE_CASE or snake_case to Title Case.
 * Edge cases: empty string returns "", single word returns title-cased word.
 */
export function getFriendlyToolName(toolName: string): string {
  if (!toolName) return "";
  return toolName
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
