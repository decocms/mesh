/**
 * Organization Home Page
 *
 * Main content panel for the org home route. Chat lives in the sidebar panel
 * (ChatPanel), so this page renders the decopilot detail/settings view
 * (same pattern as SpaceHomePage).
 *
 * When ?view=settings is set, renders project settings instead.
 */

import { ErrorBoundary } from "@/web/components/error-boundary";
import { Loading01 } from "@untitledui/icons";
import {
  getWellKnownDecopilotVirtualMCP,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useMatch, useSearch } from "@tanstack/react-router";
import { Suspense } from "react";
import { VirtualMcpDetailView } from "@/web/views/virtual-mcp";

function OrgHomeContent() {
  const { org } = useProjectContext();
  const decopilotId = getWellKnownDecopilotVirtualMCP(org.id).id;
  return <VirtualMcpDetailView key={decopilotId} virtualMcpId={decopilotId} />;
}

function ProjectSettingsContent() {
  const spacesMatch = useMatch({
    from: "/shell/$org/spaces/$virtualMcpId",
    shouldThrow: false,
  });
  const projectsMatch = useMatch({
    from: "/shell/$org/projects/$virtualMcpId",
    shouldThrow: false,
  });
  const virtualMcpId =
    (spacesMatch ?? projectsMatch)?.params.virtualMcpId ?? "";
  return (
    <VirtualMcpDetailView key={virtualMcpId} virtualMcpId={virtualMcpId} />
  );
}

export default function OrgHomePage() {
  const { view } = useSearch({ strict: false }) as { view?: string };
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
