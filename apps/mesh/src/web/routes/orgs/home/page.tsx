/**
 * Organization Home Page
 *
 * Dashboard with greeting, agent selector, ice breakers, and chat input.
 * Supports graph view toggle in header.
 */

import { ChatProvider, useChat } from "@/web/components/chat/chat-context";
import { ChatInput } from "@/web/components/chat/chat-input";
import { DecoChatSkeleton } from "@/web/components/chat/deco-chat-skeleton";
import { GatewayInputWrapper } from "@/web/components/chat/gateway-input-wrapper";
import { GatewayIceBreakers } from "@/web/components/chat/ice-breakers";
import {
  Chat,
  GatewaySelector,
  ModelSelector,
  UsageStats,
  useModels,
} from "@/web/components/chat/index";
import { NoLlmBindingEmptyState } from "@/web/components/chat/no-llm-binding-empty-state";
import { ThreadHistoryPopover } from "@/web/components/chat/thread-history-popover";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useBindingConnections } from "@/web/hooks/use-binding";
import { useThreads } from "@/web/hooks/use-chat-store";
import { useContext } from "@/web/hooks/use-context";
import { useInvalidateCollectionsOnToolCall } from "@/web/hooks/use-invalidate-collections-on-tool-call";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { usePersistedChat } from "@/web/hooks/use-persisted-chat";
import { authClient } from "@/web/lib/auth-client";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { ViewModeToggle } from "@deco/ui/components/view-mode-toggle.tsx";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { GitBranch01, MessageChatSquare, Plus } from "@untitledui/icons";
import { Suspense } from "react";
import { toast } from "sonner";
import {
  MeshVisualization,
  MeshVisualizationSkeleton,
  MetricsModeProvider,
  MetricsModeSelector,
} from "./mesh-graph.tsx";

/**
 * Get time-based greeting
 */
function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 22) return "Evening";
  return "Night";
}

// ---------- View Mode Types ----------

type HomeViewMode = "chat" | "graph";

// ---------- Typewriter Title Component ----------

function TypewriterTitle({
  text,
  className = "",
  speed = 30,
}: {
  text: string;
  className?: string;
  speed?: number;
}) {
  // Calculate animation duration based on text length and speed
  const animationDuration = (text.length / speed) * 1000;
  const steps = text.length;
  // Use ch units (character width) for accurate character-based width
  const maxWidth = `${text.length}ch`;

  return (
    <span
      className={className}
      key={text}
      style={
        {
          "--typewriter-duration": `${animationDuration}ms`,
          "--typewriter-steps": steps,
          "--typewriter-max-width": maxWidth,
        } as React.CSSProperties
      }
    >
      <span className="typewriter-text">{text}</span>
      <style>{`
        .typewriter-text {
          display: inline-block;
          width: 0;
          overflow: hidden;
          white-space: nowrap;
          animation: typewriter var(--typewriter-duration) steps(var(--typewriter-steps)) forwards;
        }

        @keyframes typewriter {
          to {
            width: var(--typewriter-max-width);
          }
        }
      `}</style>
    </span>
  );
}

// ---------- Main Content ----------

function HomeContent() {
  const { org, locator } = useProjectContext();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const navigate = useNavigate();
  const {
    inputValue,
    setInputValue,
    createThread,
    activeThreadId,
    setActiveThreadId,
    hideThread,
  } = useChat();
  const { threads, refetch } = useThreads();

  // View mode state (chat vs graph)
  const [viewMode, setViewMode] = useLocalStorage<HomeViewMode>(
    `${locator}:home-view-mode`,
    "chat",
  );

  // Get gateways
  const gateways = useGateways();

  // Check for LLM binding connection
  const allConnections = useConnections();
  const modelsConnections = useBindingConnections({
    connections: allConnections,
    binding: "LLMS",
  });

  const hasModelsBinding = Boolean(modelsConnections.length > 0);

  // Get stored model selection (contains both id and connectionId)
  const [storedModelState, setStoredModelState] = useLocalStorage<{
    id: string;
    connectionId: string;
  } | null>(LOCALSTORAGE_KEYS.chatSelectedModel(locator), null);

  // Determine connectionId to use (from stored selection or first available)
  const connectionIdForModels =
    storedModelState?.connectionId ?? modelsConnections[0]?.id ?? null;

  // Fetch models for the selected connection
  const models = useModels(connectionIdForModels);

  // Find the selected model from the fetched models using stored state
  const selectedModel = storedModelState
    ? (models.find((m) => m.id === storedModelState.id) ?? null)
    : null;

  const [storedSelectedGatewayId, setSelectedGatewayId] = useLocalStorage<
    string | null
  >(`${locator}:selected-gateway-id`, null);

  // Find the selected gateway from the list
  const selectedGateway = storedSelectedGatewayId
    ? (gateways.find((g) => g.id === storedSelectedGatewayId) ?? null)
    : null;

  const selectedGatewayId = selectedGateway?.id ?? null;

  // Show gateway selector when using default gateway (no badge)
  const showGatewaySelector = !selectedGatewayId;

  const handleModelChange = (model: { id: string; connectionId: string }) => {
    setStoredModelState(model);
  };

  const handleGatewayChange = (gatewayId: string | null) => {
    setSelectedGatewayId(gatewayId);
  };

  // Get the onToolCall handler for invalidating collection queries
  const onToolCall = useInvalidateCollectionsOnToolCall();

  // Get context for the AI assistant based on current state
  const contextPrompt = useContext(selectedGatewayId);

  // Use shared persisted chat hook - must be called unconditionally (Rules of Hooks)
  const chat = usePersistedChat({
    threadId: activeThreadId,
    gatewayId: selectedGatewayId ?? undefined,
    systemPrompt: contextPrompt,
    onToolCall,
  });

  // Get branching state from context
  const { branchContext, clearBranch } = useChat();

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
        connectionId: storedModelState?.connectionId ?? "",
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

  const userName = user?.name?.split(" ")[0] || "there";
  const greeting = getTimeBasedGreeting();

  // Find the active thread
  const activeThread = threads?.find((thread) => thread.id === activeThreadId);

  const isStreaming =
    chat.status === "submitted" || chat.status === "streaming";

  // Show empty state when no LLM binding is found
  if (!hasModelsBinding) {
    return (
      <div className="flex flex-col size-full bg-background items-center justify-center">
        <NoLlmBindingEmptyState
          orgSlug={org.slug}
          orgId={org.id}
          userId={user?.id || ""}
          allConnections={allConnections ?? []}
          onInstallMcpServer={() => {
            navigate({
              to: "/$org/mcps",
              params: { org: org.slug },
              search: { action: "create" },
            });
          }}
        />
      </div>
    );
  }

  return (
    <MetricsModeProvider>
      <Chat>
        <Chat.Header>
          <Chat.Header.Left>
            {viewMode === "graph" ? (
              <span className="text-sm font-medium text-foreground">
                Summary
              </span>
            ) : !chat.isEmpty && activeThread?.title ? (
              <TypewriterTitle
                text={activeThread.title}
                className="text-sm font-medium text-foreground"
              />
            ) : (
              <span className="text-sm font-medium text-foreground">Chat</span>
            )}
          </Chat.Header.Left>
          <Chat.Header.Right>
            {viewMode === "graph" && <MetricsModeSelector />}
            {viewMode !== "graph" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7 border border-input"
                  onClick={() => createThread()}
                  aria-label="New chat"
                >
                  <Plus size={16} />
                </Button>
                <ThreadHistoryPopover
                  threads={threads}
                  activeThreadId={activeThreadId}
                  onSelectThread={setActiveThreadId}
                  onRemoveThread={hideThread}
                  onOpen={() => refetch()}
                  variant="outline"
                />
              </>
            )}
            <ViewModeToggle
              value={viewMode}
              onValueChange={setViewMode}
              size="sm"
              options={[
                { value: "chat", icon: <MessageChatSquare /> },
                { value: "graph", icon: <GitBranch01 /> },
              ]}
            />
          </Chat.Header.Right>
        </Chat.Header>

        {viewMode === "graph" ? (
          <div className="flex-1 overflow-hidden relative">
            <ErrorBoundary
              fallback={
                <div className="bg-background p-5 text-sm text-muted-foreground h-full flex items-center justify-center">
                  Failed to load mesh visualization
                </div>
              }
            >
              <Suspense fallback={<MeshVisualizationSkeleton />}>
                <MeshVisualization />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : !chat.isEmpty ? (
          <>
            <Chat.Main>
              <Chat.Messages
                messages={chat.messages}
                status={chat.status}
                minHeightOffset={280}
              />
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
                  onGoToOriginalMessage={() => {
                    if (!branchContext) return;
                    setActiveThreadId(branchContext.originalThreadId);
                    clearBranch();
                    setInputValue("");
                  }}
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
                      selectedModel={storedModelState ?? undefined}
                      onModelChange={handleModelChange}
                      placeholder="Model"
                      variant="borderless"
                    />
                    <UsageStats messages={chat.messages} />
                  </Chat.Input>
                </GatewayInputWrapper>
              </div>
            </Chat.Footer>
          </>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-10 pb-32 pt-10">
            <div className="flex flex-col items-center gap-6 w-full max-w-[550px]">
              {/* Greeting */}
              <div className="text-center">
                <p className="text-lg font-medium text-foreground">
                  {greeting} {userName},
                </p>
                <p className="text-base text-muted-foreground">
                  What are we building today?
                </p>
              </div>

              {/* Chat Input */}
              <GatewayInputWrapper
                gateway={selectedGateway ?? undefined}
                onGatewayChange={handleGatewayChange}
                disabled={isStreaming}
              >
                <ChatInput
                  value={inputValue}
                  onChange={setInputValue}
                  placeholder="Ask anything or @ for context"
                  maxTextHeight="65px"
                  onSubmit={async () => {
                    if (inputValue.trim()) {
                      await handleSendMessage(inputValue.trim());
                    }
                  }}
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
                    selectedModel={storedModelState ?? undefined}
                    onModelChange={handleModelChange}
                    placeholder="Model"
                    variant="borderless"
                  />
                </ChatInput>
              </GatewayInputWrapper>

              {/* Ice breakers for selected agent */}
              <GatewayIceBreakers.Container className="w-full">
                {selectedGatewayId && (
                  <ErrorBoundary key={selectedGatewayId} fallback={null}>
                    <Suspense fallback={<GatewayIceBreakers.Fallback />}>
                      <GatewayIceBreakers
                        gatewayId={selectedGatewayId}
                        onSelect={(prompt) => {
                          handleSendMessage(prompt.description ?? prompt.name);
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </GatewayIceBreakers.Container>
            </div>
          </div>
        )}
      </Chat>
    </MetricsModeProvider>
  );
}

/**
 * Error fallback for the home chat page
 * Displays a clean error state that allows retry without breaking navigation
 */
function HomeChatErrorFallback({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}) {
  // Check if it's an auth-related error (401)
  const isAuthError =
    error?.message?.includes("401") ||
    error?.message?.toLowerCase().includes("unauthorized");

  return (
    <Chat>
      <Chat.Header>
        <Chat.Header.Left>
          <span className="text-sm font-medium text-foreground">Chat</span>
        </Chat.Header.Left>
        <Chat.Header.Right />
      </Chat.Header>
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-4">
          <div className="bg-destructive/10 p-3 rounded-full mx-auto w-fit">
            <MessageChatSquare className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium">
              {isAuthError ? "Unable to load models" : "Something went wrong"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isAuthError
                ? "There was an authentication error while loading the models. This might be due to an expired session or invalid API key."
                : error?.message || "An unexpected error occurred"}
            </p>
          </div>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    </Chat>
  );
}

/**
 * Wrapper component that handles errors in HomeContent
 * Uses a key to force remount when retrying
 */
function HomeContentWithErrorBoundary() {
  return (
    <ErrorBoundary
      fallback={({ error, resetError }) => (
        <HomeChatErrorFallback error={error} onRetry={resetError} />
      )}
    >
      <Suspense fallback={<DecoChatSkeleton />}>
        <HomeContent />
      </Suspense>
    </ErrorBoundary>
  );
}

export default function OrgHomePage() {
  // Force remount on navigation to reset chat view
  const routerState = useRouterState();

  return (
    <ChatProvider key={routerState.location.pathname}>
      <HomeContentWithErrorBoundary />
    </ChatProvider>
  );
}
