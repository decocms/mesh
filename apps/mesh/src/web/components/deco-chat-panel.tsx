import { EmptyState } from "@/web/components/empty-state";
import { useAgentsFromConnection } from "@/web/hooks/collections/use-agent";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useLLMsFromConnection } from "@/web/hooks/collections/use-llm";
import { useBindingConnections } from "@/web/hooks/use-binding";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { DecoChatAgentSelector } from "@deco/ui/components/deco-chat-agent-selector.tsx";
import { DecoChatAside } from "@deco/ui/components/deco-chat-aside.tsx";
import { DecoChatEmptyState } from "@deco/ui/components/deco-chat-empty-state.tsx";
import { DecoChatInputV2 } from "@deco/ui/components/deco-chat-input-v2.tsx";
import { DecoChatModelSelectorRich } from "@deco/ui/components/deco-chat-model-selector-rich.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { useNavigate } from "@tanstack/react-router";
import { type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useChat } from "../providers/chat-provider";
import { MessageAssistant } from "./chat/message-assistant.tsx";
import { MessageFooter, MessageList } from "./chat/message-list.tsx";
import { MessageUser } from "./chat/message-user.tsx";

// Capybara avatar URL from decopilotAgent
const CAPYBARA_AVATAR_URL =
  "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png";

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

export function DecoChatPanel() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const { org } = useProjectContext();
  const [, setOpen] = useDecoChatOpen();
  const navigate = useNavigate();

  // Use chat management from ChatProvider
  const {
    createThread,
    chat,
    sentinelRef,
    activeThreadId,
    selectedModelState,
    setSelectedModelState,
    selectedAgentState,
    setSelectedAgentState,
  } = useChat();

  const { status } = chat;

  // Get all connections
  const allConnections = useConnections();

  // Filter connections by binding type
  const [modelsConnection] = useBindingConnections({
    connections: allConnections,
    binding: "LLMS",
  });
  const [agentsConnection] = useBindingConnections({
    connections: allConnections,
    binding: "AGENTS",
  });

  // Fetch models from the first LLM connection
  const modelsData = useLLMsFromConnection(modelsConnection?.id);

  // Fetch agents from the first AGENTS connection
  const agentsData = useAgentsFromConnection(agentsConnection?.id);

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

  // Transform agents with connection info
  const agents =
    !agentsData || !agentsConnection
      ? []
      : agentsData.map((agent) => ({
          ...agent,
          connectionId: agentsConnection.id,
          connectionName: agentsConnection.title,
        }));

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

  // Initialize with first agent
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentState) {
      const firstAgent = agents[0];
      if (firstAgent) {
        setSelectedAgentState({
          agentId: firstAgent.id,
          connectionId: firstAgent.connectionId,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentsData, agentsConnection, selectedAgentState, setSelectedAgentState]);

  // Get selected model info
  const selectedModel = models.find(
    (m) =>
      m.id === selectedModelState?.id &&
      m.connectionId === selectedModelState?.connectionId,
  );

  // Get selected agent info
  const selectedAgent = agents.find(
    (a) =>
      a.id === selectedAgentState?.agentId &&
      a.connectionId === selectedAgentState?.connectionId,
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

  // Transform agents to selector options
  const agentSelectorOptions = agents.map((agent) => ({
    id: `${agent.connectionId}:${agent.id}`,
    name: agent.title,
    avatar: agent.avatar,
    description: agent.description,
  }));

  // Wrapped send message - enriches request with metadata (similar to provider.tsx)
  const wrappedSendMessage = async (message: UIMessage<Metadata>) => {
    if (!selectedModelState || !selectedModel) {
      // Console error kept for critical missing configuration
      console.error("No model configured");
      return;
    }

    // Prepare metadata with model and agent configuration
    const metadata: Metadata = {
      model: selectedModelState ?? undefined,
      agent: selectedAgent ?? undefined,
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
      created_at: new Date().toISOString(),
      thread_id: activeThreadId,
    };

    // Set user message's thread_id
    message.metadata = {
      ...metadata,
      thread_id: activeThreadId,
    };

    return await chat.sendMessage(message, { metadata });
  };

  const handleSendMessage = async (text: string) => {
    if (!text?.trim() || status === "submitted" || status === "streaming") {
      return;
    }

    // Create and send message with metadata
    const userMessage: UIMessage<Metadata> = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };

    // Use the wrapped send message function
    await wrappedSendMessage(userMessage);
  };

  const handleStop = () => {
    chat.stop?.();
  };

  // Check if both required bindings are present
  const hasModelsBinding = !!modelsConnection;
  const hasAgentsBinding = !!agentsConnection;
  const hasBothBindings = hasModelsBinding && hasAgentsBinding;

  // If missing bindings, show empty state with appropriate message
  if (!hasBothBindings) {
    let title: string;
    let description: string;

    if (!hasModelsBinding && !hasAgentsBinding) {
      title = "Connect your providers";
      description =
        "Add MCPs with llm and agents to unlock AI-powered features.";
    } else if (!hasModelsBinding) {
      title = "No model provider connected";
      description =
        "Connect to a model provider to unlock AI-powered features.";
    } else {
      title = "No agents configured";
      description = "Connect to an agents provider to use AI assistants.";
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
              <Icon
                name="close"
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
                    to: "/$org/mcps",
                    params: { org: org.slug },
                    search: { action: "create" },
                  })
                }
              >
                Add connection
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
          <img
            src={selectedAgent?.avatar || CAPYBARA_AVATAR_URL}
            alt="deco chat"
            className="size-5 rounded"
          />
          <span className="text-sm font-medium">
            {selectedAgent?.title || "deco chat"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!isEmpty && (
            <button
              type="button"
              onClick={() => {
                createThread();
              }}
              className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent group cursor-pointer"
              title="New chat"
            >
              <Icon
                name="add"
                size={16}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent transition-colors group cursor-pointer"
            title="Close chat"
          >
            <Icon
              name="close"
              size={16}
              className="text-muted-foreground group-hover:text-foreground transition-colors"
            />
          </button>
        </div>
      </DecoChatAside.Header>

      <DecoChatAside.Content>
        {isEmpty ? (
          <DecoChatEmptyState
            title={selectedAgent?.title || "Ask deco chat"}
            description={
              selectedAgent?.description ||
              "Ask anything about configuring model providers or using MCP Mesh."
            }
            avatar={
              selectedAgent?.avatar ||
              "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png"
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
              {/* Agent Selector - Rich style */}
              {agents.length > 0 && (
                <DecoChatAgentSelector
                  agents={agentSelectorOptions}
                  selectedAgentId={
                    selectedAgentState
                      ? `${selectedAgentState.connectionId}:${selectedAgentState.agentId}`
                      : undefined
                  }
                  onAgentChange={(value) => {
                    if (!value) return;
                    const [connectionId, agentId] = value.split(":");
                    if (connectionId && agentId) {
                      setSelectedAgentState({ agentId, connectionId });
                    }
                  }}
                  placeholder="Agent"
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
            </div>
          }
        />
      </DecoChatAside.Footer>
    </DecoChatAside>
  );
}
