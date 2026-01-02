import { UNKNOWN_CONNECTION_ID, createToolCaller } from "@/tools/client";
import { Chat } from "@/web/components/chat/chat";
import { GatewaySelector } from "@/web/components/chat/gateway-selector";
import { IceBreakers } from "@/web/components/chat/ice-breakers";
import { ModelSelector } from "@/web/components/chat/model-selector";
import { EmptyState } from "@/web/components/empty-state";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { PinToSidebarButton } from "@/web/components/pin-to-sidebar-button";
import {
  useCollectionActions,
  useCollectionItem,
} from "@/web/hooks/use-collections";
import {
  useGatewayPrompts,
  type GatewayPrompt,
} from "@/web/hooks/use-gateway-prompts";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { usePersistedChat } from "@/web/hooks/use-persisted-chat";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { DecoChatSkeleton } from "@deco/ui/components/deco-chat-skeleton.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@deco/ui/components/form.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { AssistantSchema } from "@decocms/bindings/assistant";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter, useRouterState } from "@tanstack/react-router";
import { Edit05, Loading01, Plus, Upload01, Users02 } from "@untitledui/icons";
import { Suspense, useRef, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { ViewActions, ViewLayout, ViewTabs } from "../layout";

/**
 * Ice breakers component that uses suspense to fetch gateway prompts
 */
function AssistantIceBreakers({
  gatewayId,
  onSelect,
}: {
  gatewayId: string;
  onSelect: (prompt: GatewayPrompt) => void;
}) {
  const { data: prompts } = useGatewayPrompts(gatewayId);

  if (prompts.length === 0) return null;

  return <IceBreakers prompts={prompts} onSelect={onSelect} className="mt-6" />;
}

type Assistant = z.infer<typeof AssistantSchema>;
type AssistantForm = UseFormReturn<Assistant>;

function AssistantEditForm({ form }: { form: AssistantForm }) {
  return (
    <Form {...form}>
      <div className="h-full py-6 flex flex-col max-w-2xl mx-auto w-full min-w-0 gap-6 overflow-y-auto">
        {/* Avatar and Basic Info */}
        <div className="flex gap-4 items-start">
          <FormField
            control={form.control}
            name="avatar"
            render={({ field }) => (
              <SmartAvatarUpload
                size="md"
                value={field.value}
                onChange={field.onChange}
                alt={form.watch("title")}
              />
            )}
          />
          <div className="flex flex-col gap-3 flex-1 min-w-0">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Untitled assistant"
                      className="h-9 rounded-lg border border-border bg-muted/20 shadow-none focus-visible:ring-0"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    Description
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Add a description…"
                      className="h-9 rounded-lg border border-border bg-muted/20 shadow-none focus-visible:ring-0"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Gateway and Model Selectors */}
        <div className="flex gap-4">
          <FormField
            control={form.control}
            name="gateway_id"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel className="text-xs text-muted-foreground">
                  Gateway
                </FormLabel>
                <GatewaySelector
                  selectedGatewayId={field.value}
                  onGatewayChange={field.onChange}
                  placeholder="Select gateway"
                  variant="bordered"
                  className="w-full"
                />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="model"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel className="text-xs text-muted-foreground">
                  Model
                </FormLabel>
                <ModelSelector
                  selectedModel={
                    field.value
                      ? {
                          id: field.value.id,
                          connectionId: field.value.connectionId,
                        }
                      : undefined
                  }
                  onModelChange={(m) =>
                    field.onChange({ id: m.id, connectionId: m.connectionId })
                  }
                  placeholder="Select model"
                  variant="bordered"
                  className="w-full"
                />
              </FormItem>
            )}
          />
        </div>

        {/* System Prompt */}
        <FormField
          control={form.control}
          name="system_prompt"
          render={({ field }) => (
            <FormItem className="flex-1 flex flex-col min-h-0">
              <FormLabel className="text-xs text-muted-foreground">
                System prompt
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="You are a helpful assistant..."
                  className="flex-1 min-h-[200px] resize-none text-base leading-relaxed font-normal rounded-xl border border-border bg-muted/20 px-4 py-3 shadow-none focus-visible:ring-0"
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </Form>
  );
}

interface AssistantChatPanelProps {
  activeThreadId: string;
  mode: "chat" | "edit";
  assistant: Assistant;
  form: AssistantForm;
}

function AssistantChatPanel({
  activeThreadId,
  mode,
  assistant,
  form,
}: AssistantChatPanelProps) {
  // Use the shared persisted chat hook with system prompt
  const chat = usePersistedChat({
    threadId: activeThreadId,
    systemPrompt: assistant.system_prompt,
  });

  // Chat config is valid when gateway and model are both configured
  const hasChatConfig =
    Boolean(assistant.gateway_id) &&
    Boolean(assistant.model?.id) &&
    Boolean(assistant.model?.connectionId);

  const handleSendMessage = async (text: string) => {
    if (!hasChatConfig) return;

    const metadata: Metadata = {
      created_at: new Date().toISOString(),
      thread_id: activeThreadId,
      model: {
        id: assistant.model.id,
        connectionId: assistant.model.connectionId,
      },
      gateway: { id: assistant.gateway_id ?? "" },
      user: { name: "you" },
    };

    await chat.sendMessage(text, metadata);
  };

  const emptyState = (
    <div className="flex flex-col items-center justify-center gap-4 p-4 text-center">
      <div className="flex flex-col items-center gap-4">
        {assistant.avatar ? (
          <div className="size-[60px] rounded-[18px] border border-border shrink-0 overflow-hidden">
            <img
              src={assistant.avatar}
              alt={assistant.title}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="size-[60px] rounded-[18px] border border-border shrink-0 overflow-hidden bg-muted/20 flex items-center justify-center">
            <Users02 size={28} className="text-muted-foreground" />
          </div>
        )}
        <h3 className="text-xl font-medium text-foreground">
          {assistant.title}
        </h3>
        {assistant.description ? (
          <div className="text-muted-foreground text-center text-sm max-w-md">
            {assistant.description}
          </div>
        ) : null}
      </div>

      {/* Ice Breakers */}
      {assistant.gateway_id && (
        <ErrorBoundary fallback={null}>
          <Suspense
            fallback={
              <div className="flex justify-center mt-6">
                <Loading01
                  size={20}
                  className="animate-spin text-muted-foreground"
                />
              </div>
            }
          >
            <AssistantIceBreakers
              gatewayId={assistant.gateway_id}
              onSelect={(prompt) => {
                handleSendMessage(prompt.description ?? prompt.name);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );

  const initialMessages = chat.messages.filter(
    (message) => message.role !== "system",
  );
  const isEditing = mode === "edit";

  return (
    <Chat>
      <Chat.Main className="h-full relative overflow-hidden">
        {/* Edit Form - fades in/out */}
        <div
          className={cn(
            "absolute inset-0 px-2 transition-opacity duration-200 ease-out",
            isEditing
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none",
          )}
        >
          <AssistantEditForm form={form} />
        </div>

        {/* Chat content - hidden in edit mode */}
        <div
          className={cn(
            "h-full transition-opacity duration-200 ease-out",
            isEditing ? "opacity-0 pointer-events-none" : "opacity-100",
          )}
        >
          {initialMessages.length === 0 ? (
            <Chat.EmptyState>{emptyState}</Chat.EmptyState>
          ) : (
            <Chat.Messages
              messages={chat.messages}
              status={chat.status}
              minHeightOffset={240}
            />
          )}
        </div>
      </Chat.Main>

      {/* Footer with chat input - slides down in edit mode */}
      <div
        className={cn(
          "transition-transform duration-300 ease-out",
          isEditing ? "translate-y-full" : "translate-y-0",
        )}
      >
        <Chat.Footer>
          <div className="max-w-2xl mx-auto w-full min-w-0">
            <Chat.Input
              onSubmit={handleSendMessage}
              onStop={chat.stop}
              disabled={!hasChatConfig}
              isStreaming={
                chat.status === "submitted" || chat.status === "streaming"
              }
              placeholder="Ask anything or @ for context"
              usageMessages={chat.messages}
            />
          </div>
        </Chat.Footer>
      </div>
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
  const routerState = useRouterState();
  const url = routerState.location.href;
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

  const form = useForm<Assistant>({
    resolver: zodResolver(AssistantSchema),
    values: assistant ?? undefined,
  });

  const saveAndLock = form.handleSubmit(async (data: Assistant) => {
    const updated = await actions.update.mutateAsync({ id: assistantId, data });
    form.reset(updated);
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
          {/* Header is always read-only */}
          <ViewTabs>
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
                    <span className="text-xs text-muted-foreground font-normal truncate min-w-0 max-w-[20ch]">
                      {assistant.description}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </ViewTabs>

          <ViewActions>
            <PinToSidebarButton
              title={assistant.title}
              url={url}
              icon={assistant.avatar ?? "assistant"}
            />
            {mode === "chat" ? (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        onClick={() => setActiveThreadId(crypto.randomUUID())}
                        title="New thread"
                        aria-label="New thread"
                        variant="outline"
                        size="icon"
                        className="size-7 border border-input"
                      >
                        <Plus size={16} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>New thread</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        onClick={() => setMode("edit")}
                        title="Edit"
                        aria-label="Edit"
                        variant="outline"
                        size="icon"
                        className="size-7 border border-input"
                      >
                        <Edit05 size={16} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
                  disabled={!form.formState.isDirty || isSaving}
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
              key={form.formState.submitCount}
              activeThreadId={activeThreadId}
              mode={mode}
              assistant={assistant}
              form={form}
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
