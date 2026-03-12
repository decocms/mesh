import { Suspense, useState } from "react";
import { CpuChip01 } from "@untitledui/icons";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import {
  ProviderCard,
  type AiProvider,
} from "../settings-modal/pages/org-ai-providers";
import {
  useAiProviders,
  useAiProviderKeyList,
} from "@/web/hooks/collections/use-llm";
import { useAuthConfig } from "@/web/providers/auth-config-provider";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useQuery } from "@tanstack/react-query";
import { Check, Loading01 } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { toast } from "sonner";

function ProviderList() {
  const aiProviders = useAiProviders();
  const allKeys = useAiProviderKeyList();
  const providers: AiProvider[] = aiProviders?.providers ?? [];
  const isEven = providers.length % 2 === 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full [&>*:first-child]:sm:col-span-2">
      {providers.map((provider, index) => (
        <div
          key={provider.id}
          className={cn(
            isEven && index === providers.length - 1 && "sm:col-span-2",
          )}
        >
          <ProviderCard
            provider={provider}
            keys={allKeys.filter((k) => k.providerId === provider.id)}
          />
        </div>
      ))}
    </div>
  );
}

function ClaudeCodeCard() {
  const { org } = useProjectContext();
  const [connecting, setConnecting] = useState(false);

  const { data: status, refetch } = useQuery({
    queryKey: ["connect-studio-status", org.slug],
    queryFn: async () => {
      const res = await fetch(
        `/api/${org.slug}/decopilot/connect-studio/status`,
      );
      if (!res.ok) return { "claude-code": false };
      return res.json() as Promise<{ "claude-code": boolean }>;
    },
  });

  const connected = status?.["claude-code"] ?? false;

  const handleConnect = async () => {
    if (connected) return;
    setConnecting(true);
    try {
      const res = await fetch(`/api/${org.slug}/decopilot/connect-studio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "claude-code" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Failed to connect");
      }
      toast.success("Claude Code connected!");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card
      className={cn(
        "p-4 flex flex-col gap-3 transition-colors relative border-dashed",
        connected && "border-green-200 bg-green-50/50",
        !connected && !connecting && "cursor-pointer hover:bg-muted/30",
        connecting && "cursor-wait",
      )}
      onClick={handleConnect}
    >
      {connected && (
        <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-green-500" />
      )}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/logos/Claude Code.svg"
            alt="Claude Code"
            className="size-8 rounded-md object-contain"
            style={{
              filter:
                "brightness(0) saturate(100%) invert(55%) sepia(31%) saturate(1264%) hue-rotate(331deg) brightness(92%) contrast(86%)",
            }}
          />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-base">Claude Code</h3>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 font-medium"
              >
                Local
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-1">
              {connecting
                ? "Connecting..."
                : connected
                  ? "Connected — available in chat"
                  : "Uses your local Claude Code CLI installation"}
            </p>
          </div>
        </div>
        {connecting && (
          <Loading01
            size={16}
            className="animate-spin text-muted-foreground shrink-0 mt-1"
          />
        )}
        {connected && (
          <Check size={16} className="text-green-600 shrink-0 mt-1" />
        )}
      </div>
    </Card>
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
  const authConfig = useAuthConfig();
  const showClaudeCode = authConfig.claudeCodeAvailable;

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full [&>*:first-child]:sm:col-span-2">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        }
      >
        <ProviderList />
      </Suspense>
      {showClaudeCode && (
        <div className="w-full">
          <Suspense fallback={null}>
            <ClaudeCodeCard />
          </Suspense>
        </div>
      )}
    </div>
  );
}
