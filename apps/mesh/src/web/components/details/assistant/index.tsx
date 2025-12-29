import { UNKNOWN_CONNECTION_ID, createToolCaller } from "@/tools/client";
import { ViewActions, ViewLayout, ViewTabs } from "../layout";
import { EmptyState } from "@/web/components/empty-state";
import { ErrorBoundary } from "@/web/components/error-boundary";
import {
  useCollectionActions,
  useCollectionItem,
} from "@/web/hooks/use-collections";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { DecoChatSkeleton } from "@deco/ui/components/deco-chat-skeleton.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { AssistantSchema } from "@decocms/bindings/assistant";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "@tanstack/react-router";
import { Edit05, Loading01, Plus, Upload01, Users02 } from "@untitledui/icons";
import { Chat, type ModelChangePayload } from "@/web/components/chat/chat";
import { usePersistedChat } from "@/web/hooks/use-persisted-chat";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { Suspense, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type Assistant = z.infer<typeof AssistantSchema>;

interface AssistantChatPanelProps {
  activeThreadId: string;
  mode: "chat" | "edit";
  systemPrompt: string | undefined;
  onSystemPromptChange: (value: string) => void;
  gatewayId: string | undefined;
  model: Assistant["model"] | undefined;
  onGatewayChange: (id: string) => void;
  onModelChange: (model: ModelChangePayload) => void;
  title: string | undefined;
  description: string | null | undefined;
  avatar: string | undefined;
}

function AssistantChatPanel({
  activeThreadId,
  mode,
  systemPrompt,
  onSystemPromptChange,
  gatewayId,
  model,
  onGatewayChange,
  onModelChange,
  title,
  description,
  avatar,
}: AssistantChatPanelProps) {
  // Use the shared persisted chat hook with system prompt
  const chat = usePersistedChat({
    threadId: activeThreadId,
    systemPrompt,
  });

  // Chat config is valid when gateway and model are both configured
  const hasChatConfig =
    Boolean(gatewayId) && Boolean(model?.id) && Boolean(model?.connectionId);

  const selectorsDisabled = mode !== "edit";

  const handleSendMessage = async (text: string) => {
    if (!hasChatConfig || !model) return;

    const metadata: Metadata = {
      created_at: new Date().toISOString(),
      thread_id: activeThreadId,
      model: { id: model.id, connectionId: model.connectionId },
      gateway: { id: gatewayId ?? "" },
      user: { name: "you" },
    };

    await chat.sendMessage(text, metadata);
  };

  const emptyState = (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      {avatar ? (
        <div className="size-[60px] rounded-[18px] border border-border shrink-0 overflow-hidden">
          <img
            src={avatar}
            alt={title}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="size-[60px] rounded-[18px] border border-border shrink-0 overflow-hidden bg-muted/20 flex items-center justify-center">
          <Users02 size={28} className="text-muted-foreground" />
        </div>
      )}
      <h3 className="text-xl font-medium text-foreground">{title}</h3>
      {description ? (
        <div className="text-muted-foreground text-center text-sm max-w-md">
          {description}
        </div>
      ) : null}
    </div>
  );

  const editContent = (
    <div className="h-full py-5 flex flex-col max-w-2xl mx-auto w-full min-w-0">
      <div className="pb-2">
        <label
          htmlFor="assistant-system-prompt"
          className="text-xs font-medium text-muted-foreground"
        >
          System prompt
        </label>
      </div>
      <Textarea
        id="assistant-system-prompt"
        value={systemPrompt ?? ""}
        onChange={(e) => onSystemPromptChange(e.target.value)}
        placeholder="System prompt..."
        className="flex-1 min-h-[300px] resize-none text-base leading-relaxed font-normal rounded-xl border border-border bg-muted/20 px-4 py-3 shadow-none focus-visible:ring-0"
      />
    </div>
  );

  return (
    <Chat>
      <Chat.Main
        className="h-full"
        innerClassName="max-w-2xl mx-auto w-full min-w-0"
      >
        {mode === "edit" ? (
          editContent
        ) : chat.messages.length === 0 ? (
          <Chat.EmptyState>{emptyState}</Chat.EmptyState>
        ) : (
          <Chat.Messages
            messages={chat.messages}
            status={chat.status}
            minHeightOffset={240}
          />
        )}
      </Chat.Main>

      <Chat.Footer>
        <div className="max-w-2xl mx-auto w-full min-w-0">
          <Chat.Input
            onSubmit={handleSendMessage}
            onStop={chat.stop}
            disabled={mode === "edit" || !hasChatConfig}
            isStreaming={
              chat.status === "submitted" || chat.status === "streaming"
            }
            placeholder="Ask anything or @ for context"
            usageMessages={chat.messages}
          >
            <Chat.Input.GatewaySelector
              disabled={selectorsDisabled}
              selectedGatewayId={gatewayId}
              onGatewayChange={onGatewayChange}
            />
            <Chat.Input.ModelSelector
              disabled={selectorsDisabled}
              selectedModel={
                model
                  ? { id: model.id, connectionId: model.connectionId }
                  : undefined
              }
              onModelChange={onModelChange}
            />
          </Chat.Input>
        </div>
      </Chat.Footer>
    </Chat>
  );
}

function SmartAvatarUpload({
  value,
  onChange,
  alt,
  size = "md",
}: {
  value?: string | null;
  onChange: (value: string) => void;
  alt?: string;
  size?: "xs" | "sm" | "md";
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sizeClassName =
    size === "xs" ? "h-6 w-6" : size === "sm" ? "h-8 w-8" : "h-16 w-16";
  const fallbackIconClassName =
    size === "xs" ? "h-3 w-3" : size === "sm" ? "h-4 w-4" : "h-6 w-6";
  const uploadIconClassName =
    size === "xs" ? "h-3 w-3" : size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      onChange(result);
    };
    reader.readAsDataURL(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`relative ${sizeClassName} shrink-0 cursor-pointer group`}
      onClick={handleClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
      />

      <div className="h-full w-full rounded-xl border border-border bg-muted/20 overflow-hidden relative">
        {value ? (
          <img
            src={value}
            alt={alt || "Avatar"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Users02 className={fallbackIconClassName} />
          </div>
        )}

        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
          <Upload01 className={`${uploadIconClassName} text-white`} />
        </div>
      </div>
    </div>
  );
}

function AssistantDetailContent({
  providerId,
  assistantId,
  onBack,
}: {
  providerId: string;
  assistantId: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.history.back());
  const { locator } = useProjectContext();

  const [activeThreadId, setActiveThreadId] = useLocalStorage<string>(
    LOCALSTORAGE_KEYS.assistantChatActiveThread(locator, assistantId),
    (existing) => existing || crypto.randomUUID(),
  );

  const toolCaller = createToolCaller(providerId || UNKNOWN_CONNECTION_ID);
  const assistant = useCollectionItem<Assistant>(
    providerId,
    "ASSISTANT",
    assistantId,
    toolCaller,
  );
  const actions = useCollectionActions<Assistant>(
    providerId,
    "ASSISTANT",
    toolCaller,
  );

  const isSaving = actions.update.isPending;

  const [mode, setMode] = useState<"chat" | "edit">(
    assistant?.model.id && assistant?.gateway_id ? "chat" : "edit",
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isDirty },
  } = useForm<Assistant>({
    resolver: zodResolver(AssistantSchema),
    values: assistant ?? undefined,
  });

  const gatewayId = watch("gateway_id");
  const model = watch("model");
  const avatarValue = watch("avatar");
  const systemPrompt = watch("system_prompt");

  const saveAndLock = handleSubmit(async (data: Assistant) => {
    await actions.update.mutateAsync({
      id: assistantId,
      data: data as Assistant,
    });
    setMode("chat");
  });

  if (!assistant) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<DecoChatSkeleton />}>
          <ViewLayout onBack={handleBack}>
            <div className="flex h-full w-full bg-background">
              <EmptyState
                title="Assistant not found"
                description="This assistant may have been deleted or you may not have access to it."
              />
            </div>
          </ViewLayout>
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<DecoChatSkeleton />}>
        <ViewLayout onBack={handleBack}>
          <ViewTabs>
            {mode === "edit" ? (
              <div className="flex items-center gap-3 min-w-0">
                <SmartAvatarUpload
                  size="xs"
                  value={avatarValue}
                  onChange={(val) =>
                    setValue("avatar", val, { shouldDirty: true })
                  }
                  alt={watch("title")}
                />
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Input
                    {...register("title")}
                    placeholder="Untitled assistant"
                    className="h-auto border-transparent hover:border-input focus:border-input bg-transparent shadow-none px-0 py-0 text-sm font-medium truncate"
                  />
                  <span className="text-xs text-muted-foreground font-normal shrink-0">
                    •
                  </span>
                  <Input
                    {...register("description")}
                    placeholder="Add a description…"
                    className="h-auto border-transparent hover:border-input focus:border-input bg-transparent shadow-none px-0 py-0 text-xs text-muted-foreground min-w-0"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-6 w-6 min-w-6 rounded-lg border border-border bg-muted/20 overflow-hidden shrink-0">
                  {assistant.avatar ? (
                    <img
                      src={assistant.avatar}
                      alt={assistant.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                      <Users02 size={12} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">
                    {assistant.title}
                  </span>
                  {assistant.description ? (
                    <>
                      <span className="text-xs text-muted-foreground font-normal">
                        •
                      </span>
                      <span className="text-xs text-muted-foreground font-normal truncate min-w-0">
                        {assistant.description}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </ViewTabs>

          <ViewActions>
            {mode === "chat" ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveThreadId(crypto.randomUUID())}
                  title="New thread"
                  className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent group cursor-pointer"
                >
                  <Plus
                    size={16}
                    className="text-muted-foreground group-hover:text-foreground transition-colors"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  title="Edit"
                  className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent group cursor-pointer"
                >
                  <Edit05
                    size={16}
                    className="text-muted-foreground group-hover:text-foreground transition-colors"
                  />
                </button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5"
                  disabled={isSaving}
                  onClick={() => setMode("chat")}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 gap-1.5"
                  disabled={!isDirty || isSaving}
                  onClick={() => void saveAndLock()}
                >
                  {isSaving ? (
                    <>
                      <Loading01 size={14} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </>
            )}
          </ViewActions>

          <div className="h-full">
            <AssistantChatPanel
              activeThreadId={activeThreadId}
              mode={mode}
              systemPrompt={systemPrompt}
              onSystemPromptChange={(value) =>
                setValue("system_prompt", value, { shouldDirty: true })
              }
              gatewayId={gatewayId}
              model={model}
              onGatewayChange={(id) =>
                setValue("gateway_id", id, { shouldDirty: true })
              }
              onModelChange={(m) =>
                setValue(
                  "model",
                  { id: m.id, connectionId: m.connectionId },
                  { shouldDirty: true },
                )
              }
              title={assistant.title}
              avatar={assistant.avatar}
              description={assistant.description}
            />
          </div>
        </ViewLayout>
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * AssistantDetailsView for use in collection-detail.tsx (WELL_KNOWN_VIEW_DETAILS).
 * Conforms to CollectionDetailsProps interface.
 */
export interface AssistantDetailsViewProps {
  itemId: string;
  onBack: () => void;
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}

export function AssistantDetailsView({
  itemId,
  onBack,
}: AssistantDetailsViewProps) {
  const params = useParams({ strict: false });
  const connectionId = params.connectionId ?? UNKNOWN_CONNECTION_ID;

  if (!connectionId || connectionId === UNKNOWN_CONNECTION_ID) {
    return (
      <div className="flex h-full w-full bg-background">
        <EmptyState
          title="Assistant not found"
          description="Missing connection information in the current route."
        />
      </div>
    );
  }

  return (
    <AssistantDetailContent
      providerId={connectionId}
      assistantId={itemId}
      onBack={onBack}
    />
  );
}
