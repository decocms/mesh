/**
 * MainPanelWithTabs — right-panel container with a tab bar.
 *
 * Tab sources (left to right):
 *   1. Fixed system tabs: Instructions, Connections, Layout, Preview
 *      (Preview only shown when the virtualMCP has an active GitHub repo.)
 *   2. Agent-declared tabs from `virtualMcp.metadata.ui.layout.tabs`.
 *   3. Task-scoped expanded tools from `task.metadata.expanded_tools`.
 *   4. Ephemeral automation tab (only when `?main=automation:<id>` is active).
 *
 * Active tab is URL-driven via `?main=<tabId>`. `?main=0` closes the panel.
 * Absent `?main` falls back to the agent's `defaultMainView` or "instructions".
 */

import { Suspense, lazy } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { cn } from "@deco/ui/lib/utils.js";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import { useSuspenseQuery } from "@tanstack/react-query";
import { KEYS } from "@/web/lib/query-keys";
import { Loading01 } from "@untitledui/icons";
import type {
  ThreadExpandedTool,
  ThreadMetadata,
} from "../../../storage/types";
import { getActiveGithubRepo } from "@/web/lib/github-repo";
import { parseAutomationTabId, resolveActiveTabAndOpen } from "./tab-id";
import { InstructionsTab } from "./instructions-tab";
import { ConnectionsTab } from "./connections-tab";
import { LayoutTab } from "./layout-tab";
import { PreviewTab } from "./preview-tab";
import { AutomationTab } from "./automation-tab";

const AppViewContent = lazy(() =>
  import("@/web/routes/project-app-view").then((m) => ({
    default: m.AppViewContent,
  })),
);

type AgentTabDef = {
  id: string;
  title: string;
  view: {
    type: "ext-app";
    appId: string;
    args?: Record<string, unknown>;
  };
};

function useTaskMetadata(taskId: string) {
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

export function MainPanelWithTabs({
  taskId,
  virtualMcpId,
}: {
  taskId: string;
  virtualMcpId: string;
}) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { main?: string };
  const entity = useVirtualMCP(virtualMcpId);
  const metadata = useTaskMetadata(taskId);

  const entityLayout =
    (
      entity?.metadata as {
        ui?: {
          layout?: {
            tabs?: AgentTabDef[];
            defaultMainView?: {
              type: string;
              id?: string;
            } | null;
          };
        };
      } | null
    )?.ui?.layout ?? null;

  const layoutTabs = (entityLayout?.tabs ?? []) as AgentTabDef[];
  const expandedTools: ThreadExpandedTool[] = metadata?.expanded_tools ?? [];
  const hasActiveGithubRepo = !!(entity && getActiveGithubRepo(entity));

  const { activeTab } = resolveActiveTabAndOpen({
    mainParam: search.main,
    metadata: entityLayout
      ? {
          defaultMainView: entityLayout.defaultMainView ?? null,
          tabs: layoutTabs.map((t) => ({ id: t.id })),
        }
      : null,
  });

  const setActiveTab = (id: string) => {
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, main: id }),
      replace: true,
    });
  };

  const automationTabParsed = parseAutomationTabId(activeTab);

  const systemTabs: Array<{ id: string; title: string }> = [
    { id: "instructions", title: "Instructions" },
    { id: "connections", title: "Connections" },
    { id: "layout", title: "Layout" },
  ];
  if (hasActiveGithubRepo) {
    systemTabs.push({ id: "preview", title: "Preview" });
  }

  const renderActive = () => {
    if (activeTab === "instructions") {
      return <InstructionsTab virtualMcpId={virtualMcpId} />;
    }
    if (activeTab === "connections") {
      return <ConnectionsTab virtualMcpId={virtualMcpId} />;
    }
    if (activeTab === "layout") {
      return <LayoutTab virtualMcpId={virtualMcpId} />;
    }
    if (activeTab === "preview") {
      return <PreviewTab virtualMcpId={virtualMcpId} />;
    }
    if (automationTabParsed) {
      return <AutomationTab tabId={activeTab} />;
    }

    const agentTab = layoutTabs.find((t) => t.id === activeTab);
    if (agentTab) {
      return (
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <Loading01
                size={20}
                className="animate-spin text-muted-foreground"
              />
            </div>
          }
        >
          <AppViewContent
            connectionId={agentTab.view.appId}
            toolName={agentTab.id}
          />
        </Suspense>
      );
    }

    const expanded = expandedTools.find((t) => t.toolName === activeTab);
    if (expanded) {
      return (
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <Loading01
                size={20}
                className="animate-spin text-muted-foreground"
              />
            </div>
          }
        >
          <AppViewContent
            connectionId={expanded.appId}
            toolName={expanded.toolName}
          />
        </Suspense>
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Tab not found
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center gap-1 border-b border-border px-2 h-9 overflow-x-auto">
        {systemTabs.map((t) => (
          <TabButton
            key={t.id}
            title={t.title}
            active={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
          />
        ))}
        {layoutTabs.map((t) => (
          <TabButton
            key={t.id}
            title={t.title}
            active={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
          />
        ))}
        {expandedTools.map((t) => (
          <TabButton
            key={t.toolName}
            title={t.toolName}
            active={activeTab === t.toolName}
            onClick={() => setActiveTab(t.toolName)}
          />
        ))}
        {automationTabParsed && (
          <TabButton
            title={
              automationTabParsed.kind === "new"
                ? "New automation"
                : `Automation`
            }
            active
            onClick={() => {
              /* already active */
            }}
            ephemeral
          />
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{renderActive()}</div>
    </div>
  );
}

function TabButton({
  title,
  active,
  onClick,
  ephemeral,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  ephemeral?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 h-7 px-2.5 rounded-md text-xs transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        ephemeral && "ml-auto italic",
      )}
    >
      {title}
    </button>
  );
}
