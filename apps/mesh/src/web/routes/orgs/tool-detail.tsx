import { StoredToolDetailsView } from "@/web/components/details/stored-tool";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useParams, useRouter } from "@tanstack/react-router";
import { Suspense } from "react";
import { Loading01 } from "@untitledui/icons";

export default function ToolDetailPage() {
  const router = useRouter();
  const params = useParams({ from: "/shell/$org/tools/$toolId" });
  const toolId = decodeURIComponent(params.toolId);

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
        <StoredToolDetailsView
          toolId={toolId}
          onBack={() => router.history.back()}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
