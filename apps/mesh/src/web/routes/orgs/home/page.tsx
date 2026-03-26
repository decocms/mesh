/**
 * Organization Home Page
 *
 * Main content panel for the org home route. Chat lives in the sidebar panel
 * (ChatPanel), so this page renders the decopilot detail/settings view
 * (same pattern as AgentHomePage).
 *
 * When ?view=settings is set, renders project settings instead.
 */

import { ErrorBoundary } from "@/web/components/error-boundary";
import { AutomationInlineDetail } from "@/web/views/automations/automations-tab";
import { Loading01 } from "@untitledui/icons";
import {
  getWellKnownDecopilotVirtualMCP,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useMatch, useNavigate, useSearch } from "@tanstack/react-router";
import { Suspense } from "react";
import { VirtualMcpDetailView } from "@/web/views/virtual-mcp";

function OrgHomeContent() {
  const { org } = useProjectContext();
  const decopilotId = getWellKnownDecopilotVirtualMCP(org.id).id;
  return <VirtualMcpDetailView key={decopilotId} virtualMcpId={decopilotId} />;
}

function ProjectSettingsContent() {
  const agentsMatch = useMatch({
    from: "/shell/$org/agents/$virtualMcpId",
    shouldThrow: false,
  });
  const virtualMcpId = agentsMatch?.params.virtualMcpId ?? "";
  return (
    <VirtualMcpDetailView key={virtualMcpId} virtualMcpId={virtualMcpId} />
  );
}

function AutomationDetailContent({ automationId }: { automationId: string }) {
  const navigate = useNavigate();
  return (
    <AutomationInlineDetail
      automationId={automationId}
      onBack={() =>
        navigate({
          search: { main: undefined, automationId: undefined } as never,
          replace: true,
        })
      }
    />
  );
}

export default function OrgHomePage() {
  const { view, main, automationId } = useSearch({ strict: false }) as {
    view?: string;
    main?: string;
    automationId?: string;
  };

  console.log("[OrgHomePage]", {
    view,
    main,
    automationId,
    currentUrl: window.location.href,
  });

  if (main === "automation" && automationId) {
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
          <AutomationDetailContent automationId={automationId} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === "settings") {
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
          <ProjectSettingsContent />
        </Suspense>
      </ErrorBoundary>
    );
  }

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
        <OrgHomeContent />
      </Suspense>
    </ErrorBoundary>
  );
}
