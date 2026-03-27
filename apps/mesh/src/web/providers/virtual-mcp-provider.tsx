/**
 * VirtualMCPProvider — Unified provider for agent routes.
 *
 * Combines:
 * 1. Entity fetch (useVirtualMCP) — Suspense-based
 * 2. ProjectContextProvider override (agent-scoped)
 * 3. VirtualMCPContext (URL-driven mainView, openMainView, openTask)
 *
 * Rendered conditionally in ShellLayoutInner — only on agent routes.
 * Chat.Provider sits ABOVE this provider and receives virtualMcpId directly.
 */

import type { ReactNode } from "react";
import { useNavigate, useSearch, useMatch } from "@tanstack/react-router";
import { useVirtualMCP } from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "@/web/components/empty-state";
import { AlertCircle } from "@untitledui/icons";
import {
  VirtualMCPContext,
  type MainView,
  type VirtualMCPContextValue,
} from "@/web/contexts/virtual-mcp-context";

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

  // --- VirtualMCPContext: URL-driven state ---

  const search = useSearch({ from: "/shell/$org/$virtualMcpId/" }) as {
    main?: string;
    id?: string;
    toolName?: string;
    taskId?: string;
  };

  // Derive mainView from URL search params
  let mainView: MainView;
  if (search.main === "settings") {
    mainView = { type: "settings" };
  } else if (search.main === "automation") {
    const id = search.id ?? "";
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

  const openTask: VirtualMCPContextValue["openTask"] = (taskId) => {
    navigate({
      to: routeBase,
      params,
      search: (prev: Record<string, unknown>) => ({ ...prev, taskId }),
    });
  };

  const openMainView: VirtualMCPContextValue["openMainView"] = (main, opts) => {
    if (main === "default") {
      navigate({
        to: routeBase,
        params,
        search: (prev: Record<string, unknown>) => {
          // Preserve taskId when resetting main view
          return prev.taskId ? { taskId: prev.taskId } : {};
        },
        replace: true,
      });
      return;
    }

    navigate({
      to: routeBase,
      params,
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { main };
        if (opts?.id) next.id = opts.id;
        if (opts?.toolName) next.toolName = opts.toolName;
        // Preserve taskId so switching main view doesn't reset the active thread
        if (prev.taskId) next.taskId = prev.taskId;
        return next;
      },
      replace: true,
    });
  };

  const virtualMcpContextValue: VirtualMCPContextValue = {
    virtualMcpId,
    mainView,
    openMainView,
    openTask,
  };

  return (
    <VirtualMCPContext value={virtualMcpContextValue}>
      {children}
    </VirtualMCPContext>
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
    <VirtualMCPProviderContent virtualMcpId={virtualMcpId}>
      {children}
    </VirtualMCPProviderContent>
  );
}
