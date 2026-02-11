import { useEffect, useMemo, useRef, useState } from "react";
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
import { Globe01, Link01 } from "@untitledui/icons";
import { toast } from "sonner";
import { PLUGIN_ID } from "../../shared";
import { useImageUpload } from "../hooks/use-image-upload";
import { useRegistryConfig, useRegistryItems } from "../hooks/use-registry";
import { ImageUpload } from "./image-upload";

interface RegistrySettingsPageProps {
  onDirtyChange: (isDirty: boolean) => void;
  onSavingChange: (isSaving: boolean) => void;
  registerSave: (handler: (() => void | Promise<void>) | null) => void;
  registerUndo: (handler: (() => void) | null) => void;
}

export default function RegistrySettingsPage({
  onDirtyChange,
  onSavingChange,
  registerSave,
  registerUndo,
}: RegistrySettingsPageProps) {
  const { org } = useProjectContext();
  const { uploadImage, isUploading: isUploadingIcon } = useImageUpload();
  const {
    registryName,
    registryIcon,
    registryLLMConnectionId,
    registryLLMModelId,
    saveRegistryConfigMutation,
  } = useRegistryConfig(PLUGIN_ID);
  const [nameDraft, setNameDraft] = useState(registryName);
  const [iconDraft, setIconDraft] = useState(registryIcon);
  const [llmConnectionDraft, setLLMConnectionDraft] = useState(
    registryLLMConnectionId,
  );
  const [llmModelDraft, setLLMModelDraft] = useState(registryLLMModelId);
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
    llmConnectionDraft ||
    registryLLMConnectionId ||
    llmConnections[0]?.id ||
    "";
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

  useEffect(() => {
    setNameDraft(registryName);
  }, [registryName]);

  useEffect(() => {
    setIconDraft(registryIcon);
  }, [registryIcon]);

  useEffect(() => {
    setLLMConnectionDraft(registryLLMConnectionId);
  }, [registryLLMConnectionId]);

  useEffect(() => {
    setLLMModelDraft(registryLLMModelId);
  }, [registryLLMModelId]);

  const publicStoreUrl = `${window.location.origin}/org/${org.slug}/registry/mcp`;
  const loadedItems = useMemo(
    () => itemsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [itemsQuery.data?.pages],
  );
  const publicCount = loadedItems.filter((item) => item.is_public).length;
  const isDirty =
    nameDraft.trim() !== registryName.trim() ||
    iconDraft.trim() !== registryIcon.trim() ||
    llmConnectionDraft.trim() !== registryLLMConnectionId.trim() ||
    llmModelDraft.trim() !== registryLLMModelId.trim();

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
    setNameDraft(registryName);
    setIconDraft(registryIcon);
    setLLMConnectionDraft(registryLLMConnectionId);
    setLLMModelDraft(registryLLMModelId);
  };

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange(saveRegistryConfigMutation.isPending);
  }, [saveRegistryConfigMutation.isPending, onSavingChange]);

  const saveRef = useRef(handleSave);
  const undoRef = useRef(handleUndo);

  useEffect(() => {
    saveRef.current = handleSave;
  });

  useEffect(() => {
    undoRef.current = handleUndo;
  });

  useEffect(() => {
    registerSave(() => saveRef.current());
    registerUndo(() => undoRef.current());
    return () => {
      registerSave(null);
      registerUndo(null);
    };
  }, [registerSave, registerUndo]);

  return (
    <div className="h-full overflow-auto px-4 md:px-6 py-4">
      <div className="grid grid-cols-1 gap-4 items-start xl:grid-cols-2">
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
      </div>
    </div>
  );
}
