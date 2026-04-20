/**
 * Pure helpers for the `?main=<tabId>|0` URL model.
 *
 * Tab id grammar:
 *   - Fixed system: "instructions" | "connections" | "layout" | "env" | "preview"
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
  "env",
  "preview",
] as const;

const FIXED_SYSTEM_TAB_SET = new Set<string>(FIXED_SYSTEM_TABS);

export function resolveDefaultTabId(
  metadata: EntityLayoutMetadata | null,
): string {
  const def = metadata?.defaultMainView ?? null;
  if (!def) return "instructions";

  // Direct mapping for any fixed system tab id.
  if (FIXED_SYSTEM_TAB_SET.has(def.type)) return def.type;

  // Legacy: "settings" used to be its own tab; the settings card now
  // lives inside the Layout tab.
  if (def.type === "settings") return "layout";

  if (def.type === "ext-app" || def.type === "ext-apps") {
    return def.id ?? metadata?.tabs?.[0]?.id ?? "instructions";
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

/**
 * Tab-as-toggle semantics for the header tab bar.
 *
 * Clicking the currently-active tab while the panel is open closes it
 * (navigates to `?main=0`). Any other click opens or switches.
 */
export function resolveTabClickTarget(ctx: {
  clickedId: string;
  activeTab: string;
  mainOpen: boolean;
}): string {
  if (ctx.mainOpen && ctx.clickedId === ctx.activeTab) return "0";
  return ctx.clickedId;
}
