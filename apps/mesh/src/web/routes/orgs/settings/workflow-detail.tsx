import { useParams } from "@tanstack/react-router";
import { WorkflowDetails } from "@/web/components/details/workflow/index.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { Suspense } from "react";
import { Loading01 } from "@untitledui/icons";

export default function WorkflowDetailPage() {
  const { itemId } = useParams({
    from: "/shell/$org/settings/workflows/$itemId",
  });

  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <WorkflowDetails itemId={decodeURIComponent(itemId)} />
      </Suspense>
    </ErrorBoundary>
  );
}
