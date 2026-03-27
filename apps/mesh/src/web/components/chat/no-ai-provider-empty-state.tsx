import { Suspense } from "react";
import { CpuChip01 } from "@untitledui/icons";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import {
  ProviderCard,
  type AiProvider,
} from "@/web/views/settings/org-ai-providers";
import {
  useAiProviders,
  useAiProviderKeys,
} from "@/web/hooks/collections/use-ai-providers";
import { cn } from "@deco/ui/lib/utils.ts";

function ProviderList() {
  const aiProviders = useAiProviders();
  const allKeys = useAiProviderKeys();
  const providers: AiProvider[] = aiProviders?.providers ?? [];
  const isEven = providers.length % 2 === 0;

  return (
    <div className="@container w-full">
      <div className="grid grid-cols-1 @lg:grid-cols-2 gap-4 w-full">
        {providers.map((provider, index) => (
          <div
            key={provider.id}
            className={cn(
              isEven && index === providers.length - 1 && "@lg:col-span-2",
            )}
          >
            <ProviderCard
              provider={provider}
              keys={allKeys.filter((k) => k.providerId === provider.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface NoAiProviderEmptyStateProps {
  title?: string;
  description?: string;
}

export function NoAiProviderEmptyState({
  title = "Connect an AI provider",
  description = "Keys are stored encrypted in the vault.",
}: NoAiProviderEmptyStateProps = {}) {
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center justify-center size-14 rounded-2xl bg-muted border border-border/60">
          <CpuChip01 size={24} className="text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="@container w-full">
            <div className="grid grid-cols-1 @lg:grid-cols-2 gap-4 w-full">
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          </div>
        }
      >
        <ProviderList />
      </Suspense>
    </div>
  );
}
