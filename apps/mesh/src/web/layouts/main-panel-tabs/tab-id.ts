/**
 * Pure helpers for the `?main=<tabId>|0` URL model.
 *
 * Tab id grammar:
 *   - Fixed system: "instructions" | "connections" | "layout" | "preview"
 *   - Agent-declared: <agentTab.id> (from virtualMcp.metadata.ui.layout.tabs)
 *   - Expanded-from-chat: <toolName> (from task.metadata.expanded_tools)
 *   - Ephemeral automation: "automation:<id>" (id="new" = draft)
 *   - "0" = closed sentinel (not an actual tab id)
 */

export interface EntityLayoutMetadata {
  defaultMainView?: { type: string; id?: string } | null;
  tabs?: Array<{ id: string }>;
}

export type AutomationTabParsed =
  | { kind: "new" }
  | { kind: "existing"; id: string };

export function parseAutomationTabId(
  tabId: string | undefined,
): AutomationTabParsed | null {
  if (!tabId || !tabId.startsWith("automation:")) return null;
  const id = tabId.slice("automation:".length);
  if (!id) return null;
  if (id === "new") return { kind: "new" };
  return { kind: "existing", id };
}

export const FIXED_SYSTEM_TABS = [
  "instructions",
  "connections",
  "layout",
  "preview",
] as const;

export function resolveDefaultTabId(
  metadata: EntityLayoutMetadata | null,
): string {
  const def = metadata?.defaultMainView ?? null;
  if (!def) return "instructions";

  if (def.type === "ext-app" || def.type === "ext-apps") {
    return def.id ?? metadata?.tabs?.[0]?.id ?? "instructions";
  }

  if (def.type === "settings") {
    return def.id ?? "instructions";
  }

  return metadata?.tabs?.[0]?.id ?? "instructions";
}

export function resolveActiveTabAndOpen(ctx: {
  mainParam: string | undefined;
  metadata: EntityLayoutMetadata | null;
}): { mainOpen: boolean; activeTab: string } {
  const def = resolveDefaultTabId(ctx.metadata);

  if (ctx.mainParam === "0") {
    return { mainOpen: false, activeTab: def };
  }
  if (ctx.mainParam === undefined) {
    return { mainOpen: ctx.metadata?.defaultMainView != null, activeTab: def };
  }
  return { mainOpen: true, activeTab: ctx.mainParam };
}
