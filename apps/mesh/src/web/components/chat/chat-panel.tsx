import { EmptyState } from "@/web/components/empty-state";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useLLMsFromConnection } from "@/web/hooks/collections/use-llm";
import { useBindingConnections } from "@/web/hooks/use-binding";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { useChat as useAiChat } from "@ai-sdk/react";
import { Button } from "@deco/ui/components/button.tsx";
import { GatewaySelector } from "@/web/components/chat/gateway-selector";
import { DecoChatAside } from "@deco/ui/components/deco-chat-aside.tsx";
import { DecoChatEmptyState } from "@deco/ui/components/deco-chat-empty-state.tsx";
import { DecoChatInputV2 } from "@deco/ui/components/deco-chat-input-v2.tsx";
import { DecoChatModelSelectorRich } from "@deco/ui/components/deco-chat-model-selector-rich.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { X, Plus, CpuChip02, Clock, Trash01, SearchMd } from "@untitledui/icons";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { useNavigate } from "@tanstack/react-router";
import { type ChatInit, DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getThreadFromIndexedDB,
  useMessageActions,
  useThreadActions,
  useThreadMessages,
  useThreads,
} from "../../hooks/use-chat-store";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "../../lib/localstorage-keys";
import { useChat } from "../../providers/chat-provider";
import type { Message, Thread } from "../../types/chat-threads";
import { MessageAssistant } from "./message-assistant.tsx";
import { MessageFooter, MessageList } from "./message-list.tsx";
import { MessageUser } from "./message-user.tsx";
import { UsageStats } from "./usage-stats.tsx";

// Capybara avatar URL from decopilotAgent
const CAPYBARA_AVATAR_URL =
  "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png";

// Create transport for models stream API (stable across model changes)
const createModelsTransport = (
  org: string,
): DefaultChatTransport<UIMessage<Metadata>> =>
  new DefaultChatTransport<UIMessage<Metadata>>({
    api: `/api/${org}/models/stream`,
    credentials: "include",
    prepareSendMessagesRequest: ({ messages, requestMetadata }) => ({
      body: {
        messages,
        stream: true,
        ...(requestMetadata as Metadata | undefined),
      },
    }),
  });

function ChatInput({
  onSubmit,
  onStop,
  disabled,
  isStreaming,
  placeholder,
  leftActions,
}: {
  onSubmit: (text: string) => Promise<void>;
  onStop: () => void;
  disabled: boolean;
  isStreaming: boolean;
  placeholder: string;
  leftActions: React.ReactNode;
}) {
  const [input, setInput] = useState("");

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input?.trim() || isStreaming) {
      return;
    }
    const text = input.trim();
    try {
      await onSubmit(text);
      // Only clear input after successful submission so user can retry
      setInput("");
    } catch (error) {
      console.error("Failed to send message:", error);
      const message =
        error instanceof Error ? error.message : "Failed to send message";
      toast.error(message);
    }
  };

  return (
    <DecoChatInputV2
      value={input}
      onChange={setInput}
      onSubmit={handleSubmit}
      onStop={onStop}
      disabled={disabled}
      isStreaming={isStreaming}
      placeholder={placeholder}
      leftActions={leftActions}
    />
  );
}

type ThreadSection = {
  label: string;
  threads: Thread[];
  showRelativeTime: boolean;
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  return `${diffHours}h`;
}

function groupThreadsByDate(threads: Thread[]): ThreadSection[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const last7Days = new Date(today.getTime() - 7 * 86400000);
  const last30Days = new Date(today.getTime() - 30 * 86400000);

  const todayThreads: Thread[] = [];
  const yesterdayThreads: Thread[] = [];
  const last7DaysThreads: Thread[] = [];
  const last30DaysThreads: Thread[] = [];
  const olderThreads: Thread[] = [];

  for (const thread of threads) {
    const date = new Date(thread.updated_at);
    if (date >= today) {
      todayThreads.push(thread);
    } else if (date >= yesterday) {
      yesterdayThreads.push(thread);
    } else if (date >= last7Days) {
      last7DaysThreads.push(thread);
    } else if (date >= last30Days) {
      last30DaysThreads.push(thread);
    } else {
      olderThreads.push(thread);
    }
  }

  const result: ThreadSection[] = [];
  if (todayThreads.length > 0) {
    result.push({ label: "Today", threads: todayThreads, showRelativeTime: true });
  }
  if (yesterdayThreads.length > 0) {
    result.push({ label: "Yesterday", threads: yesterdayThreads, showRelativeTime: false });
  }
  if (last7DaysThreads.length > 0) {
    result.push({ label: "7 days ago", threads: last7DaysThreads, showRelativeTime: false });
  }
  if (last30DaysThreads.length > 0) {
    result.push({ label: "30 days ago", threads: last30DaysThreads, showRelativeTime: false });
  }
  if (olderThreads.length > 0) {
    result.push({ label: "Older", threads: olderThreads, showRelativeTime: false });
  }

  return result;
}

function ThreadHistoryPopover() {
  const { threads, refetch } = useThreads();
  const { activeThreadId, setActiveThreadId, hideThread } = useChat();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredThreads = searchQuery.trim()
    ? threads.filter((thread) =>
        (thread.title || "New chat")
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
      )
    : threads;

  const sections = groupThreadsByDate(filteredThreads);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      refetch();
    } else {
      setSearchQuery("");
    }
  };

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent group cursor-pointer"
          title="Chat history"
        >
          <Clock
            size={16}
            className="text-muted-foreground group-hover:text-foreground transition-colors"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <SearchMd
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {filteredThreads.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {searchQuery.trim() ? "No chats found" : "No chats yet"}
            </div>
          ) : (
            sections.map((section, sectionIndex) => (
              <div key={section.label}>
                {sectionIndex > 0 && <div className="border-t mx-3" />}
                <div className="px-3 py-1">
                  <span className="text-xs font-medium text-muted-foreground tracking-wide">
                    {section.label}
                  </span>
                </div>
                {section.threads.map((thread) => {
                  const isActive = thread.id === activeThreadId;
                  return (
                    <div
                      key={thread.id}
                      className={`flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer group ${
                        isActive ? "bg-accent/50" : ""
                      }`}
                      onClick={() => setActiveThreadId(thread.id)}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-sm truncate">
                          {thread.title || "New chat"}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {isActive
                            ? "current"
                            : section.showRelativeTime
                              ? formatRelativeTime(thread.updated_at)
                              : null}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          hideThread(thread.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-opacity"
                        title="Remove chat"
                      >
                        <Trash01
                          size={14}
                          className="text-muted-foreground hover:text-destructive"
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ChatPanel() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const { org, locator } = useProjectContext();
  const [, setOpen] = useDecoChatOpen();
  const navigate = useNavigate();

  // Use thread management from ChatProvider
  const { createThread, activeThreadId } = useChat();

  // Sentinel ref for auto-scrolling to bottom
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Get mutation actions for persistence
  const threadActions = useThreadActions();
  const messageActions = useMessageActions();

  // Messages for active thread
  const messages = useThreadMessages(activeThreadId);

  // Persist selected model (including connectionId) per organization in localStorage
  const [selectedModelState, setSelectedModelState] = useLocalStorage<{
    id: string;
    connectionId: string;
  } | null>(
    LOCALSTORAGE_KEYS.chatSelectedModel(locator),
    (existing) => existing ?? null,
  );

  // Persist selected gateway per organization in localStorage
  const [selectedGatewayState, setSelectedGatewayState] = useLocalStorage<{
    gatewayId: string;
  } | null>(`${locator}:selected-gateway`, () => null);

  // Create transport (stable, doesn't depend on selected model)
  const transport = createModelsTransport(org.slug);

  const onFinish: ChatInit<UIMessage<Metadata>>["onFinish"] = async (
    result,
  ) => {
    const { finishReason, messages, isAbort, isDisconnect, isError } = result;

    if (finishReason !== "stop" || isAbort || isDisconnect || isError) {
      return;
    }

    // Grab the last 2 messages, one for user another for assistant
    const newMessages = messages.slice(-2).filter(Boolean) as Message[];

    if (newMessages.length === 2) {
      // 1. Insert all messages at once (batch insertion)
      messageActions.insertMany.mutate(newMessages);

      const title =
        newMessages
          .find((m) => m.parts?.find((part) => part.type === "text"))
          ?.parts?.find((part) => part.type === "text")
          ?.text.slice(0, 100) || "";

      // Check if thread exists in IndexedDB
      const existingThread = await getThreadFromIndexedDB(
        locator,
        activeThreadId,
      );

      if (!existingThread) {
        createThread({ id: activeThreadId, title });
      } else {
        threadActions.update.mutate({
          id: activeThreadId,
          updates: {
            title: existingThread.title || title,
            updated_at: new Date().toISOString(),
          },
        });
      }
    }
  };

  const onError = (error: Error) => {
    console.error("[deco-chat] Chat error:", error);
  };

  // Use AI SDK's useChat hook
  const chat = useAiChat<UIMessage<Metadata>>({
    id: activeThreadId,
    messages,
    transport,
    onFinish,
    onError,
  });

  const { status } = chat;

  // Get all connections
  const allConnections = useConnections();

  // Filter connections by binding type for LLMs
  const [modelsConnection] = useBindingConnections({
    connections: allConnections,
    binding: "LLMS",
  });

  // Fetch models from the first LLM connection
  const modelsData = useLLMsFromConnection(modelsConnection?.id);

  // Fetch all gateways for the organization
  const gateways = useGateways();

  // Transform models for UI display
  const models =
    !modelsData || !modelsConnection
      ? []
      : modelsData
          .map((model) => ({
            ...model,
            name: model.title,
            contextWindow: model.limits?.contextWindow,
            outputLimit: model.limits?.maxOutputTokens,
            inputCost: model.costs?.input,
            outputCost: model.costs?.output,
            provider: model.provider,
            connectionId: modelsConnection.id,
            connectionName: modelsConnection.title,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

  // Initialize with first model
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (models.length > 0 && !selectedModelState) {
      const firstModel = models[0];
      if (firstModel) {
        setSelectedModelState({
          id: firstModel.id,
          connectionId: firstModel.connectionId,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsData, modelsConnection, selectedModelState, setSelectedModelState]);

  // Initialize with first gateway
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (gateways.length > 0 && !selectedGatewayState) {
      const firstGateway = gateways[0];
      if (firstGateway) {
        setSelectedGatewayState({
          gatewayId: firstGateway.id,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateways, selectedGatewayState, setSelectedGatewayState]);

  // Get selected model info
  const selectedModel = models.find(
    (m) =>
      m.id === selectedModelState?.id &&
      m.connectionId === selectedModelState?.connectionId,
  );

  // Get selected gateway info
  const selectedGateway = gateways.find(
    (g) => g.id === selectedGatewayState?.gatewayId,
  );

  const isEmpty = chat.messages.length === 0;

  // Track the last message count to detect when assistant starts responding
  const lastMessageCountRef = useRef(chat.messages.length);
  const lastScrolledCountRef = useRef(0);

  // Scroll when a new message appears (assistant starts responding)
  if (
    chat.messages.length > lastMessageCountRef.current &&
    lastScrolledCountRef.current !== chat.messages.length
  ) {
    queueMicrotask(() => {
      if (sentinelRef.current) {
        sentinelRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        lastScrolledCountRef.current = chat.messages.length;
      }
    });
  }
  lastMessageCountRef.current = chat.messages.length;

  // Transform gateways to selector options
  const gatewaySelectorOptions = gateways.map((gateway) => ({
    id: gateway.id,
    title: gateway.title,
    icon: gateway.icon,
    description: gateway.description,
    fallbackIcon: <CpuChip02 />, // Consistent with gateways page
  }));

  const handleSendMessage = async (text: string) => {
    if (!text?.trim() || status === "submitted" || status === "streaming") {
      return;
    }

    if (!selectedModel) {
      // Console error kept for critical missing configuration
      console.error("No model configured");
      return;
    }

    // Prepare metadata with model and gateway configuration
    const metadata: Metadata = {
      created_at: new Date().toISOString(),
      thread_id: activeThreadId,
      model: selectedModel,
      gateway: selectedGateway ? { id: selectedGateway.id } : undefined,
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
    };

    await chat.sendMessage(
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
        metadata,
      },
      { metadata },
    );
  };

  const handleStop = () => {
    chat.stop?.();
  };

  // Check if required components are present
  const hasModelsBinding = !!modelsConnection;
  const hasGateways = gateways.length > 0;
  const hasRequiredSetup = hasModelsBinding && hasGateways;

  // If missing requirements, show empty state with appropriate message
  if (!hasRequiredSetup) {
    let title: string;
    let description: string;

    if (!hasModelsBinding && !hasGateways) {
      title = "Connect your providers";
      description =
        "Connect an LLM provider and create a gateway to unlock AI-powered features.";
    } else if (!hasModelsBinding) {
      title = "No model provider connected";
      description =
        "Connect to a model provider to unlock AI-powered features.";
    } else {
      title = "No gateways configured";
      description = "Create a gateway to expose your MCP tools to the chat.";
    }

    return (
      <DecoChatAside className="h-full">
        <DecoChatAside.Header>
          <div className="flex items-center gap-2">
            <img
              src={CAPYBARA_AVATAR_URL}
              alt="deco chat"
              className="size-5 rounded"
            />
            <span className="text-sm font-medium">deco chat</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent transition-colors group cursor-pointer"
              title="Close chat"
            >
              <X
                size={16}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </button>
          </div>
        </DecoChatAside.Header>
        <DecoChatAside.Content className="flex flex-col items-center">
          <EmptyState
            title={title}
            description={description}
            actions={
              <Button
                variant="outline"
                onClick={() =>
                  navigate({
                    to: hasModelsBinding ? "/$org/gateways" : "/$org/mcps",
                    params: { org: org.slug },
                    search: hasModelsBinding ? undefined : { action: "create" },
                  })
                }
              >
                {hasModelsBinding ? "Create gateway" : "Add connection"}
              </Button>
            }
          />
        </DecoChatAside.Content>
      </DecoChatAside>
    );
  }

  return (
    <DecoChatAside className="h-full">
      <DecoChatAside.Header>
        <div className="flex items-center gap-2">
          <IntegrationIcon
            icon={selectedGateway?.icon}
            name={selectedGateway?.title || "deco chat"}
            size="xs"
            fallbackIcon={<CpuChip02 size={12} />}
          />
          <span className="text-sm font-medium">
            {selectedGateway?.title || "deco chat"}
          </span>
        </div>
        <div className="flex items-center gap-1">
        <button
              type="button"
              onClick={() => {
                createThread();
              }}
              className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent group cursor-pointer"
              title="New chat"
            >
              <Plus
                size={16}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </button>
            <ThreadHistoryPopover />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent transition-colors group cursor-pointer"
            title="Close chat"
          >
            <X
              size={16}
              className="text-muted-foreground group-hover:text-foreground transition-colors"
            />
          </button>
        </div>
      </DecoChatAside.Header>

      <DecoChatAside.Content>
        {isEmpty ? (
          <DecoChatEmptyState
            title={selectedGateway?.title || "Ask deco chat"}
            description={
              selectedGateway?.description ||
              "Ask anything about configuring model providers or using MCP Mesh."
            }
            avatarNode={
              <IntegrationIcon
                icon={selectedGateway?.icon}
                name={selectedGateway?.title || "deco chat"}
                size="lg"
                fallbackIcon={<CpuChip02 size={32} />}
                className="size-[60px]! rounded-[18px]!"
              />
            }
          />
        ) : (
          <MessageList minHeightOffset={240}>
            {chat.messages.map((message, index) =>
              message.role === "user" ? (
                <MessageUser
                  key={message.id}
                  message={message as UIMessage<Metadata>}
                />
              ) : message.role === "assistant" ? (
                <MessageAssistant
                  key={message.id}
                  message={message as UIMessage<Metadata>}
                  status={
                    index === chat.messages.length - 1 ? status : undefined
                  }
                />
              ) : null,
            )}
            <MessageFooter>
              <div ref={sentinelRef} className="h-0" />
            </MessageFooter>
          </MessageList>
        )}
      </DecoChatAside.Content>

      <DecoChatAside.Footer>
        <ChatInput
          onSubmit={handleSendMessage}
          onStop={handleStop}
          disabled={models.length === 0 || !selectedModelState}
          isStreaming={status === "submitted" || status === "streaming"}
          placeholder={
            models.length === 0
              ? "Add an LLM binding connection to start chatting"
              : "Ask anything or @ for context"
          }
          leftActions={
            <div className="flex items-center gap-2">
              {/* Gateway Selector */}
              {gateways.length > 0 && (
                <GatewaySelector
                  gateways={gatewaySelectorOptions}
                  selectedGatewayId={selectedGatewayState?.gatewayId}
                  onGatewayChange={(gatewayId) => {
                    if (!gatewayId) return;
                    setSelectedGatewayState({ gatewayId });
                  }}
                  placeholder="Gateway"
                  variant="bordered"
                />
              )}
              {/* Model Selector - Rich style */}
              {models.length > 0 && (
                <DecoChatModelSelectorRich
                  models={models}
                  selectedModelId={selectedModelState?.id}
                  onModelChange={(modelId) => {
                    if (!modelId) return;
                    const model = models.find((m) => m.id === modelId);
                    if (model) {
                      setSelectedModelState({
                        id: model.id,
                        connectionId: model.connectionId,
                      });
                    }
                  }}
                  placeholder="Model"
                  variant="borderless"
                />
              )}
              <UsageStats messages={chat.messages} />
            </div>
          }
        />
      </DecoChatAside.Footer>
    </DecoChatAside>
  );
}
