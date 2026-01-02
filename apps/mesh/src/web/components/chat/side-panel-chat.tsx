import { EmptyState } from "@/web/components/empty-state";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { DecoChatEmptyState } from "@deco/ui/components/deco-chat-empty-state.tsx";
import { CpuChip02, Plus, X, Loading01, CornerUpLeft } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Chat, useGateways, useModels, type ModelChangePayload } from "./chat";
import { toast } from "sonner";
import { useThreads, useMessageActions } from "../../hooks/use-chat-store";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "../../lib/localstorage-keys";
import { useChat } from "../../providers/chat-provider";
import { ThreadHistoryPopover } from "./thread-history-popover";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { usePersistedChat } from "../../hooks/use-persisted-chat";
import { useConnections } from "../../hooks/collections/use-connection";
import { useBindingConnections } from "../../hooks/use-binding";
import { useSystemPrompt } from "../../hooks/use-system-prompt";
import {
  useGatewayPrompts,
  type GatewayPrompt,
} from "../../hooks/use-gateway-prompts";
import { IceBreakers } from "./ice-breakers";
import { Suspense, useState } from "react";
import { ErrorBoundary } from "../error-boundary";

// Capybara avatar URL from decopilotAgent
const CAPYBARA_AVATAR_URL =
  "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png";

/**
 * Ice breakers component that uses suspense to fetch gateway prompts
 */
function GatewayIceBreakers({
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

export function ChatPanel() {
  const {
    org: { slug: orgSlug },
    locator,
  } = useProjectContext();
  const [, setOpen] = useDecoChatOpen();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const { createThread, activeThreadId, setActiveThreadId, hideThread } =
    useChat();
  const { threads, refetch } = useThreads();

  // Fetch gateways and models directly from hooks
  const gateways = useGateways();
  const models = useModels();

  // Check for LLM binding connection
  const allConnections = useConnections();
  const [modelsConnection] = useBindingConnections({
    connections: allConnections,
    binding: "LLMS",
  });

  const hasModelsBinding = Boolean(modelsConnection);
  const hasGateways = gateways.length > 0;
  const hasRequiredSetup = hasModelsBinding && hasGateways;

  const [selectedModelState, setSelectedModelState] = useLocalStorage<{
    id: string;
    connectionId: string;
  } | null>(
    LOCALSTORAGE_KEYS.chatSelectedModel(locator),
    (existing) => existing ?? null,
  );

  const [selectedGatewayState, setSelectedGatewayState] = useLocalStorage<{
    gatewayId: string;
  } | null>(`${locator}:selected-gateway`, () => null);

  const defaultModel = models[0];
  const effectiveSelectedModelState =
    selectedModelState ??
    (defaultModel
      ? { id: defaultModel.id, connectionId: defaultModel.connectionId }
      : null);

  const defaultGatewayId = gateways[0]?.id;
  const effectiveSelectedGatewayId =
    selectedGatewayState?.gatewayId ?? defaultGatewayId;

  const selectedGateway = gateways.find(
    (g) => g.id === effectiveSelectedGatewayId,
  );
  const selectedModel = models.find(
    (m) =>
      m.id === effectiveSelectedModelState?.id &&
      m.connectionId === effectiveSelectedModelState?.connectionId,
  );

  // Generate dynamic system prompt based on context
  const systemPrompt = useSystemPrompt();

  // Message actions for copying messages to new thread
  const messageActions = useMessageActions();

  // State for controlled input (when branching)
  const [inputValue, setInputValue] = useState("");

  // State to track if we're editing from a branch (shows the original message preview)
  const [branchContext, setBranchContext] = useState<{
    originalThreadId: string;
    originalMessageId: string;
    originalMessageText: string;
  } | null>(null);

  // Use shared persisted chat hook - must be called unconditionally (Rules of Hooks)
  const chat = usePersistedChat({
    threadId: activeThreadId,
    systemPrompt,
    onCreateThread: (thread) =>
      createThread({ id: thread.id, title: thread.title }),
  });

  // Handle branching from a specific message
  const handleBranchFromMessage = async (
    messageId: string,
    messageText: string,
  ) => {
    // Find the index of the message to branch from
    const messageIndex = chat.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    // Save the original thread context before switching
    const originalThreadId = activeThreadId;

    // Get messages to copy (before the clicked message, excluding system)
    const messagesToCopy = chat.messages
      .slice(0, messageIndex)
      .filter((m) => m.role !== "system");

    // Create a new thread
    const newThreadId = crypto.randomUUID();

    // Copy messages to the new thread with new IDs and updated thread_id
    if (messagesToCopy.length > 0) {
      const copiedMessages = messagesToCopy.map((msg) => ({
        ...msg,
        id: crypto.randomUUID(),
        metadata: {
          ...msg.metadata,
          thread_id: newThreadId,
          created_at: msg.metadata?.created_at || new Date().toISOString(),
        },
      }));

      // Insert copied messages into IndexedDB
      await messageActions.insertMany.mutateAsync(copiedMessages);
    }

    // Switch to the new thread
    setActiveThreadId(newThreadId);

    // Set the message text in the input for editing
    setInputValue(messageText);

    // Track the original context for the preview (allows navigating back)
    setBranchContext({
      originalThreadId,
      originalMessageId: messageId,
      originalMessageText: messageText,
    });
  };

  // Handle clicking on the branch preview to go back to original thread
  const handleGoToOriginalMessage = () => {
    if (!branchContext) return;
    setActiveThreadId(branchContext.originalThreadId);
    // Clear the branch context since we're going back
    setBranchContext(null);
    setInputValue("");
  };

  // Clear editing state when message is sent
  const handleInputChange = (value: string) => {
    setInputValue(value);
    // If user clears the input, clear the editing state
    if (!value.trim()) {
      setBranchContext(null);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!selectedModel) {
      toast.error("No model configured");
      return;
    }

    const metadata: Metadata = {
      created_at: new Date().toISOString(),
      thread_id: activeThreadId,
      model: {
        id: selectedModel.id,
        connectionId: selectedModel.connectionId,
        provider: selectedModel.provider ?? undefined,
      },
      gateway: selectedGateway ? { id: selectedGateway.id } : undefined,
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
    };

    // Clear editing state after sending
    setBranchContext(null);

    await chat.sendMessage(text, metadata);
  };

  const handleModelChange = (m: ModelChangePayload) => {
    setSelectedModelState({ id: m.id, connectionId: m.connectionId });
  };

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
      <Chat>
        <Chat.Header>
          <Chat.Header.Left>
            <img
              src={CAPYBARA_AVATAR_URL}
              alt="deco chat"
              className="size-5 rounded"
            />
            <span className="text-sm font-medium">deco chat</span>
          </Chat.Header.Left>
          <Chat.Header.Right>
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
          </Chat.Header.Right>
        </Chat.Header>

        <Chat.Main className="flex flex-col items-center">
          <Chat.EmptyState>
            <EmptyState
              title={title}
              description={description}
              actions={
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate({
                      to: hasModelsBinding ? "/$org/gateways" : "/$org/mcps",
                      params: { org: orgSlug },
                      search: hasModelsBinding
                        ? undefined
                        : { action: "create" },
                    })
                  }
                >
                  {hasModelsBinding ? "Create gateway" : "Add connection"}
                </Button>
              }
            />
          </Chat.EmptyState>
        </Chat.Main>
      </Chat>
    );
  }
  const initialMessages = chat.messages.filter(
    (message) => message.role !== "system",
  );

  return (
    <Chat>
      <Chat.Header>
        <Chat.Header.Left>
          <IntegrationIcon
            icon={selectedGateway?.icon}
            name={selectedGateway?.title || "deco chat"}
            size="xs"
            fallbackIcon={<CpuChip02 size={12} />}
          />
          <span className="text-sm font-medium">
            {selectedGateway?.title || "deco chat"}
          </span>
        </Chat.Header.Left>
        <Chat.Header.Right>
          <button
            type="button"
            onClick={() => createThread()}
            className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent group cursor-pointer"
            title="New chat"
          >
            <Plus
              size={16}
              className="text-muted-foreground group-hover:text-foreground transition-colors"
            />
          </button>
          <ThreadHistoryPopover
            threads={threads}
            activeThreadId={activeThreadId}
            onSelectThread={setActiveThreadId}
            onRemoveThread={hideThread}
            onOpen={() => refetch()}
          />
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
        </Chat.Header.Right>
      </Chat.Header>

      <Chat.Main>
        {initialMessages.length === 0 ? (
          <Chat.EmptyState>
            <div className="flex flex-col items-center gap-6 w-full px-4">
              <DecoChatEmptyState
                title={selectedGateway?.title || "Ask deco chat"}
                description={
                  selectedGateway?.description ??
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
              {effectiveSelectedGatewayId && (
                <ErrorBoundary key={effectiveSelectedGatewayId} fallback={null}>
                  <Suspense
                    fallback={
                      <div className="flex justify-center">
                        <Loading01
                          size={20}
                          className="animate-spin text-muted-foreground"
                        />
                      </div>
                    }
                  >
                    <GatewayIceBreakers
                      gatewayId={effectiveSelectedGatewayId}
                      onSelect={(prompt) => {
                        // Submit the prompt name as the first message
                        handleSendMessage(prompt.description ?? prompt.name);
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </div>
          </Chat.EmptyState>
        ) : (
          <Chat.Messages
            messages={chat.messages}
            status={chat.status}
            minHeightOffset={240}
            onBranchFromMessage={handleBranchFromMessage}
          />
        )}
      </Chat.Main>

      <Chat.Footer>
        <div className="flex flex-col gap-2">
          {/* Original message preview when editing from a branch */}
          {branchContext && (
            <button
              type="button"
              onClick={handleGoToOriginalMessage}
              className="flex items-start gap-2 px-2 py-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/50 text-sm hover:bg-muted transition-colors cursor-pointer text-left w-full"
              title="Click to view original message"
            >
              <CornerUpLeft
                size={14}
                className="text-muted-foreground mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-1">
                  Editing message (click to view original):
                </div>
                <div className="text-muted-foreground/70 line-clamp-2">
                  {branchContext.originalMessageText}
                </div>
              </div>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setBranchContext(null);
                  setInputValue("");
                }}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Cancel editing"
              >
                <X size={14} />
              </span>
            </button>
          )}
          <Chat.Input
            onSubmit={handleSendMessage}
            onStop={chat.stop}
            disabled={models.length === 0 || !effectiveSelectedModelState}
            isStreaming={
              chat.status === "submitted" || chat.status === "streaming"
            }
            placeholder={
              branchContext
                ? "Edit your message..."
                : models.length === 0
                  ? "Add an LLM binding connection to start chatting"
                  : "Ask anything or @ for context"
            }
            usageMessages={chat.messages}
            value={inputValue}
            onValueChange={handleInputChange}
          >
            <Chat.Input.GatewaySelector
              disabled={false}
              selectedGatewayId={effectiveSelectedGatewayId}
              onGatewayChange={(gatewayId) => {
                if (!gatewayId) return;
                setSelectedGatewayState({ gatewayId });
              }}
            />
            <Chat.Input.ModelSelector
              disabled={false}
              selectedModel={effectiveSelectedModelState ?? undefined}
              onModelChange={handleModelChange}
            />
          </Chat.Input>
        </div>
      </Chat.Footer>
    </Chat>
  );
}
