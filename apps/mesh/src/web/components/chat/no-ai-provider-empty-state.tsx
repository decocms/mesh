import { Suspense } from "react";
import { Zap } from "@untitledui/icons";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { ProviderCardGrid } from "@/web/views/settings/org-ai-providers";
import { useProjectContext } from "@decocms/mesh-sdk";

interface NoAiProviderEmptyStateProps {
  title?: string;
  description?: string;
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
  const subtitle =
    description ??
    (orgName
      ? "Choose how to power your AI team."
      : "Connect an AI provider to get started.");

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-lime-100 to-yellow-50 dark:from-lime-900/30 dark:to-yellow-900/20 border border-lime-300/40 dark:border-lime-700/30">
          <Zap size={24} className="text-lime-600 dark:text-lime-400" />
        </div>
        <div className="space-y-2">
          <p className="text-xl font-semibold text-foreground tracking-tight">
            {heading}
          </p>
          <p className="text-sm text-muted-foreground max-w-md">{subtitle}</p>
        </div>
      </div>
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
  );
}
