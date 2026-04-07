import { VirtualMcpDetailView } from "@/web/views/virtual-mcp";
import { AutomationInlineDetail } from "@/web/views/automations/automations-tab";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { lazy } from "react";
import {
  useVirtualMCPContext,
  useVirtualMCPURLContext,
  type MainView,
  type MainViewType,
} from "@/web/contexts/virtual-mcp-context";
import { useVirtualMCP } from "@decocms/mesh-sdk";

const ProjectAppViewContent = lazy(() =>
  import("./project-app-view").then((m) => ({
    default: m.AppViewContent,
  })),
);

/**
 * Resolve the effective main view: if the URL specifies one, use it;
 * otherwise fall back to the entity's layout config, then to settings.
 */
function useResolvedMainView(): MainView & {} {
  const { virtualMcpId, mainView } = useVirtualMCPContext();
  const entity = useVirtualMCP(virtualMcpId);

  // URL specified an explicit view — use it
  if (mainView !== null) return mainView;

  // Resolve default from entity layout config
  const layoutConfig = (
    entity?.metadata?.ui as Record<string, unknown> | null | undefined
  )?.layout as {
    defaultMainView?: { type: MainViewType; id?: string; toolName?: string };
  } | null;

  const def = layoutConfig?.defaultMainView;
  if (!def) return { type: "chat" };

  switch (def.type) {
    case "chat":
      return { type: "chat" };
    case "automation":
      return def.id ? { type: "automation", id: def.id } : { type: "chat" };
    case "ext-apps":
      return def.id
        ? { type: "ext-apps", id: def.id, toolName: def.toolName }
        : { type: "chat" };
    case "settings":
      return { type: "settings" };
    default:
      return { type: "chat" };
  }
}

function AgentHomeContent() {
  const { virtualMcpId } = useVirtualMCPContext();
  const resolved = useResolvedMainView();

  if (resolved.type === "chat") {
    return null;
  }

  if (resolved.type === "automation") {
    return <AutomationInlineDetail automationId={resolved.id} />;
  }

  if (resolved.type === "ext-apps") {
    return (
      <ProjectAppViewContent
        connectionId={resolved.id}
        toolName={resolved.toolName ?? ""}
      />
    );
  }

  // settings
  return (
    <VirtualMcpDetailView key={virtualMcpId} virtualMcpId={virtualMcpId} />
  );
}

function mainViewKey(view: MainView): string {
  if (!view) return "default";
  switch (view.type) {
    case "chat":
      return "chat";
    case "settings":
      return "settings";
    case "automation":
      return `automation:${view.id}`;
    case "ext-apps":
      return `ext-apps:${view.id}:${view.toolName ?? ""}`;
  }
}

export default function AgentHomePage() {
  const ctx = useVirtualMCPURLContext();
  if (!ctx) return null;
  const { virtualMcpId, mainView } = ctx;
  return (
    <ErrorBoundary key={`${virtualMcpId}:${mainViewKey(mainView)}`}>
      <AgentHomeContent />
    </ErrorBoundary>
  );
}
