/**
 * VirtualMCPProvider — Unified provider for agent routes.
 *
 * Combines:
 * 1. Entity fetch (useVirtualMCP) — Suspense-based
 * 2. ProjectContextProvider override (agent-scoped, isOrgAdmin: false)
 * 3. AgentContext (URL-driven mainView, navigateToMain, navigateToTask)
 *
 * Rendered conditionally in ShellLayoutInner — only on agent routes.
 * Chat.Provider sits ABOVE this provider and receives virtualMcpId directly.
 */

import { Suspense, type ReactNode } from "react";
import { useNavigate, useSearch, useMatch } from "@tanstack/react-router";
import {
  ProjectContextProvider,
  useProjectContext,
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import { SplashScreen } from "@/web/components/splash-screen";
import { EmptyState } from "@/web/components/empty-state";
import { AlertCircle } from "@untitledui/icons";
import { mapVirtualMcpToProject } from "@/web/lib/map-virtual-mcp-to-project";
import {
  AgentContext,
  type MainView,
  type AgentContextValue,
} from "@/web/contexts/agent-context";

// ---------------------------------------------------------------------------
// Inner content (uses Suspense-based useVirtualMCP)
// ---------------------------------------------------------------------------

function VirtualMCPProviderContent({
  virtualMcpId,
  children,
}: {
  virtualMcpId: string;
  children: ReactNode;
}) {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  const agentsMatch = useMatch({
    from: "/shell/$org/$virtualMcpId",
    shouldThrow: false,
  });

  const orgSlug = agentsMatch?.params.org ?? "";

  // Fetch entity (Suspense-based — resolved before render)
  const entity = useVirtualMCP(virtualMcpId);

  // Not found
  if (!entity) {
    return (
      <div className="flex-1 min-h-0 pr-1.5 pb-1.5 overflow-hidden">
        <div className="flex flex-col h-full bg-card overflow-hidden border border-sidebar-border shadow-sm rounded-[0.75rem]">
          <EmptyState
            image={<AlertCircle size={48} className="text-muted-foreground" />}
            title="Agent not found"
            description={`The agent "${virtualMcpId}" does not exist in this organization.`}
            actions={
              <Button
                variant="outline"
                onClick={() =>
                  navigate({
                    to: "/$org",
                    params: { org: orgSlug },
                  })
                }
              >
                Go to organization home
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  // Build project data from entity
  const projectData = mapVirtualMcpToProject(entity, org.id);

  // --- AgentContext: URL-driven state ---

  const search = useSearch({ from: "/shell/$org/$virtualMcpId/" }) as {
    main?: string;
    id?: string;
    automationId?: string;
    toolName?: string;
    taskId?: string;
  };

  // Derive mainView from URL search params
  let mainView: MainView;
  if (search.main === "settings") {
    mainView = { type: "settings" };
  } else if (search.main === "automation") {
    const id = search.automationId ?? search.id ?? "";
    mainView = id ? { type: "automation", id } : { type: "settings" };
  } else if (search.main === "ext-apps") {
    const id = search.id ?? "";
    mainView = id
      ? { type: "ext-apps", id, toolName: search.toolName }
      : { type: "settings" };
  } else {
    mainView = null;
  }

  const routeBase = "/$org/$virtualMcpId/" as const;
  const params = { org: orgSlug, virtualMcpId };

  const navigateToTask: AgentContextValue["navigateToTask"] = (taskId) => {
    navigate({
      to: routeBase,
      params,
      search: (prev: Record<string, unknown>) => ({ ...prev, taskId }),
    });
  };

  const navigateToMain: AgentContextValue["navigateToMain"] = (main, opts) => {
    if (main === "default") {
      navigate({
        to: routeBase,
        params,
        search: {} as never,
        replace: true,
      });
      return;
    }

    const searchParams: Record<string, string | undefined> = { main };
    if (opts?.id) searchParams.id = opts.id;
    if (opts?.toolName) searchParams.toolName = opts.toolName;
    if (main === "automation" && opts?.id) {
      searchParams.automationId = opts.id;
    }

    navigate({
      to: routeBase,
      params,
      search: searchParams as never,
      replace: true,
    });
  };

  const agentValue: AgentContextValue = {
    virtualMcpId,
    mainView,
    navigateToMain,
    navigateToTask,
  };

  return (
    <ProjectContextProvider org={org} project={projectData}>
      <AgentContext value={agentValue}>{children}</AgentContext>
    </ProjectContextProvider>
  );
}

// ---------------------------------------------------------------------------
// Public provider (with Suspense boundary)
// ---------------------------------------------------------------------------

export function VirtualMCPProvider({
  virtualMcpId,
  children,
}: {
  virtualMcpId: string;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<SplashScreen />}>
      <VirtualMCPProviderContent virtualMcpId={virtualMcpId}>
        {children}
      </VirtualMCPProviderContent>
    </Suspense>
  );
}
