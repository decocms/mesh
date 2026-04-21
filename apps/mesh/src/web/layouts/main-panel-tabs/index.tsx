/**
 * MainPanelContent — renders the active main-panel tab's body.
 *
 * The tab bar itself lives in the agent-shell header; see
 * `main-panel-tabs-bar.tsx`. Both components consume the same state
 * via `useMainPanelTabs`.
 *
 * Tab sources and grammar are documented in `tab-id.ts`.
 */

import { Suspense, lazy } from "react";
import { Loading01 } from "@untitledui/icons";
import { useMainPanelTabs } from "./use-main-panel-tabs";
import { InstructionsTab } from "./instructions-tab";
import { ConnectionsTab } from "./connections-tab";
import { LayoutTab } from "./layout-tab";
import { PreviewTab } from "./preview-tab";
import { EnvTab } from "./env-tab";
import { AutomationTab } from "./automation-tab";
import { AutomationsListTab } from "./automations-list-tab";
import { parsePinnedViewTabId } from "./tab-id";

const AppViewContent = lazy(() =>
  import("@/web/routes/project-app-view").then((m) => ({
    default: m.AppViewContent,
  })),
);

export function MainPanelContent({
  taskId,
  virtualMcpId,
}: {
  taskId: string;
  virtualMcpId: string;
}) {
  const { activeTab, layoutTabs, automationTabParsed } = useMainPanelTabs({
    virtualMcpId,
    taskId,
  });

  if (activeTab === "instructions") {
    return <InstructionsTab virtualMcpId={virtualMcpId} />;
  }
  if (activeTab === "connections") {
    return <ConnectionsTab virtualMcpId={virtualMcpId} />;
  }
  if (activeTab === "automations") {
    return <AutomationsListTab virtualMcpId={virtualMcpId} />;
  }
  if (activeTab === "layout") {
    return <LayoutTab virtualMcpId={virtualMcpId} />;
  }
  if (activeTab === "env") {
    return <EnvTab virtualMcpId={virtualMcpId} />;
  }
  if (activeTab === "preview") {
    return <PreviewTab virtualMcpId={virtualMcpId} />;
  }
  if (automationTabParsed) {
    return <AutomationTab tabId={activeTab} virtualMcpId={virtualMcpId} />;
  }

  const pinnedView = parsePinnedViewTabId(activeTab);
  if (pinnedView) {
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
          connectionId={pinnedView.connectionId}
          toolName={pinnedView.toolName}
        />
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

  return <InstructionsTab virtualMcpId={virtualMcpId} />;
}
