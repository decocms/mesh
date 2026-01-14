import { IntegrationIcon } from "@/web/components/integration-icon";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { isDefaultGateway } from "@/web/utils/gateway-color";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { useNavigate } from "@tanstack/react-router";
import { CpuChip02, Plus, X } from "@untitledui/icons";
import { Suspense } from "react";
import { toast } from "sonner";
import { useConnections } from "../../hooks/collections/use-connection";
import { useBindingConnections } from "../../hooks/use-binding";
import { useThreads } from "../../hooks/use-chat-store";
import { useInvalidateCollectionsOnToolCall } from "../../hooks/use-invalidate-collections-on-tool-call";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { usePersistedChat } from "../../hooks/use-persisted-chat";
import { useStoredSelection } from "../../hooks/use-stored-selection";
import { useContext } from "../../hooks/use-context";
import { LOCALSTORAGE_KEYS } from "../../lib/localstorage-keys";
import { ErrorBoundary } from "../error-boundary";
import { useChat } from "./chat-context";
import { GatewayInputWrapper } from "./gateway-input-wrapper";
import { GatewayIceBreakers } from "./ice-breakers";
import {
  Chat,
  GatewaySelector,
  ModelSelector,
  UsageStats,
  useGateways,
  useModels,
} from "./index";
import { NoLlmBindingEmptyState } from "./no-llm-binding-empty-state";
import { ThreadHistoryPopover } from "./thread-history-popover";

// Capybara avatar URL from decopilotAgent
const CAPYBARA_AVATAR_URL =
  "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png";

function ChatPanelContent() {
  const {
    org: { slug: orgSlug, id: orgId },
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

  const [selectedModel, setSelectedModelState] = useStoredSelection<
    { id: string; connectionId: string },
    (typeof models)[number]
  >(
    LOCALSTORAGE_KEYS.chatSelectedModel(locator),
    models,
    (m, state) => m.id === state.id && m.connectionId === state.connectionId,
  );

  const [selectedGatewayId, setSelectedGatewayId] = useLocalStorage<
    string | null
  >(`${locator}:selected-gateway-id`, null);

  // Find the selected gateway from the list
  const selectedGateway = selectedGatewayId
    ? (gateways.find((g) => g.id === selectedGatewayId) ?? null)
    : null;

  // Get context for the AI assistant based on current state
  const contextPrompt = useContext(selectedGatewayId);

  // Get the onToolCall handler for invalidating collection queries
  const onToolCall = useInvalidateCollectionsOnToolCall();

  // Use shared persisted chat hook - must be called unconditionally (Rules of Hooks)
  const chat = usePersistedChat({
    threadId: activeThreadId,
    systemPrompt: contextPrompt,
    onToolCall,
    gatewayId: selectedGatewayId ?? undefined,
  });

  // Get input and branching state from context
  const { inputValue, setInputValue, branchContext, clearBranch } = useChat();

  const { isEmpty } = chat;

  const showGatewaySelector = isDefaultGateway(selectedGatewayId);

  // Handle clicking on the branch preview to go back to original thread
  const handleGoToOriginalMessage = () => {
    if (!branchContext) return;
    setActiveThreadId(branchContext.originalThreadId);
    // Clear the branch context since we're going back
    clearBranch();
    setInputValue("");
  };

  const handleSendMessage = async (text: string) => {
    if (!selectedModel) {
      toast.error("No model configured");
      return;
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
        limits: selectedModel.limits ?? undefined,
      },
      gateway: { id: selectedGatewayId },
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

  const handleGatewayChange = (gatewayId: string | null) => {
    setSelectedGatewayId(gatewayId);
  };

  const isStreaming =
    chat.status === "submitted" || chat.status === "streaming";

  if (!hasModelsBinding) {
    const title = "No model provider connected";
    const description =
      "Connect to a model provider to unlock AI-powered features.";

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
            <NoLlmBindingEmptyState
              title={title}
              description={description}
              orgSlug={orgSlug}
              orgId={orgId}
              userId={user?.id ?? ""}
              allConnections={allConnections}
              onInstallMcpServer={() =>
                navigate({
                  to: "/$org/mcps",
                  params: { org: orgSlug },
                  search: { action: "create" },
                })
              }
            />
          </Chat.EmptyState>
        </Chat.Main>
      </Chat>
    );
  }

  return (
    <Chat>
      <Chat.Header>
        <Chat.Header.Left>
          <IntegrationIcon
            icon={selectedGateway?.icon ?? "/favicon.svg"}
            name={selectedGateway?.title ?? "deco chat"}
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
        {isEmpty ? (
          <Chat.EmptyState>
            <div className="flex flex-col items-center gap-6 w-full px-4">
              <div className="flex flex-col items-center justify-center gap-4 p-0 text-center">
                <IntegrationIcon
                  icon={selectedGateway?.icon ?? "/favicon.svg"}
                  name={selectedGateway?.title || "deco chat"}
                  size="lg"
                  fallbackIcon={<CpuChip02 size={32} />}
                  className="size-[60px]! rounded-[18px]!"
                />
                <h3 className="text-xl font-medium text-foreground">
                  {selectedGateway?.title || "Ask deco chat"}
                </h3>
                <div className="text-muted-foreground text-center text-sm max-w-md">
                  {selectedGateway?.description ??
                    "Ask anything about configuring model providers or using MCP Mesh."}
                </div>
              </div>
              <GatewayIceBreakers.Container>
                {selectedGatewayId && (
                  <ErrorBoundary key={selectedGatewayId} fallback={null}>
                    <Suspense fallback={<GatewayIceBreakers.Fallback />}>
                      <GatewayIceBreakers
                        gatewayId={selectedGatewayId}
                        onSelect={(prompt) => {
                          // Submit the prompt name as the first message
                          handleSendMessage(prompt.description ?? prompt.name);
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </GatewayIceBreakers.Container>
            </div>
          </Chat.EmptyState>
        ) : (
          <Chat.Messages
            messages={chat.messages}
            status={chat.status}
            minHeightOffset={280}
          />
        )}
      </Chat.Main>

      <Chat.Footer>
        <div className="flex flex-col gap-2">
          <Chat.ErrorBanner
            error={chat.error}
            onFixInChat={() => {
              if (chat.error) {
                handleSendMessage(
                  `I encountered this error: ${chat.error.message}. Can you help me fix it?`,
                );
              }
            }}
            onDismiss={chat.clearError}
          />
          <Chat.FinishReasonWarning
            finishReason={chat.finishReason}
            onContinue={() => {
              handleSendMessage("Please continue.");
            }}
            onDismiss={chat.clearFinishReason}
          />
          <Chat.BranchPreview
            branchContext={branchContext}
            clearBranchContext={clearBranch}
            onGoToOriginalMessage={handleGoToOriginalMessage}
            setInputValue={setInputValue}
          />
          <GatewayInputWrapper
            gateway={selectedGateway ?? undefined}
            onGatewayChange={handleGatewayChange}
            disabled={isStreaming}
          >
            <Chat.Input
              value={inputValue}
              onChange={setInputValue}
              onSubmit={async () => {
                if (!inputValue.trim()) return;
                await handleSendMessage(inputValue.trim());
              }}
              onStop={chat.stop}
              disabled={!selectedModel}
              isStreaming={isStreaming}
              placeholder={
                !selectedModel
                  ? "Select a model to start chatting"
                  : "Ask anything or @ for context"
              }
            >
              {/* GatewaySelector only shown when default is selected (no badge) */}
              {showGatewaySelector && (
                <GatewaySelector
                  selectedGatewayId={selectedGatewayId}
                  onGatewayChange={handleGatewayChange}
                  placeholder="Agent"
                  disabled={isStreaming}
                />
              )}
              <ModelSelector
                selectedModel={selectedModel ?? undefined}
                onModelChange={handleModelChange}
                placeholder="Model"
                variant="borderless"
              />
              <UsageStats messages={chat.messages} />
            </Chat.Input>
          </GatewayInputWrapper>
        </div>
      </Chat.Footer>
    </Chat>
  );
}

export function ChatPanel() {
  return (
    <Chat.Provider>
      <ChatPanelContent />
    </Chat.Provider>
  );
}
