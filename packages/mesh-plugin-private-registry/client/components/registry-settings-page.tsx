import { useState } from "react";
import {
  useCollectionList,
  useConnections,
  useMCPClientOptional,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { LLMModelSelector } from "@deco/ui/components/llm-model-selector.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import {
  Copy01,
  Eye,
  EyeOff,
  FlipBackward,
  Globe01,
  Key01,
  Link01,
  Loading01,
  Plus,
  Save01,
  Trash01,
} from "@untitledui/icons";
import { toast } from "sonner";
import { PLUGIN_ID } from "../../shared";
import { useImageUpload } from "../hooks/use-image-upload";
import {
  usePublishApiKeyMutations,
  usePublishApiKeys,
  useRegistryConfig,
  useRegistryItems,
} from "../hooks/use-registry";
import { ImageUpload } from "./image-upload";

/**
 * Settings page for the Private Registry plugin.
 *
 * Server values (`registryName`, etc.) are passed via `initialXxx` props and
 * used to seed the local draft state on mount.  The parent renders this
 * component with a `key` derived from the server state so that React
 * automatically re-mounts (and re-seeds) when the server config changes —
 * no useEffect synchronisation needed.
 */
interface RegistrySettingsPageProps {
  initialName: string;
  initialIcon: string;
  initialLLMConnectionId: string;
  initialLLMModelId: string;
  initialAcceptPublishRequests: boolean;
  initialRequireApiToken: boolean;
}

export default function RegistrySettingsPage({
  initialName,
  initialIcon,
  initialLLMConnectionId,
  initialLLMModelId,
  initialAcceptPublishRequests,
  initialRequireApiToken,
}: RegistrySettingsPageProps) {
  const { org } = useProjectContext();
  const { uploadImage, isUploading: isUploadingIcon } = useImageUpload();
  const { saveRegistryConfigMutation } = useRegistryConfig(PLUGIN_ID);

  // ── Draft state (seeded from initial props, reset via key) ──
  const [nameDraft, setNameDraft] = useState(initialName);
  const [iconDraft, setIconDraft] = useState(initialIcon);
  const [llmConnectionDraft, setLLMConnectionDraft] = useState(
    initialLLMConnectionId,
  );
  const [llmModelDraft, setLLMModelDraft] = useState(initialLLMModelId);
  const [acceptPublishRequestsDraft, setAcceptPublishRequestsDraft] = useState(
    initialAcceptPublishRequests,
  );
  const [requireApiTokenDraft, setRequireApiTokenDraft] = useState(
    initialRequireApiToken,
  );

  // ── API key management ──
  const apiKeysQuery = usePublishApiKeys();
  const { generateMutation, revokeMutation } = usePublishApiKeyMutations();
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const itemsQuery = useRegistryItems({
    search: "",
    tags: [],
    categories: [],
    limit: 50,
  });
  const allConnections = useConnections();
  const llmConnections = (allConnections ?? []).filter((connection) =>
    (connection.tools ?? []).some((tool) => tool.name === "LLM_DO_GENERATE"),
  );
  const effectiveLLMConnectionId =
    llmConnectionDraft || initialLLMConnectionId || llmConnections[0]?.id || "";
  const llmClient = useMCPClientOptional({
    connectionId: effectiveLLMConnectionId || undefined,
    orgId: org.id,
  });
  const llmModels = useCollectionList<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    description?: string | null;
    logo?: string | null;
    capabilities?: string[];
  }>(effectiveLLMConnectionId || "no-llm-connection", "LLM", llmClient);

  const publicStoreUrl = `${window.location.origin}/org/${org.slug}/registry/mcp`;
  const loadedItems =
    itemsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  const publicCount = loadedItems.filter((item) => item.is_public).length;

  const publishRequestUrl = `${window.location.origin}/org/${org.slug}/registry/publish-request`;

  const isDirty =
    nameDraft.trim() !== initialName.trim() ||
    iconDraft.trim() !== initialIcon.trim() ||
    llmConnectionDraft.trim() !== initialLLMConnectionId.trim() ||
    llmModelDraft.trim() !== initialLLMModelId.trim() ||
    acceptPublishRequestsDraft !== initialAcceptPublishRequests ||
    requireApiTokenDraft !== initialRequireApiToken;

  const isSaving = saveRegistryConfigMutation.isPending;

  const handleIconFileUpload = async (file: File) => {
    if (!file) return;
    const extension = file.name.split(".").pop() || "png";
    const iconPath = `registry/${org.id}/identity/icon.${extension}`;
    const url = await uploadImage(file, iconPath);

    if (url) {
      setIconDraft(url);
    } else {
      toast.error("Failed to upload icon. Please try again.");
    }
  };

  const handleSave = async () => {
    const nextName = nameDraft.trim();
    if (!nextName) return;

    const nextModelId = llmModelDraft.trim();
    const nextConnectionId = nextModelId
      ? llmConnectionDraft.trim() || effectiveLLMConnectionId || ""
      : llmConnectionDraft.trim();

    try {
      await saveRegistryConfigMutation.mutateAsync({
        registryName: nextName,
        registryIcon: iconDraft.trim(),
        llmConnectionId: nextConnectionId,
        llmModelId: nextModelId,
        acceptPublishRequests: acceptPublishRequestsDraft,
        requireApiToken: requireApiTokenDraft,
      });
      toast.success("Registry settings updated");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save registry settings",
      );
    }
  };

  const handleUndo = () => {
    setNameDraft(initialName);
    setIconDraft(initialIcon);
    setLLMConnectionDraft(initialLLMConnectionId);
    setLLMModelDraft(initialLLMModelId);
    setAcceptPublishRequestsDraft(initialAcceptPublishRequests);
    setRequireApiTokenDraft(initialRequireApiToken);
  };

  const handleGenerateKey = async () => {
    const name = newKeyName.trim();
    if (!name) return;
    try {
      const result = await generateMutation.mutateAsync(name);
      if (result?.key) {
        setRevealedKey(result.key);
        setShowKey(true);
        setNewKeyName("");
        toast.success(
          "API key generated. Copy it now — it won't be shown again!",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate API key",
      );
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    try {
      await revokeMutation.mutateAsync(keyId);
      toast.success("API key revoked");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to revoke API key",
      );
    }
  };

  return (
    <div className="h-full overflow-auto px-4 md:px-6 py-4">
      {/* ── Save / Undo bar (sticky inside settings area) ── */}
      <div className="flex items-center justify-end gap-2 mb-4 min-h-[32px]">
        {isDirty && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={isSaving}
          >
            <FlipBackward size={14} />
            Undo
          </Button>
        )}
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
        >
          {isSaving ? (
            <Loading01 size={14} className="animate-spin" />
          ) : (
            <Save01 size={14} />
          )}
          Save
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 items-start xl:grid-cols-2">
        <div className="grid gap-4 min-w-0 content-start">
          <Card className="min-w-0 p-4 grid gap-4 content-start">
            <div>
              <h3 className="text-base font-semibold">Registry Identity</h3>
              <p className="text-sm text-muted-foreground">
                Configure the name and icon shown in the store selector.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="identity-name">Name</Label>
              <Input
                id="identity-name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Private Registry"
              />
            </div>

            <ImageUpload
              value={iconDraft}
              onChange={setIconDraft}
              onFileUpload={handleIconFileUpload}
              isUploading={isUploadingIcon}
            />
          </Card>

          <Card className="min-w-0 p-4 grid gap-3 content-start">
            <div>
              <h3 className="text-base font-semibold">AI Configuration</h3>
              <p className="text-sm text-muted-foreground">
                Set the default model used for AI suggestions.
              </p>
            </div>
            <LLMModelSelector
              connectionId={effectiveLLMConnectionId}
              modelId={llmModelDraft}
              connections={llmConnections.map((connection) => ({
                id: connection.id,
                title: connection.title,
                icon: connection.icon ?? null,
              }))}
              models={llmModels.map((model) => ({
                id: model.id,
                title: model.title || model.id,
                logo: model.logo ?? null,
                capabilities: model.capabilities ?? [],
              }))}
              onConnectionChange={(value) => {
                setLLMConnectionDraft(value);
                setLLMModelDraft("");
              }}
              onModelChange={setLLMModelDraft}
            />
          </Card>
        </div>

        <div className="grid gap-4 min-w-0 content-start">
          <Card className="min-w-0 p-4 grid gap-3 content-start">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">Public Registry</h3>
                <p className="text-sm text-muted-foreground">
                  Public URL to consume this registry as an MCP.
                </p>
              </div>
              <Badge variant="secondary">
                {publicCount}{" "}
                {publicCount === 1 ? "public item" : "public items"}
              </Badge>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 grid grid-cols-[auto,1fr,auto] items-start gap-2 min-w-0">
              <Globe01 size={14} className="text-muted-foreground shrink-0" />
              <code className="text-xs font-mono break-all leading-5 min-w-0">
                {publicStoreUrl}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(publicStoreUrl);
                  toast.success("URL copied to clipboard");
                }}
              >
                <Link01 size={12} />
                Copy
              </Button>
            </div>
          </Card>

          <Card className="min-w-0 p-4 grid gap-3 content-start">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">Publish Requests</h3>
                <p className="text-sm text-muted-foreground">
                  Allow external users to submit MCP servers for review.
                </p>
              </div>
              <Switch
                id="accept-publish-requests"
                checked={acceptPublishRequestsDraft}
                onCheckedChange={setAcceptPublishRequestsDraft}
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 grid grid-cols-[auto,1fr,auto] items-start gap-2 min-w-0">
              <Globe01 size={14} className="text-muted-foreground shrink-0" />
              <code className="text-xs font-mono break-all leading-5 min-w-0">
                {publishRequestUrl}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(publishRequestUrl);
                  toast.success("Publish URL copied to clipboard");
                }}
              >
                <Link01 size={12} />
                Copy
              </Button>
            </div>

            {/* ── Require API Token ── */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              <div>
                <Label className="text-sm font-medium">Require API Token</Label>
                <p className="text-xs text-muted-foreground">
                  Requests without a valid token will be rejected.
                </p>
              </div>
              <Switch
                id="require-api-token"
                checked={requireApiTokenDraft}
                onCheckedChange={setRequireApiTokenDraft}
              />
            </div>

            {/* ── API Keys (inline) ── */}
            {acceptPublishRequestsDraft && requireApiTokenDraft && (
              <>
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Key01 size={14} className="text-muted-foreground" />
                  <span className="text-sm font-medium">API Keys</span>
                </div>

                {/* ── Revealed key (shown once) ── */}
                {revealedKey && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 grid gap-2">
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      Copy this key now — it won&apos;t be shown again!
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono flex-1 break-all">
                        {showKey
                          ? revealedKey
                          : revealedKey.replace(/./g, "\u2022")}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(revealedKey);
                          toast.success("API key copied to clipboard");
                        }}
                      >
                        <Copy01 size={14} />
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      onClick={() => {
                        setRevealedKey(null);
                        setShowKey(false);
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}

                {/* ── Generate new key ── */}
                <div className="flex items-end gap-2">
                  <div className="grid gap-1.5 flex-1">
                    <Label htmlFor="api-key-name" className="text-xs">
                      Key name
                    </Label>
                    <Input
                      id="api-key-name"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g. CI/CD Pipeline"
                      className="h-8 text-sm"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={!newKeyName.trim() || generateMutation.isPending}
                    onClick={handleGenerateKey}
                  >
                    {generateMutation.isPending ? (
                      <Loading01 size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                    Generate
                  </Button>
                </div>

                {/* ── Key list ── */}
                {(apiKeysQuery.data?.items?.length ?? 0) > 0 && (
                  <div className="grid gap-1">
                    {apiKeysQuery.data?.items?.map((apiKey) => (
                      <div
                        key={apiKey.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                      >
                        <div className="grid gap-0.5 min-w-0">
                          <span className="text-sm font-medium truncate">
                            {apiKey.name}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {apiKey.prefix}••••••••
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-destructive hover:text-destructive shrink-0"
                          disabled={revokeMutation.isPending}
                          onClick={() => handleRevokeKey(apiKey.id)}
                        >
                          <Trash01 size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
