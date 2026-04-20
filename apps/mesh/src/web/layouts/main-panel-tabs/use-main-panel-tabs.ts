/**
 * Shared hook for the main-panel tab system.
 *
 * Assembles all tab sources (system + agent-declared + task-expanded +
 * ephemeral automation), resolves the active tab from the URL, and
 * returns a click-aware `setActiveTab` that implements tab-as-toggle
 * semantics via `resolveTabClickTarget`.
 *
 * Both the header tab bar and the main-panel content call this hook
 * independently; `useVirtualMCP` / `useSuspenseQuery` dedupe the reads.
 */

import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";
import { getActiveGithubRepo } from "@/web/lib/github-repo";
import type {
  ThreadExpandedTool,
  ThreadMetadata,
} from "../../../storage/types";
import {
  parseAutomationTabId,
  resolveActiveTabAndOpen,
  resolveTabClickTarget,
  type AutomationTabParsed,
} from "./tab-id";

export type AgentTabDef = {
  id: string;
  title: string;
  view: {
    type: "ext-app";
    appId: string;
    args?: Record<string, unknown>;
  };
};

export interface MainPanelTabs {
  activeTab: string;
  mainOpen: boolean;
  setActiveTab: (id: string) => void;
  systemTabs: Array<{ id: string; title: string }>;
  layoutTabs: AgentTabDef[];
  expandedTools: ThreadExpandedTool[];
  automationTabParsed: AutomationTabParsed | null;
}

function useTaskMetadata(taskId: string): ThreadMetadata | null {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const { data } = useSuspenseQuery({
    queryKey: KEYS.threadMetadata(taskId),
    queryFn: async () => {
      if (!client || !taskId) return null;
      try {
        const result = (await client.callTool({
          name: "COLLECTION_THREADS_GET",
          arguments: { id: taskId },
        })) as { structuredContent?: unknown };
        const payload = (result.structuredContent ?? result) as {
          item?: { metadata?: ThreadMetadata } | null;
        };
        return payload.item?.metadata ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
  });
  return data;
}

export function useMainPanelTabs(ctx: {
  virtualMcpId: string;
  taskId: string;
}): MainPanelTabs {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { main?: string };
  const entity = useVirtualMCP(ctx.virtualMcpId);
  const metadata = useTaskMetadata(ctx.taskId);

  const entityLayout =
    (
      entity?.metadata as {
        ui?: {
          layout?: {
            tabs?: AgentTabDef[];
            defaultMainView?: { type: string; id?: string } | null;
          };
        };
      } | null
    )?.ui?.layout ?? null;

  const layoutTabs = (entityLayout?.tabs ?? []) as AgentTabDef[];
  const expandedTools: ThreadExpandedTool[] = metadata?.expanded_tools ?? [];
  const hasActiveGithubRepo = !!(entity && getActiveGithubRepo(entity));

  const { activeTab, mainOpen } = resolveActiveTabAndOpen({
    mainParam: search.main,
    metadata: entityLayout
      ? {
          defaultMainView: entityLayout.defaultMainView ?? null,
          tabs: layoutTabs.map((t) => ({ id: t.id })),
        }
      : null,
  });

  const automationTabParsed = parseAutomationTabId(activeTab);

  const systemTabs: Array<{ id: string; title: string }> = [
    { id: "instructions", title: "Instructions" },
    { id: "connections", title: "Connections" },
    { id: "automations", title: "Automations" },
    { id: "layout", title: "Layout" },
  ];
  if (hasActiveGithubRepo) {
    systemTabs.push({ id: "env", title: "Terminal" });
    systemTabs.push({ id: "preview", title: "Preview" });
  }

  const setActiveTab = (id: string) => {
    const target = resolveTabClickTarget({
      clickedId: id,
      activeTab,
      mainOpen,
    });
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, main: target }),
      replace: true,
    });
  };

  return {
    activeTab,
    mainOpen,
    setActiveTab,
    systemTabs,
    layoutTabs,
    expandedTools,
    automationTabParsed,
  };
}
