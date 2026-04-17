/**
 * MainPanelWithTabs — right-panel container with a tab bar.
 *
 * Tabs come from three sources:
 *   1. "Main" — the default tab, renders the current route Outlet
 *      (settings page, automation detail, ext-app, workflows, plugins).
 *   2. Agent-declared tabs from `virtualMcp.metadata.ui.layout.tabs`.
 *   3. Task-scoped expanded tools from `task.metadata.expanded_tools`.
 *
 * Active tab is URL-driven via `?tab=<id>`. When unset, the first tab
 * (always "main") is active.
 */

import { Suspense, lazy } from "react";
import { Outlet, useNavigate, useSearch } from "@tanstack/react-router";
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
import { resolveDefaultTabId } from "./tab-id";

const AppViewContent = lazy(() =>
  import("@/web/routes/project-app-view").then((m) => ({
    default: m.AppViewContent,
  })),
);

const MAIN_TAB_ID = "main";

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
  const search = useSearch({ strict: false }) as { tab?: string };
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
              toolName?: string;
            } | null;
            chatDefaultOpen?: boolean | null;
          };
        };
      } | null
    )?.ui?.layout ?? null;

  const layoutTabs = (entityLayout?.tabs ?? []) as AgentTabDef[];
  const expandedTools: ThreadExpandedTool[] = metadata?.expanded_tools ?? [];

  const defaultTabId =
    resolveDefaultTabId(
      entityLayout
        ? {
            defaultMainView: entityLayout.defaultMainView ?? null,
            chatDefaultOpen: entityLayout.chatDefaultOpen ?? null,
            tabs: layoutTabs.map((t) => ({ id: t.id })),
          }
        : null,
    ) ?? MAIN_TAB_ID;

  const activeTab = search.tab ?? defaultTabId;

  const setActiveTab = (id: string) => {
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        tab: id === MAIN_TAB_ID ? undefined : id,
      }),
      replace: true,
    });
  };

  const renderActive = () => {
    if (activeTab === MAIN_TAB_ID) {
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
          <div className="flex flex-1 items-center overflow-hidden h-full">
            <Outlet />
          </div>
        </Suspense>
      );
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

  const hasExtraTabs = layoutTabs.length > 0 || expandedTools.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {hasExtraTabs && (
        <div className="shrink-0 flex items-center gap-1 border-b border-border px-2 h-9 overflow-x-auto">
          <TabButton
            id={MAIN_TAB_ID}
            title="Main"
            active={activeTab === MAIN_TAB_ID}
            onClick={() => setActiveTab(MAIN_TAB_ID)}
          />
          {layoutTabs.map((t) => (
            <TabButton
              key={t.id}
              id={t.id}
              title={t.title}
              active={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
            />
          ))}
          {expandedTools.map((t) => (
            <TabButton
              key={t.toolName}
              id={t.toolName}
              title={t.toolName}
              active={activeTab === t.toolName}
              onClick={() => setActiveTab(t.toolName)}
            />
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">{renderActive()}</div>
    </div>
  );
}

function TabButton({
  title,
  active,
  onClick,
}: {
  id: string;
  title: string;
  active: boolean;
  onClick: () => void;
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
      )}
    >
      {title}
    </button>
  );
}
