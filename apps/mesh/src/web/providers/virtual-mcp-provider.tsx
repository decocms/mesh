/**
 * VirtualMCPProvider — Unified provider for space routes.
 *
 * Combines:
 * 1. Entity fetch (useVirtualMCP) — Suspense-based
 * 2. ProjectContextProvider override (space-scoped, isOrgAdmin: false)
 * 3. SpaceContext (URL-driven mainView, navigateToMain, navigateToTask)
 *
 * Rendered conditionally in ShellLayoutInner — only on space routes.
 * Chat.Provider sits ABOVE this provider and receives virtualMcpId directly.
 */

import { Suspense, useEffect, type ReactNode } from "react";
import { useNavigate, useSearch, useMatch } from "@tanstack/react-router";
import {
  ProjectContextProvider,
  useProjectContext,
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import { SplashScreen } from "@/web/components/splash-screen";
import { chatStore } from "@/web/components/chat/store/chat-store";
import { mapVirtualMcpToProject } from "@/web/lib/map-virtual-mcp-to-project";
import {
  SpaceContext,
  type MainView,
  type SpaceContextValue,
} from "@/web/contexts/space-context";

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

  const spacesMatch = useMatch({
    from: "/shell/$org/spaces/$virtualMcpId",
    shouldThrow: false,
  });

  const orgSlug = spacesMatch?.params.org ?? "";

  // Fetch entity (Suspense-based — resolved before render)
  const entity = useVirtualMCP(virtualMcpId);

  // Not found
  if (!entity) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <h1 className="text-xl font-semibold">Space not found</h1>
        <p className="text-muted-foreground text-center">
          The space &quot;{virtualMcpId}&quot; does not exist in this
          organization.
        </p>
        <Button
          variant="link"
          onClick={() =>
            navigate({
              to: "/$org",
              params: { org: orgSlug },
            })
          }
        >
          Go to organization home
        </Button>
      </div>
    );
  }

  // Build project data from entity
  const projectData = mapVirtualMcpToProject(entity, org.id);

  // --- SpaceContext: URL-driven state ---

  const search = useSearch({ strict: false }) as {
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

  const routeBase = "/$org/spaces/$virtualMcpId/" as const;
  const params = { org: orgSlug, virtualMcpId };

  // Sync taskId from URL → chat store
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (search.taskId) {
      chatStore.setActiveThread(search.taskId);
    }
  }, [search.taskId]);

  const navigateToTask: SpaceContextValue["navigateToTask"] = (taskId) => {
    navigate({
      to: routeBase,
      params,
      search: (prev: Record<string, unknown>) => ({ ...prev, taskId }),
    });
  };

  const navigateToMain: SpaceContextValue["navigateToMain"] = (main, opts) => {
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

  const spaceValue: SpaceContextValue = {
    virtualMcpId,
    mainView,
    navigateToMain,
    navigateToTask,
  };

  return (
    <ProjectContextProvider org={org} project={projectData}>
      <SpaceContext value={spaceValue}>{children}</SpaceContext>
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
