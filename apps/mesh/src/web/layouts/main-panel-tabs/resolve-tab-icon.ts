import type { ComponentType, SVGProps } from "react";
import {
  BookOpen01,
  Dataflow03,
  Globe01,
  LayoutAlt04,
  Lightning01,
  Terminal,
} from "@untitledui/icons";

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export type TabKind = "system" | "agent" | "expanded";

export type TabIcon =
  | { kind: "component"; Component: IconComponent }
  | { kind: "url"; src: string }
  | { kind: "fallback" };

export type SystemTabId =
  | "instructions"
  | "connections"
  | "automations"
  | "layout"
  | "env"
  | "preview";

export const SYSTEM_TAB_ICONS: Record<SystemTabId, IconComponent> = {
  instructions: BookOpen01,
  connections: Dataflow03,
  automations: Lightning01,
  layout: LayoutAlt04,
  env: Terminal,
  preview: Globe01,
};

type ConnectionLike = { id: string; icon: string | null };

/**
 * Compute the `TabIcon` for a tab.
 *
 * - system: look up the hardcoded mapping from tabId.
 * - agent / expanded: look up the connection by appId; if it has a
 *   non-empty `icon` URL, return { kind: "url" }; else fall back.
 */
export function resolveTabIcon(args: {
  tabId: string;
  kind: TabKind;
  appId?: string;
  connections: ConnectionLike[];
}): TabIcon {
  if (args.kind === "system") {
    const Component = SYSTEM_TAB_ICONS[args.tabId as SystemTabId];
    return { kind: "component", Component };
  }

  if (!args.appId) return { kind: "fallback" };
  const conn = args.connections.find((c) => c.id === args.appId);
  if (!conn) return { kind: "fallback" };
  if (typeof conn.icon === "string" && conn.icon.length > 0) {
    return { kind: "url", src: conn.icon };
  }
  return { kind: "fallback" };
}
