import { Suspense } from "react";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { ProviderCardGrid } from "@/web/views/settings/org-ai-providers";
import { useProjectContext } from "@decocms/mesh-sdk";

interface NoAiProviderEmptyStateProps {
  title?: string;
  description?: string;
}

function GemIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2L22 12L12 22L2 12L12 2Z"
        fill="url(#gem-gradient)"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.2"
      />
      <path d="M12 2L17 7H7L12 2Z" fill="rgba(255,255,255,0.3)" />
      <path d="M7 7H17L12 22L7 7Z" fill="url(#gem-gradient-2)" />
      <defs>
        <linearGradient id="gem-gradient" x1="12" y1="2" x2="12" y2="22">
          <stop stopColor="#86efac" />
          <stop offset="1" stopColor="#22c55e" />
        </linearGradient>
        <linearGradient id="gem-gradient-2" x1="12" y1="7" x2="12" y2="22">
          <stop stopColor="#4ade80" stopOpacity="0.6" />
          <stop offset="1" stopColor="#16a34a" stopOpacity="0.4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function NoAiProviderEmptyState({
  title,
  description,
}: NoAiProviderEmptyStateProps = {}) {
  const { org } = useProjectContext();
  const orgName = org.name;

  const heading =
    title ??
    (orgName
      ? `${orgName} is ready for agents`
      : "Your agents are almost ready");
  const subtitle = description ?? "Choose how to power your AI team.";

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <GemIcon />
        <div className="space-y-2">
          <p className="text-xl font-semibold text-foreground tracking-tight">
            {heading}
          </p>
          <p className="text-sm text-muted-foreground max-w-md">{subtitle}</p>
        </div>
      </div>

      <div className="w-full space-y-3">
        <p className="text-xs text-muted-foreground text-center">
          Local models + use your existing AI provider
        </p>
        <Suspense
          fallback={
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          }
        >
          <ProviderCardGrid />
        </Suspense>
      </div>
    </div>
  );
}
