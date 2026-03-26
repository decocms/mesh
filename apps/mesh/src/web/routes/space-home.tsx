import { VirtualMcpDetailView } from "@/web/views/virtual-mcp";
import { AutomationInlineDetail } from "@/web/views/automations/automations-tab";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { Loading01 } from "@untitledui/icons";
import { useMatch, useNavigate, useSearch } from "@tanstack/react-router";
import { Suspense } from "react";

function SpaceHomeContent() {
  const spacesMatch = useMatch({
    from: "/shell/$org/spaces/$virtualMcpId/",
    shouldThrow: false,
  });
  const projectsMatch = useMatch({
    from: "/shell/$org/projects/$virtualMcpId/",
    shouldThrow: false,
  });
  const virtualMcpId =
    (spacesMatch ?? projectsMatch)?.params.virtualMcpId ?? "";
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    main?: string;
    automationId?: string;
  };

  if (search.main === "automation" && search.automationId) {
    return (
      <AutomationInlineDetail
        automationId={search.automationId}
        onBack={() =>
          navigate({
            search: { main: undefined, automationId: undefined } as never,
            replace: true,
          })
        }
      />
    );
  }

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
