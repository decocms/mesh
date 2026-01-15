import { StoredPromptDetailsView } from "@/web/components/details/stored-prompt";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useParams, useRouter } from "@tanstack/react-router";
import { Suspense } from "react";
import { Loading01 } from "@untitledui/icons";

export default function PromptDetailPage() {
  const router = useRouter();
  const params = useParams({ from: "/shell/$org/prompts/$promptId" });
  const promptId = decodeURIComponent(params.promptId);

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
        <StoredPromptDetailsView
          promptId={promptId}
          onBack={() => router.history.back()}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
