import { Suspense, useState, useEffect } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Trash01,
  Key01,
  Eye,
  EyeOff,
  AlertCircle,
  RefreshCw01,
} from "@untitledui/icons";
import { Page } from "@/web/components/page";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@deco/ui/components/card.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deco/ui/components/toggle-group.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@deco/ui/components/dialog.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deco/ui/components/alert-dialog.tsx";
import {
  useAiProviders,
  useAiProviderKeys,
  useAiProviderModels,
  type AiProviderKey,
  type AiProviderModel,
} from "@/web/hooks/collections/use-ai-providers";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
  pickSimpleModeDefaults,
} from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";
import { cn } from "@deco/ui/lib/utils.ts";
import { ErrorBoundary } from "@/web/components/error-boundary";
import {
  useSimpleMode,
  useUpdateSimpleMode,
  type SimpleModeConfig,
} from "@/web/hooks/collections/use-ai-simple-mode";
import { ModelSelector } from "@/web/components/chat/select-model";

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="p-4 rounded-md bg-destructive/10 text-destructive flex items-center gap-2">
      <AlertCircle size={16} />
      <span className="text-sm font-medium">
        Failed to load AI providers: {error.message}
      </span>
    </div>
  );
}

function KeyList({
  keys,
  onDelete,
  isDeleting,
}: {
  keys: AiProviderKey[];
  onDelete: (keyId: string) => void;
  isDeleting: boolean;
}) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const targetKey = keys.find((k) => k.id === deleteTarget);

  return (
    <div className="flex flex-col gap-2 mt-4">
      {keys.map((key) => (
        <div
          key={key.id}
          className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <Key01 size={14} className="text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{key.label}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              added {formatDistanceToNow(new Date(key.createdAt))} ago
            </span>
          </div>
          {/* Stop propagation so trash click doesn't trigger card's onClick */}
          <div onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              disabled={isDeleting}
              onClick={() => setDeleteTarget(key.id)}
            >
              <Trash01 size={14} />
            </Button>
          </div>
        </div>
      ))}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {targetKey?.label}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  onDelete(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const apiKeyFormSchema = z.object({
  label: z.string().optional(),
  apiKey: z.string().min(1, "API key is required"),
});

type ApiKeyFormData = z.infer<typeof apiKeyFormSchema>;

function ConnectApiKeyForm({
  providerId,
  onCancel,
  onSuccess,
}: {
  providerId: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();
  const [showKey, setShowKey] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: { label: "", apiKey: "" },
  });

  const {
    mutate: createKey,
    isPending,
    error,
  } = useMutation({
    mutationFn: async (data: ApiKeyFormData) => {
      await client.callTool({
        name: "AI_PROVIDER_KEY_CREATE",
        arguments: {
          providerId,
          label: data.label || "Personal key",
          apiKey: data.apiKey,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviderKeys(org.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviders(org.id) });
      toast.success("Key saved successfully");
      onSuccess();
    },
    onError: (err) => {
      toast.error(`Failed to save key: ${err.message}`);
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => createKey(data))}
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Label
        </label>
        <Input
          placeholder="e.g. Personal key"
          {...register("label")}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          API Key
        </label>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            placeholder="sk-..."
            {...register("apiKey")}
            className="h-8 text-sm pr-8"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {errors.apiKey && (
          <p className="text-xs text-destructive">{errors.apiKey.message}</p>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error.message}</p>}

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Save Key"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const openaiCompatibleFormSchema = z.object({
  label: z.string().optional(),
  baseUrl: z.string().min(1, "Base URL is required"),
  apiKey: z.string().optional(),
});

type OpenAICompatibleFormData = z.infer<typeof openaiCompatibleFormSchema>;

function ConnectOpenAICompatibleForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();
  const [showKey, setShowKey] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OpenAICompatibleFormData>({
    resolver: zodResolver(openaiCompatibleFormSchema),
    defaultValues: { label: "", baseUrl: "", apiKey: "" },
  });

  const {
    mutate: createKey,
    isPending,
    error,
  } = useMutation({
    mutationFn: async (data: OpenAICompatibleFormData) => {
      const encodedKey = JSON.stringify({
        baseUrl: data.baseUrl,
        apiKey: data.apiKey || "",
      });
      await client.callTool({
        name: "AI_PROVIDER_KEY_CREATE",
        arguments: {
          providerId: "openai-compatible",
          label: data.label || data.baseUrl,
          apiKey: encodedKey,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviderKeys(org.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviders(org.id) });
      toast.success("Connection saved successfully");
      onSuccess();
    },
    onError: (err) => {
      toast.error(`Failed to save connection: ${err.message}`);
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => createKey(data))}
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Label
        </label>
        <Input
          placeholder="e.g. LiteLLM, Ollama"
          {...register("label")}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Base URL
        </label>
        <Input
          type="url"
          placeholder="http://localhost:4000/v1"
          {...register("baseUrl")}
          className="h-8 text-sm"
        />
        {errors.baseUrl && (
          <p className="text-xs text-destructive">{errors.baseUrl.message}</p>
        )}
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          API Key <span className="text-muted-foreground/60">(optional)</span>
        </label>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            placeholder="sk-..."
            {...register("apiKey")}
            className="h-8 text-sm pr-8"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error.message}</p>}

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Save Connection"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export type AiProvider = {
  id: string;
  name: string;
  description: string;
  logo?: string | null;
  connectionMethod?: "api-key" | "oauth-pkce" | "cli-activate";
  supportedMethods: ("api-key" | "oauth-pkce" | "cli-activate")[];
  supportsTopUp?: boolean;
  supportsCredits?: boolean;
  supportsProvision?: boolean;
};

function ProviderCard({
  provider,
  keys,
}: {
  provider: AiProvider;
  keys: AiProviderKey[];
}) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();
  const [isConnectFormOpen, setIsConnectFormOpen] = useState(false);
  const [isOAuthPending, setIsOAuthPending] = useState(false);
  const [oauthStateToken, setOauthStateToken] = useState<string | null>(null);
  const isCliActivate = provider.supportedMethods.includes("cli-activate");
  const isActive = keys.length > 0;

  const { mutate: deleteKey, isPending: isDeleting } = useMutation({
    mutationFn: async (keyId: string) => {
      await client.callTool({
        name: "AI_PROVIDER_KEY_DELETE",
        arguments: { keyId },
      });
      return keyId;
    },
    onSuccess: (deletedKeyId) => {
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviderKeys(org.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviders(org.id) });
      queryClient.invalidateQueries({
        queryKey: KEYS.aiProviderModels(org.id, deletedKeyId),
      });
      toast.success("Key deleted");
    },
    onError: (err) => {
      toast.error(`Failed to delete key: ${err.message}`);
    },
  });

  const { mutate: exchangeOAuth } = useMutation({
    mutationFn: async ({
      code,
      stateToken,
    }: {
      code: string;
      stateToken: string;
    }) => {
      const result = (await client.callTool({
        name: "AI_PROVIDER_OAUTH_EXCHANGE",
        arguments: {
          providerId: provider.id,
          code,
          stateToken,
          label: "Connected via OAuth",
        },
      })) as { isError?: boolean; content?: { text?: string }[] };
      if (result?.isError) {
        const msg = result.content?.[0]?.text ?? "OAuth exchange failed";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviderKeys(org.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviders(org.id) });
      toast.success(`${provider.name} connected successfully`);
      setIsOAuthPending(false);
      setOauthStateToken(null);
    },
    onError: (err) => {
      toast.error(`OAuth connection failed: ${err.message}`);
      setIsOAuthPending(false);
      setOauthStateToken(null);
    },
  });

  const { mutate: activateCli, isPending: isActivating } = useMutation({
    mutationFn: async () => {
      const result = (await client.callTool({
        name: "AI_PROVIDER_CLI_ACTIVATE",
        arguments: { providerId: provider.id },
      })) as {
        structuredContent?: { activated: boolean; error?: string };
        isError?: boolean;
        content?: { text?: string }[];
      };
      if (result?.isError) {
        throw new Error(result.content?.[0]?.text ?? "CLI activation failed");
      }
      return result.structuredContent;
    },
    onSuccess: (data) => {
      if (!data?.activated) {
        toast.error(data?.error ?? "CLI activation failed");
        return;
      }
      queryClient.invalidateQueries({
        queryKey: KEYS.aiProviderKeys(org.id),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.aiProviders(org.id),
      });
      toast.success(`${provider.name} activated`);
    },
    onError: (err) => toast.error(err.message),
  });

  const { mutate: provisionKey, isPending: isProvisioning } = useMutation({
    mutationFn: async () => {
      const result = (await client.callTool({
        name: "AI_PROVIDER_PROVISION_KEY",
        arguments: { providerId: provider.id },
      })) as {
        isError?: boolean;
        content?: { text?: string }[];
      };
      if (result?.isError) {
        const msg = result.content?.[0]?.text ?? "Key provisioning failed";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviderKeys(org.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviders(org.id) });
      toast.success(`${provider.name} connected successfully`);
    },
    onError: (err) => {
      toast.error(`Failed to connect ${provider.name}: ${err.message}`);
    },
  });

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (!isOAuthPending || !oauthStateToken) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "AI_PROVIDER_OAUTH_CALLBACK") {
        const { code, stateToken } = event.data;
        if (stateToken === oauthStateToken) {
          exchangeOAuth({ code, stateToken });
        } else {
          console.error("State token mismatch");
          toast.error("Security check failed: State token mismatch");
          setIsOAuthPending(false);
          setOauthStateToken(null);
        }
      }
    };

    window.addEventListener("message", handleMessage);

    // Timeout after 2 minutes
    const timeoutId = setTimeout(() => {
      if (isOAuthPending) {
        setIsOAuthPending(false);
        setOauthStateToken(null);
        toast.error("Connection timed out");
      }
    }, 120000);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timeoutId);
    };
  }, [isOAuthPending, oauthStateToken, exchangeOAuth]);

  const supportsProvision = !!provider.supportsProvision;
  const supportsOAuth = provider.supportedMethods.includes("oauth-pkce");
  const supportsApiKey = provider.supportedMethods.includes("api-key");

  const handleCardClick = () => {
    if (isConnectFormOpen || isOAuthPending || isActivating || isProvisioning)
      return;
    if (isCliActivate) {
      if (!isActive) activateCli();
      return;
    }
    if (supportsProvision) {
      provisionKey();
    } else if (supportsOAuth) {
      handleConnectOAuth();
    } else if (supportsApiKey) {
      setIsConnectFormOpen(true);
    }
  };

  const handleConnectOAuth = async () => {
    try {
      setIsOAuthPending(true);
      const result = (await client.callTool({
        name: "AI_PROVIDER_OAUTH_URL",
        arguments: {
          providerId: provider.id,
          callbackUrl: `${window.location.origin}/oauth/callback/ai-provider`,
        },
      })) as { structuredContent?: { url: string; stateToken: string } };

      if (result.structuredContent) {
        setOauthStateToken(result.structuredContent.stateToken);
        window.open(
          result.structuredContent.url,
          "AiProviderOAuth",
          "width=600,height=700",
        );
      } else {
        throw new Error("Invalid response from AI_PROVIDER_OAUTH_URL");
      }
    } catch (err) {
      setIsOAuthPending(false);
      toast.error(
        `Failed to start OAuth: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <>
      <Card
        className={cn(
          "p-4 flex flex-col gap-3 transition-colors relative",
          isActive && "border-primary/20",
          !isOAuthPending &&
            !isActivating &&
            !isProvisioning &&
            "cursor-pointer hover:bg-muted/30",
          (isOAuthPending || isActivating || isProvisioning) && "cursor-wait",
        )}
        onClick={handleCardClick}
      >
        {isActive && (
          <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-green-500" />
        )}

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {provider.logo ? (
              <img
                src={provider.logo}
                alt={provider.name}
                className="size-8 rounded-md object-contain dark:bg-white dark:rounded-md dark:p-0.5"
              />
            ) : (
              <Avatar
                fallback={provider.name.charAt(0)}
                className="size-8 bg-primary/10 text-primary"
              />
            )}
            <div>
              <h3 className="font-medium text-base">{provider.name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-1">
                {isActivating
                  ? "Checking CLI..."
                  : isProvisioning
                    ? "Connecting..."
                    : isOAuthPending
                      ? "Authorizing..."
                      : provider.description}
              </p>
            </div>
          </div>
        </div>

        {isActive && (
          <div className="mt-1">
            {isCliActivate ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Authenticated via {provider.name} CLI
                </p>
                <KeyList
                  keys={keys}
                  onDelete={deleteKey}
                  isDeleting={isDeleting}
                />
              </>
            ) : (
              <>
                {/* Hide balance + top-up for deco — the hero section shows it */}
                {!provider.supportsCredits && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      {keys.length} key{keys.length !== 1 ? "s" : ""} configured
                    </p>
                  </div>
                )}
                {provider.supportsCredits && (
                  <p className="text-xs text-muted-foreground">
                    {keys.length} key{keys.length !== 1 ? "s" : ""} configured
                    &middot; Managed above
                  </p>
                )}
                <KeyList
                  keys={keys}
                  onDelete={deleteKey}
                  isDeleting={isDeleting}
                />
              </>
            )}
          </div>
        )}
      </Card>

      <Dialog
        open={isConnectFormOpen}
        onOpenChange={(open) => {
          if (!open) setIsConnectFormOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {provider.name}</DialogTitle>
            <DialogDescription>
              {provider.id === "openai-compatible"
                ? "Enter the base URL and optional API key for your OpenAI-compatible endpoint."
                : `Add an API key to connect your ${provider.name} account.`}
            </DialogDescription>
          </DialogHeader>
          {provider.id === "openai-compatible" ? (
            <ConnectOpenAICompatibleForm
              onCancel={() => setIsConnectFormOpen(false)}
              onSuccess={() => setIsConnectFormOpen(false)}
            />
          ) : (
            <ConnectApiKeyForm
              providerId={provider.id}
              onCancel={() => setIsConnectFormOpen(false)}
              onSuccess={() => setIsConnectFormOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProviderCardGrid({
  hideProviderId,
}: {
  hideProviderId?: string;
} = {}) {
  const aiProviders = useAiProviders();
  const allKeys = useAiProviderKeys();
  const providers: AiProvider[] = (aiProviders?.providers ?? []).filter(
    (p) => p.id !== hideProviderId,
  );
  const localProviders = providers.filter((p) =>
    p.supportedMethods.includes("cli-activate"),
  );
  const cloudProviders = providers.filter(
    (p) => !p.supportedMethods.includes("cli-activate"),
  );

  return (
    <div className="flex flex-col gap-5 w-full">
      {localProviders.length > 0 && (
        <div className="relative rounded-xl border border-lime-400/30 bg-gradient-to-br from-lime-50/50 via-transparent to-yellow-50/30 dark:from-lime-950/20 dark:to-yellow-950/10 p-4">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-lime-400/5 to-yellow-400/5 pointer-events-none" />
          <p className="text-xs font-medium text-lime-700 dark:text-lime-400 mb-3 relative">
            Local models — use your existing AI provider
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 relative">
            {localProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                keys={allKeys.filter((k) => k.providerId === provider.id)}
              />
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cloudProviders.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            keys={allKeys.filter((k) => k.providerId === provider.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Quick Top-Up presets ──────────────────────────────────────────────

const TOP_UP_PRESETS = {
  usd: [10, 20, 100],
  brl: [50, 100, 500],
} as const;

function QuickTopUp() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const [customOpen, setCustomOpen] = useState(false);

  const { mutate: topUp, isPending } = useMutation({
    mutationFn: async (amountCents: number) => {
      const result = (await client.callTool({
        name: "AI_PROVIDER_TOPUP_URL",
        arguments: {
          providerId: "deco",
          amountCents,
          currency,
        },
      })) as {
        structuredContent?: { url: string };
        isError?: boolean;
        content?: { text?: string }[];
      };
      if (result?.isError) {
        throw new Error(
          result.content?.[0]?.text ?? "Failed to get top-up URL",
        );
      }
      return result.structuredContent?.url;
    },
    onSuccess: (url) => {
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (err) => {
      toast.error(`Top-up failed: ${err.message}`);
    },
  });

  const [customAmount, setCustomAmount] = useState("");
  const [currency, setCurrency] = useState<"usd" | "brl">("usd");
  const customNum = parseFloat(customAmount);
  const isCustomValid = !isNaN(customNum) && customNum >= 1;
  const currencySymbol = currency === "brl" ? "R$" : "$";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="default"
          value={currency}
          onValueChange={(v) => {
            if (v) setCurrency(v as "usd" | "brl");
          }}
        >
          <ToggleGroupItem value="usd" className="px-3.5 text-sm">
            USD
          </ToggleGroupItem>
          <ToggleGroupItem value="brl" className="px-3.5 text-sm">
            BRL
          </ToggleGroupItem>
        </ToggleGroup>
        {!customOpen && (
          <>
            {TOP_UP_PRESETS[currency].map((dollars) => (
              <Button
                key={dollars}
                variant="outline"
                className="h-10 px-4 text-sm font-medium tabular-nums"
                disabled={isPending}
                onClick={() => topUp(dollars * 100)}
              >
                {currencySymbol}
                {dollars}
              </Button>
            ))}
            <Button
              variant="ghost"
              className="h-10 px-4 text-sm text-muted-foreground"
              onClick={() => setCustomOpen(true)}
              disabled={isPending}
            >
              Custom
            </Button>
          </>
        )}
        {customOpen && (
          <>
            <div className="relative max-w-[140px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                {currencySymbol}
              </span>
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="50"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="h-10 text-sm pl-7"
                autoFocus
              />
            </div>
            <Button
              className="h-10"
              disabled={!isCustomValid || isPending}
              onClick={() => topUp(Math.round(customNum * 100))}
            >
              {isPending ? "..." : "Add"}
            </Button>
            <Button
              variant="ghost"
              className="h-10 text-sm text-muted-foreground"
              onClick={() => {
                setCustomOpen(false);
                setCustomAmount("");
              }}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Deco Credits Hero ────────────────────────────────────────────────

function creditColorClass(dollars: number): string {
  if (dollars <= 0) return "text-destructive";
  if (dollars <= 1) return "text-amber-500 dark:text-amber-400";
  return "text-foreground";
}

function DecoCreditsHero() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();
  const allKeys = useAiProviderKeys();
  const decoKey = allKeys.find((k) => k.providerId === "deco");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const { mutate: disconnect, isPending: isDisconnecting } = useMutation({
    mutationFn: async () => {
      if (!decoKey) return;
      await client.callTool({
        name: "AI_PROVIDER_KEY_DELETE",
        arguments: { keyId: decoKey.id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviderKeys(org.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.aiProviders(org.id) });
      toast.success("Deco AI Gateway disconnected");
      setConfirmDisconnect(false);
    },
    onError: (err) => {
      toast.error(`Failed to disconnect: ${err.message}`);
    },
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: KEYS.aiProviderCredits(org.id, "deco"),
    enabled: !!decoKey,
    staleTime: 60_000,
    queryFn: async () => {
      const result = (await client.callTool({
        name: "AI_PROVIDER_CREDITS",
        arguments: { providerId: "deco" },
      })) as {
        structuredContent?: { balanceCents: number };
        isError?: boolean;
      };
      if (result?.isError) return null;
      return result.structuredContent ?? null;
    },
  });

  if (!decoKey) return null;

  const balanceDollars =
    data?.balanceCents != null ? data.balanceCents / 100 : null;
  const displayBalance =
    balanceDollars != null ? `$${balanceDollars.toFixed(2)}` : "—";

  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden",
        "border border-border",
        "bg-gradient-to-br from-background via-muted/30 to-background",
      )}
    >
      <div className="relative p-6">
        {/* Provider identity */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <img
              src="/logos/deco%20logo.svg"
              alt="Deco AI Gateway"
              className="size-9 rounded-lg object-contain dark:bg-white dark:p-0.5"
            />
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Deco AI Gateway
              </h3>
              <p className="text-xs text-muted-foreground">
                Access to 100+ models
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDisconnect(true)}
            disabled={isDisconnecting}
          >
            Disconnect
          </Button>
        </div>

        <AlertDialog
          open={confirmDisconnect}
          onOpenChange={setConfirmDisconnect}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect Deco AI Gateway</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the Deco AI Gateway from this workspace. Your
                credit balance is preserved and will be available if you
                reconnect.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => disconnect()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Balance */}
        <div className="flex items-baseline gap-2">
          {isLoading || isFetching ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <span
              className={cn(
                "text-3xl font-semibold tabular-nums tracking-tight",
                balanceDollars != null && creditColorClass(balanceDollars),
              )}
            >
              {displayBalance}
            </span>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors p-1 rounded-md hover:bg-muted/50"
            aria-label="Refresh balance"
          >
            <RefreshCw01
              size={14}
              className={cn(isFetching && "animate-spin")}
            />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Available credit balance
        </p>

        {/* Quick top-up */}
        <div className="mt-5 pt-4 border-t border-border/60">
          <p className="text-xs font-medium text-muted-foreground mb-2.5">
            Add credits
          </p>
          <QuickTopUp />
        </div>
      </div>
    </div>
  );
}

// ── Simple Model Mode ────────────────────────────────────────────────

const filterImageModels = (m: AiProviderModel) =>
  m.capabilities?.includes("image") === true;

const filterWebResearchModels = (m: AiProviderModel) => {
  const n = m.modelId.toLowerCase().replace(/[^a-z0-9]/g, "");
  return n.includes("sonar") || n.includes("deepresearch");
};

type TierKey = "fast" | "smart" | "thinking";

const TIER_LABELS: Record<TierKey, string> = {
  fast: "Fast",
  smart: "Smart",
  thinking: "Thinking",
};

const TIER_DESCRIPTIONS: Record<TierKey, string> = {
  fast: "Fastest responses, best for quick tasks",
  smart: "Balanced speed and capability",
  thinking: "Most capable, best for complex tasks",
};

function SimpleModeModelRow({
  label,
  description,
  slot,
  onSlotChange,
  filterModels,
  defaultKeyId,
}: {
  label: string;
  description?: string;
  slot: SimpleModeConfig["chat"]["fast"];
  onSlotChange: (slot: SimpleModeConfig["chat"]["fast"]) => void;
  filterModels?: (m: AiProviderModel) => boolean;
  defaultKeyId: string | null;
}) {
  const allKeys = useAiProviderKeys();
  const [localCredentialId, setLocalCredentialId] = useState<string | null>(
    slot?.keyId ?? defaultKeyId,
  );

  // Adopt slot's keyId when it actually transitions (e.g. auto-fill from defaults)
  // — NOT on every render, or it would revert user's in-modal credential changes.
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (slot?.keyId) setLocalCredentialId(slot.keyId);
  }, [slot?.keyId]);

  const activeKeyId = localCredentialId ?? defaultKeyId;
  const slotKey = activeKeyId
    ? allKeys.find((k) => k.id === activeKeyId)
    : null;

  const { models: activeModels, isLoading: isLoadingModels } =
    useAiProviderModels(filterModels ? (activeKeyId ?? undefined) : undefined);
  const hasFilteredModels = filterModels
    ? isLoadingModels || activeModels.some(filterModels)
    : true;

  const resolvedModel: AiProviderModel | null = slot
    ? ({
        modelId: slot.modelId,
        title: slot.title ?? slot.modelId,
        keyId: slot.keyId,
        providerId: slotKey?.providerId ?? "deco",
        description: null,
        logo: null,
        capabilities: [],
        limits: null,
        costs: null,
      } as AiProviderModel)
    : null;

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">
        {filterModels && !hasFilteredModels ? (
          <p className="text-xs text-muted-foreground italic">
            Not available with current provider
          </p>
        ) : (
          <ModelSelector
            variant="bordered"
            placeholder="Pick model"
            model={resolvedModel}
            credentialId={activeKeyId}
            filterModels={filterModels}
            onCredentialChange={(keyId) => setLocalCredentialId(keyId)}
            onModelChange={(m) => {
              const keyId = m.keyId ?? activeKeyId ?? "";
              setLocalCredentialId(keyId);
              onSlotChange({ keyId, modelId: m.modelId, title: m.title });
            }}
          />
        )}
      </div>
    </div>
  );
}

function SimpleModeSection() {
  const allKeys = useAiProviderKeys();
  const simpleMode = useSimpleMode();
  const { mutate: updateSimpleMode, isPending } = useUpdateSimpleMode();

  const [draft, setDraft] = useState<SimpleModeConfig>(() => ({
    enabled: simpleMode.enabled,
    chat: {
      fast: simpleMode.chat.fast,
      smart: simpleMode.chat.smart,
      thinking: simpleMode.chat.thinking,
    },
    image: simpleMode.image,
    webResearch: simpleMode.webResearch,
  }));

  // Sync remote state into draft when it changes (e.g. after save)
  const [synced, setSynced] = useState(false);
  if (
    !synced &&
    (simpleMode.enabled ||
      simpleMode.chat.fast ||
      simpleMode.chat.smart ||
      simpleMode.chat.thinking)
  ) {
    setSynced(true);
    setDraft({
      enabled: simpleMode.enabled,
      chat: {
        fast: simpleMode.chat.fast,
        smart: simpleMode.chat.smart,
        thinking: simpleMode.chat.thinking,
      },
      image: simpleMode.image,
      webResearch: simpleMode.webResearch,
    });
  }

  // Lazily load models for all keys so we can pre-fill defaults.
  // We call the hook for each key separately and collect results.
  // Since hooks can't be called in a loop, we cap at the first 3 keys
  // (sufficient for defaults — the user can always change manually).
  const key0 = allKeys[0];
  const key1 = allKeys[1];
  const key2 = allKeys[2];
  const { models: models0 } = useAiProviderModels(key0?.id);
  const { models: models1 } = useAiProviderModels(key1?.id);
  const { models: models2 } = useAiProviderModels(key2?.id);

  const handleToggle = (enabled: boolean) => {
    if (
      enabled &&
      !draft.chat.fast &&
      !draft.chat.smart &&
      !draft.chat.thinking
    ) {
      const modelsByKeyId: Record<string, AiProviderModel[]> = {};
      if (key0?.id) modelsByKeyId[key0.id] = models0;
      if (key1?.id) modelsByKeyId[key1.id] = models1;
      if (key2?.id) modelsByKeyId[key2.id] = models2;
      const defaults = pickSimpleModeDefaults(allKeys, modelsByKeyId);
      setDraft({
        enabled: true,
        chat: defaults.chat,
        image: defaults.image,
        webResearch: defaults.webResearch,
      });
    } else {
      setDraft((d) => ({ ...d, enabled }));
    }
  };

  const handleSave = () => {
    updateSimpleMode(draft, {
      onSuccess: () => {
        toast.success("Simple Model Mode updated");
        setSynced(false);
      },
      onError: (err) => {
        toast.error(`Failed to save: ${err.message}`);
      },
    });
  };

  const isDirty =
    draft.enabled !== simpleMode.enabled ||
    JSON.stringify(draft.chat) !== JSON.stringify(simpleMode.chat) ||
    JSON.stringify(draft.image) !== JSON.stringify(simpleMode.image) ||
    JSON.stringify(draft.webResearch) !==
      JSON.stringify(simpleMode.webResearch);

  const hasProvider = allKeys.length > 0;
  const effectiveEnabled = draft.enabled && hasProvider;

  // When all providers are removed, clear the draft so stale model
  // selections don't carry over when a different provider is connected.
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (!hasProvider) {
      setDraft({
        enabled: false,
        chat: { fast: null, smart: null, thinking: null },
        image: null,
        webResearch: null,
      });
      setSynced(false);
    }
  }, [hasProvider]);

  // When models finish loading (async), fill any null slots that are still
  // empty — handles the race where handleToggle ran before models were ready.
  // Also clears slots whose keyId no longer exists in allKeys (stale provider).
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (!draft.enabled) return;

    const validKeyIds = new Set(allKeys.map((k) => k.id));
    const modelsByKeyId: Record<string, AiProviderModel[]> = {};
    if (key0?.id) modelsByKeyId[key0.id] = models0;
    if (key1?.id) modelsByKeyId[key1.id] = models1;
    if (key2?.id) modelsByKeyId[key2.id] = models2;

    const isStale = (slot: SimpleModeConfig["chat"]["fast"]) =>
      slot != null && !validKeyIds.has(slot.keyId);

    const clearedChat = {
      fast: isStale(draft.chat.fast) ? null : draft.chat.fast,
      smart: isStale(draft.chat.smart) ? null : draft.chat.smart,
      thinking: isStale(draft.chat.thinking) ? null : draft.chat.thinking,
    };
    const clearedImage = isStale(draft.image) ? null : draft.image;
    const clearedWebResearch = isStale(draft.webResearch)
      ? null
      : draft.webResearch;

    const needsFill =
      !clearedChat.fast ||
      !clearedChat.smart ||
      !clearedChat.thinking ||
      !clearedImage ||
      !clearedWebResearch;

    const chatUnchanged =
      clearedChat.fast === draft.chat.fast &&
      clearedChat.smart === draft.chat.smart &&
      clearedChat.thinking === draft.chat.thinking;
    if (!needsFill && chatUnchanged) return;

    const defaults = pickSimpleModeDefaults(allKeys, modelsByKeyId);
    setDraft((d) => ({
      ...d,
      chat: {
        fast: clearedChat.fast ?? defaults.chat.fast,
        smart: clearedChat.smart ?? defaults.chat.smart,
        thinking: clearedChat.thinking ?? defaults.chat.thinking,
      },
      image: clearedImage ?? defaults.image,
      webResearch: clearedWebResearch ?? defaults.webResearch,
    }));
  }, [
    draft.enabled,
    allKeys,
    models0,
    models1,
    models2,
    key0?.id,
    key1?.id,
    key2?.id,
  ]); // eslint-disable-line

  return (
    <Card className="p-6">
      <CardHeader className="p-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-sm">Simple model mode</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasProvider
                ? "Replace the model picker with a Fast / Smart / Thinking toggle for all members of this org."
                : "Connect an AI provider above to enable this feature."}
            </p>
          </div>
          <Switch
            checked={effectiveEnabled}
            onCheckedChange={handleToggle}
            disabled={isPending || !hasProvider}
          />
        </div>
      </CardHeader>

      {effectiveEnabled && (
        <CardContent className="flex flex-col p-0 mt-6">
          <div className="flex flex-col gap-1 pb-6">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Chat models
            </p>
            {(["fast", "smart", "thinking"] as TierKey[]).map((tier) => (
              <SimpleModeModelRow
                key={tier}
                label={TIER_LABELS[tier]}
                description={TIER_DESCRIPTIONS[tier]}
                slot={draft.chat[tier]}
                defaultKeyId={allKeys[0]?.id ?? null}
                onSlotChange={(slot) =>
                  setDraft((d) => ({
                    ...d,
                    chat: { ...d.chat, [tier]: slot },
                  }))
                }
              />
            ))}
          </div>
          <div className="flex flex-col gap-1 pt-6 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Other models
            </p>
            <SimpleModeModelRow
              label="Image"
              slot={draft.image}
              defaultKeyId={allKeys[0]?.id ?? null}
              filterModels={filterImageModels}
              onSlotChange={(slot) => setDraft((d) => ({ ...d, image: slot }))}
            />
            <SimpleModeModelRow
              label="Web research"
              slot={draft.webResearch}
              defaultKeyId={allKeys[0]?.id ?? null}
              filterModels={filterWebResearchModels}
              onSlotChange={(slot) =>
                setDraft((d) => ({ ...d, webResearch: slot }))
              }
            />
          </div>
        </CardContent>
      )}

      {isDirty && hasProvider && (
        <CardFooter className="p-0 pt-4 justify-end">
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

// ── Page assembly ────────────────────────────────────────────────────

function OrgAiProvidersContent() {
  const allKeys = useAiProviderKeys();
  const hasDecoKey = allKeys.some((k) => k.providerId === "deco");

  return (
    <div className="flex flex-col gap-6">
      <DecoCreditsHero />
      <ProviderCardGrid hideProviderId={hasDecoKey ? "deco" : undefined} />
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <SimpleModeSection />
      </Suspense>
    </div>
  );
}

export function OrgAiProvidersPage() {
  return (
    <Page>
      <Page.Content>
        <Page.Body>
          <div className="flex flex-col gap-6">
            <Page.Title>AI Providers</Page.Title>
            <ErrorBoundary
              fallback={({ error }) => (
                <ErrorFallback
                  error={error ?? new Error("Failed to load AI providers")}
                />
              )}
            >
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <OrgAiProvidersContent />
              </Suspense>
            </ErrorBoundary>
          </div>
        </Page.Body>
      </Page.Content>
    </Page>
  );
}
