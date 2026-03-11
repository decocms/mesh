import { Suspense } from "react";
import { CpuChip01 } from "@untitledui/icons";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import {
  ProviderCard,
  type AiProvider,
} from "../settings-modal/pages/org-ai-providers";
import {
  useAiProviders,
  useAiProviderKeyList,
} from "@/web/hooks/collections/use-llm";

function ProviderList() {
  const aiProviders = useAiProviders();
  const allKeys = useAiProviderKeyList();
  const providers: AiProvider[] = aiProviders?.providers ?? [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          keys={allKeys.filter((k) => k.providerId === provider.id)}
        />
      ))}
    </div>
  );
}

interface NoLlmBindingEmptyStateProps {
  title?: string;
  description?: string;
}

export function NoLlmBindingEmptyState({
  title = "Connect an AI provider",
  description = "Keys are stored encrypted in the vault.",
}: NoLlmBindingEmptyStateProps = {}) {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center justify-center size-10 rounded-xl bg-muted border border-border/60">
          <CpuChip01 size={18} className="text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        }
      >
        <ProviderList />
      </Suspense>
    </div>
  );
}
