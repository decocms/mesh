import { VirtualMcpDetailView } from "@/web/components/details/virtual-mcp";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { Loading01 } from "@untitledui/icons";
import { useMatch } from "@tanstack/react-router";
import { Suspense } from "react";

function ProjectSettingsContent() {
  // Support both /spaces/$virtualMcpId/settings and /projects/$virtualMcpId/settings
  const spacesMatch = useMatch({
    from: "/shell/$org/spaces/$virtualMcpId/settings",
    shouldThrow: false,
  });
  const projectsMatch = useMatch({
    from: "/shell/$org/projects/$virtualMcpId/settings",
    shouldThrow: false,
  });
  const virtualMcpId =
    (spacesMatch ?? projectsMatch)?.params.virtualMcpId ?? "";
  return (
    <VirtualMcpDetailView
      key={virtualMcpId}
      virtualMcpId={virtualMcpId}
      variant="project"
    />
  );
}

export default function ProjectSettingsLayout() {
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
