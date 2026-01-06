/**
 * Organization Home Page
 *
 * Full-page chat interface that starts with a centered greeting and input.
 * When a message is sent, transitions to normal chat with input at the bottom.
 */

import { useProjectContext } from "@/web/providers/project-context-provider";
import { authClient } from "@/web/lib/auth-client";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { useConnections } from "../../../hooks/collections/use-connection";
import { useBindingConnections } from "../../../hooks/use-binding";
import { useInvalidateCollectionsOnToolCall } from "../../../hooks/use-invalidate-collections-on-tool-call";
import { useLocalStorage } from "../../../hooks/use-local-storage";
import { usePersistedChat } from "../../../hooks/use-persisted-chat";
import { LOCALSTORAGE_KEYS } from "../../../lib/localstorage-keys";
import { useChat } from "../../../components/chat/chat-context";
import {
  Chat,
  GatewaySelector,
  ModelSelector,
  UsageStats,
  useGateways,
  useModels,
} from "../../../components/chat/index";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { CpuChip02, Plus } from "@untitledui/icons";
import { ChatProvider } from "../../../components/chat/chat-context";
import { ThreadHistoryPopover } from "../../../components/chat/thread-history-popover";
import { useThreads } from "../../../hooks/use-chat-store";
import { IntegrationIcon } from "../../../components/integration-icon";

function useSystemPrompt(_gatewayId?: string): string {
  return `You are an AI assistant running in an MCP Mesh environment.

## About MCP Mesh
The Model Context Protocol (MCP) Mesh allows users to connect external MCP servers and expose their capabilities through gateways. Each gateway provides access to a curated set of tools from connected MCP servers.

## Important Notes
- All tool calls are logged and audited for security and compliance
- You have access to the tools exposed through the selected gateway
- MCPs may expose resources that users can browse and edit
- You have context to the current gateway and its tools, resources, and prompts

Help the user understand and work with this resource.
`;
}

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return "Morning";
  } else if (hour >= 12 && hour < 17) {
    return "Afternoon";
  } else if (hour >= 17 && hour < 22) {
    return "Evening";
  } else {
    return "Night";
  }
}

function OrgHomePageContent() {
  const { locator } = useProjectContext();
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
  const systemPrompt = useSystemPrompt(effectiveSelectedGatewayId);

  // Get the onToolCall handler for invalidating collection queries
  const onToolCall = useInvalidateCollectionsOnToolCall();

  // Use shared persisted chat hook - must be called unconditionally (Rules of Hooks)
  const chat = usePersistedChat({
    threadId: activeThreadId,
    systemPrompt,
    onToolCall,
    onCreateThread: (thread) =>
      createThread({ id: thread.id, title: thread.title }),
  });

  // Get input and branching state from context
  const { inputValue, setInputValue, branchContext, clearBranch } = useChat();

  const { isEmpty } = chat;
  const prevThreadIdRef = useRef(activeThreadId);
  const [hasStartedChat, setHasStartedChat] = useState(!isEmpty);

  // Reset to centered view when thread changes (new thread created)
  if (prevThreadIdRef.current !== activeThreadId) {
    prevThreadIdRef.current = activeThreadId;
    if (isEmpty) {
      setHasStartedChat(false);
    }
  }

  const shouldShowCentered = isEmpty && !hasStartedChat;

  const handleSendMessage = async (text: string) => {
    if (!selectedModel) {
      toast.error("No model configured");
      return;
    }

    if (!selectedGateway?.id) {
      toast.error("No gateway configured");
      return;
    }

    // Mark chat as started
    if (!hasStartedChat) {
      setHasStartedChat(true);
    }

    // Clear input
    setInputValue("");

    // Clear editing state before sending
    clearBranch();

    const metadata: Metadata = {
      created_at: new Date().toISOString(),
      thread_id: activeThreadId,
      model: {
        id: selectedModel.id,
        connectionId: selectedModel.connectionId,
        provider: selectedModel.provider ?? undefined,
      },
      gateway: { id: selectedGateway.id },
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
    };

    await chat.sendMessage(text, metadata);
  };

  const handleModelChange = (model: { id: string; connectionId: string }) => {
    setSelectedModelState(model);
  };

  const handleGatewayChange = (gatewayId: string) => {
    setSelectedGatewayState({ gatewayId });
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
        <Chat.Main className="flex flex-col items-center justify-center">
          <Chat.EmptyState>
            <div className="text-center space-y-4">
              <CpuChip02 size={48} className="mx-auto text-muted-foreground" />
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </Chat.EmptyState>
        </Chat.Main>
      </Chat>
    );
  }

  const userName = user?.name || "there";
  const timeGreeting = getTimeBasedGreeting();

  return (
    <Chat className="h-full">
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
        </Chat.Header.Right>
      </Chat.Header>

      <Chat.Main>
        {shouldShowCentered ? (
          <div className="h-full flex flex-col items-center justify-center px-4">
            <div className="max-w-2xl w-full space-y-8">
              {/* Greeting */}
              <div className="text-center space-y-2">
                <h1 className="text-2xl">
                  {timeGreeting}, {userName}!
                  <br />
                  <span className="text-muted-foreground">
                    What are we building today?
                  </span>
                </h1>
              </div>

              {/* Centered Input */}
              <div className="flex justify-center">
                <div className="w-full max-w-2xl [&>form>div]:shadow-md transition-all duration-300">
                  <Chat.Input
                    value={inputValue}
                    onChange={setInputValue}
                    onSubmit={async () => {
                      if (!inputValue.trim()) return;
                      await handleSendMessage(inputValue.trim());
                    }}
                    onStop={chat.stop}
                    disabled={!selectedModel || !selectedGateway?.id}
                    isStreaming={
                      chat.status === "submitted" || chat.status === "streaming"
                    }
                    placeholder={
                      !selectedModel
                        ? "Select a model to start chatting"
                        : "Ask anything or @ for context"
                    }
                  >
                    <GatewaySelector
                      selectedGatewayId={selectedGateway?.id}
                      onGatewayChange={handleGatewayChange}
                      placeholder="Gateway"
                      variant="borderless"
                    />
                    <ModelSelector
                      selectedModel={selectedModel ?? undefined}
                      onModelChange={handleModelChange}
                      placeholder="Model"
                      variant="borderless"
                    />
                  </Chat.Input>
                </div>
              </div>
            </div>
          </div>
        ) : isEmpty ? (
          <Chat.EmptyState>
            <div className="flex flex-col items-center gap-6 w-full px-4">
              <div className="flex flex-col items-center justify-center gap-4 p-0 text-center">
                <CpuChip02 size={60} className="text-muted-foreground" />
                <h3 className="text-xl font-medium text-foreground">
                  {selectedGateway?.title || "Ask deco chat"}
                </h3>
                <div className="text-muted-foreground text-center text-sm max-w-md">
                  {selectedGateway?.description ??
                    "Ask anything about configuring model providers or using MCP Mesh."}
                </div>
              </div>
            </div>
          </Chat.EmptyState>
        ) : (
          <Chat.Messages
            messages={chat.messages}
            status={chat.status}
            minHeightOffset={240}
          />
        )}
      </Chat.Main>

      {/* Footer with input - only show when chat has started */}
      {hasStartedChat && (
        <Chat.Footer className="animate-[slideUpFade_0.3s_ease-out]">
          <div className="flex flex-col gap-2">
            <Chat.BranchPreview
              branchContext={branchContext}
              clearBranchContext={clearBranch}
              onGoToOriginalMessage={() => {
                if (!branchContext) return;
                setActiveThreadId(branchContext.originalThreadId);
                clearBranch();
                setInputValue("");
              }}
              setInputValue={setInputValue}
            />
            <Chat.Input
              value={inputValue}
              onChange={setInputValue}
              onSubmit={async () => {
                if (!inputValue.trim()) return;
                await handleSendMessage(inputValue.trim());
              }}
              onStop={chat.stop}
              disabled={!selectedModel || !selectedGateway?.id}
              isStreaming={
                chat.status === "submitted" || chat.status === "streaming"
              }
              placeholder={
                !selectedModel
                  ? "Select a model to start chatting"
                  : "Ask anything or @ for context"
              }
            >
              <GatewaySelector
                selectedGatewayId={selectedGateway?.id}
                onGatewayChange={handleGatewayChange}
                placeholder="Gateway"
                variant="borderless"
              />
              <ModelSelector
                selectedModel={selectedModel ?? undefined}
                onModelChange={handleModelChange}
                placeholder="Model"
                variant="borderless"
              />
              <UsageStats messages={chat.messages} />
            </Chat.Input>
          </div>
        </Chat.Footer>
      )}
    </Chat>
  );
}

export default function OrgHomePage() {
  return (
    <ChatProvider>
      <OrgHomePageContent />
    </ChatProvider>
  );
}
