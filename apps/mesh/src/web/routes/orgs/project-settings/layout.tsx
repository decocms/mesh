import { VirtualMcpDetailView } from "@/web/views/virtual-mcp";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { Loading01 } from "@untitledui/icons";
import { useParams } from "@tanstack/react-router";
import { Suspense } from "react";

function ProjectSettingsContent() {
  const { virtualMcpId } = useParams({
    from: "/shell/$org/agents/$virtualMcpId/settings",
  });
  return <VirtualMcpDetailView virtualMcpId={virtualMcpId} />;
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
