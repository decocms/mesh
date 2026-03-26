import { VirtualMcpDetailView } from "@/web/views/virtual-mcp";
import { AutomationInlineDetail } from "@/web/views/automations/automations-tab";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { Loading01 } from "@untitledui/icons";
import { Suspense, lazy } from "react";
import {
  useSpaceContext,
  type MainView,
  type MainViewType,
} from "@/web/contexts/space-context";
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
  const { virtualMcpId, mainView } = useSpaceContext();

  // URL specified an explicit view — use it
  if (mainView !== null) return mainView;

  // Resolve default from entity layout config
  const entity = useVirtualMCP(virtualMcpId);
  const layoutConfig = (
    entity?.metadata?.ui as Record<string, unknown> | null | undefined
  )?.layout as {
    defaultMainView?: { type: MainViewType; id?: string; toolName?: string };
  } | null;

  const def = layoutConfig?.defaultMainView;
  if (!def) return { type: "settings" };

  switch (def.type) {
    case "automation":
      return def.id ? { type: "automation", id: def.id } : { type: "settings" };
    case "ext-apps":
      return def.id
        ? { type: "ext-apps", id: def.id, toolName: def.toolName }
        : { type: "settings" };
    case "settings":
    default:
      return { type: "settings" };
  }
}

function SpaceHomeContent() {
  const { virtualMcpId } = useSpaceContext();
  const resolved = useResolvedMainView();

  if (resolved.type === "automation") {
    return <AutomationInlineDetail automationId={resolved.id} />;
  }

  if (resolved.type === "ext-apps") {
    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading app...</span>
            </div>
          </div>
        }
      >
        <ProjectAppViewContent
          connectionId={resolved.id}
          toolName={resolved.toolName ?? ""}
        />
      </Suspense>
    );
  }

  // Default: settings
  return (
    <VirtualMcpDetailView key={virtualMcpId} virtualMcpId={virtualMcpId} />
  );
}

export default function SpaceHomePage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <SpaceHomeContent />
      </Suspense>
    </ErrorBoundary>
  );
}
