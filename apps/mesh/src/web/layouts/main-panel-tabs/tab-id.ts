/**
 * Pure helpers for the `?main=<tabId>|0` URL model.
 *
 * Tab id grammar:
 *   - Fixed system: "instructions" | "connections" | "layout" | "env" | "preview" | "git"
 *   - Agent-declared: <agentTab.id> (from virtualMcp.metadata.ui.layout.tabs)
 *   - Expanded-from-chat: <toolName> (from task.metadata.expanded_tools)
 *   - Pinned view: "app:<connectionId>:<toolName>" (from metadata.ui.pinnedViews)
 *   - Ephemeral automation: "automation:<id>"
 *   - "0" = closed sentinel (not an actual tab id)
 *
 * GitHub-linked Virtual MCPs hide the "Instructions" tab and replace it
 * with a "git" tab in the header. Resolution helpers accept an optional
 * `hasActiveGithubRepo` flag so "instructions" fallbacks (and an explicit
 * `?main=instructions` in the URL) are coerced to "git", keeping the
 * panel body and the tab bar in sync.
 */

export interface EntityLayoutMetadata {
  defaultMainView?: {
    type: string;
    id?: string;
    toolName?: string;
  } | null;
  tabs?: Array<{ id: string }>;
}

export interface AutomationTabParsed {
  id: string;
}

export function parseAutomationTabId(
  tabId: string | undefined,
): AutomationTabParsed | null {
  if (!tabId || !tabId.startsWith("automation:")) return null;
  const id = tabId.slice("automation:".length);
  if (!id) return null;
  return { id };
}

export interface PinnedViewTabParsed {
  connectionId: string;
  toolName: string;
}

/**
 * Format a pinned view's composite tab id. Carries both `connectionId`
 * and `toolName` so two different connections can expose tools with the
 * same name without colliding in the `?main=` URL state.
 */
export function formatPinnedViewTabId(
  connectionId: string,
  toolName: string,
): string {
  return `app:${connectionId}:${toolName}`;
}

export function parsePinnedViewTabId(
  tabId: string | undefined,
): PinnedViewTabParsed | null {
  if (!tabId || !tabId.startsWith("app:")) return null;
  const rest = tabId.slice("app:".length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const connectionId = rest.slice(0, sep);
  const toolName = rest.slice(sep + 1);
  if (!connectionId || !toolName) return null;
  return { connectionId, toolName };
}

export const FIXED_SYSTEM_TABS = [
  "instructions",
  "connections",
  "automations",
  "layout",
  "env",
  "preview",
  "git",
] as const;

const FIXED_SYSTEM_TAB_SET = new Set<string>(FIXED_SYSTEM_TABS);

/**
 * Coerce "instructions" → "git" when the entity is linked to a GitHub
 * repo. The header tab bar replaces the Instructions tab with a Git tab
 * in that mode; this keeps the panel body in sync regardless of where
 * the "instructions" id originates (URL, defaultMainView, fallback).
 */
function coerceForGithub(tabId: string, hasActiveGithubRepo: boolean): string {
  if (hasActiveGithubRepo && tabId === "instructions") return "git";
  return tabId;
}

export function resolveDefaultTabId(
  metadata: EntityLayoutMetadata | null,
  hasActiveGithubRepo = false,
): string {
  const def = metadata?.defaultMainView ?? null;
  if (!def) return coerceForGithub("instructions", hasActiveGithubRepo);

  // Direct mapping for any fixed system tab id.
  if (FIXED_SYSTEM_TAB_SET.has(def.type))
    return coerceForGithub(def.type, hasActiveGithubRepo);

  // Legacy: "settings" used to be its own tab; the settings card now
  // lives inside the Layout tab.
  if (def.type === "settings") return "layout";

  if (def.type === "ext-app" || def.type === "ext-apps") {
    // Pinned view default: { type: "ext-apps", id: connectionId, toolName }.
    // Round-trip as the composite pinned-view tab id so the pinned-view
    // branch in MainPanelContent renders it without a metadata round-trip.
    if (def.id && def.toolName) {
      return formatPinnedViewTabId(def.id, def.toolName);
    }
    const declaredTabIds = metadata?.tabs?.map((t) => t.id) ?? [];
    if (def.id && declaredTabIds.includes(def.id))
      return coerceForGithub(def.id, hasActiveGithubRepo);
    return coerceForGithub(
      declaredTabIds[0] ?? "instructions",
      hasActiveGithubRepo,
    );
  }

  return coerceForGithub(
    metadata?.tabs?.[0]?.id ?? "instructions",
    hasActiveGithubRepo,
  );
}

export function resolveActiveTabAndOpen(ctx: {
  mainParam: string | undefined;
  metadata: EntityLayoutMetadata | null;
  hasActiveGithubRepo?: boolean;
}): { mainOpen: boolean; activeTab: string } {
  const hasActiveGithubRepo = ctx.hasActiveGithubRepo ?? false;
  const def = resolveDefaultTabId(ctx.metadata, hasActiveGithubRepo);

  if (ctx.mainParam === "0") {
    return { mainOpen: false, activeTab: def };
  }
  if (ctx.mainParam === undefined) {
    // Mirror resolveDefaultPanelState: a chat-default (or absent default)
    // keeps the main panel closed so the header tab bar doesn't highlight
    // a tab while the panel is 0px wide.
    const view = ctx.metadata?.defaultMainView ?? null;
    const defaultIsChat = view == null || view.type === "chat";
    return { mainOpen: !defaultIsChat, activeTab: def };
  }
  // Coerce an explicit ?main=instructions to "git" in GitHub mode so
  // bookmarked URLs don't desync from the header tab bar.
  return {
    mainOpen: true,
    activeTab: coerceForGithub(ctx.mainParam, hasActiveGithubRepo),
  };
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

/**
 * The "Automations" header pill is active whenever the main panel is open
 * and the active tab is either the list (`automations`) or a detail
 * (`automation:<id>` / `automation:new`).
 */
export function isAutomationsPillActive(ctx: {
  activeTab: string;
  mainOpen: boolean;
}): boolean {
  if (!ctx.mainOpen) return false;
  if (ctx.activeTab === "automations") return true;
  return parseAutomationTabId(ctx.activeTab) !== null;
}

/**
 * Click target for the Automations pill.
 *
 * - On the list with the panel open → close (`"0"`).
 * - On a detail view → navigate up to the list (`"automations"`).
 * - Otherwise (panel closed or on a different tab) → open the list.
 */
export function resolveAutomationsPillClickTarget(ctx: {
  activeTab: string;
  mainOpen: boolean;
}): string {
  if (ctx.mainOpen && ctx.activeTab === "automations") return "0";
  return "automations";
}
