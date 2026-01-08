/**
 * Organization Home Page
 *
 * Dashboard with greeting, hub selector, ice breakers, and chat input.
 * Supports graph view toggle in header.
 */

import { createToolCaller } from "@/tools/client";
import { ChatProvider, useChat } from "@/web/components/chat/chat-context";
import { ChatInput } from "@/web/components/chat/chat-input";
import { DecoChatSkeleton } from "@/web/components/chat/deco-chat-skeleton";
import { GatewayIceBreakers } from "@/web/components/chat/gateway-ice-breakers";
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
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import type { MonitoringLogsWithGatewayResponse } from "@/web/components/monitoring/index";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useBindingConnections } from "@/web/hooks/use-binding";
import { useThreads } from "@/web/hooks/use-chat-store";
import { useInvalidateCollectionsOnToolCall } from "@/web/hooks/use-invalidate-collections-on-tool-call";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { usePersistedChat } from "@/web/hooks/use-persisted-chat";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { authClient } from "@/web/lib/auth-client";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { ViewModeToggle } from "@deco/ui/components/view-mode-toggle.tsx";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CpuChip02,
  GitBranch01,
  Loading01,
  MessageChatSquare,
  Plus,
} from "@untitledui/icons";
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

/**
 * System prompt for chat
 */
const SYSTEM_PROMPT =
  "You are a helpful assistant. Please try answering the user's questions using your available tools.";

/**
 * Helper to find stored item in array
 */
function findOrFirst<T>(
  array: T[],
  predicate: (item: T) => boolean,
): T | undefined {
  return array.find(predicate) ?? array[0];
}

/**
 * Hook to manage stored selection
 */
function useStoredSelection<TState, TItem>(
  key: string,
  items: TItem[],
  predicate: (item: TItem, state: TState) => boolean,
  initialValue: TState | null = null,
) {
  const [storedState, setStoredState] = useLocalStorage<TState | null>(
    key,
    initialValue,
  );
  const selectedItem = findOrFirst(items, (item) =>
    storedState ? predicate(item, storedState) : false,
  );
  return [selectedItem, setStoredState] as const;
}

// ---------- View Mode Types ----------

type HomeViewMode = "chat" | "graph";

// ---------- Date Range Helper ----------

function getLast24HoursDateRange() {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  const roundedNow = Math.floor(now / fiveMinutes) * fiveMinutes;
  const endDate = new Date(roundedNow);
  const startDate = new Date(roundedNow - 24 * 60 * 60 * 1000);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

function aggregateGatewayToolCalls(
  logs: Array<{ gatewayId?: string | null }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const log of logs) {
    if (!log.gatewayId) continue;
    counts.set(log.gatewayId, (counts.get(log.gatewayId) ?? 0) + 1);
  }
  return counts;
}

// ---------- Hub Cards Grid ----------

const MAX_HUB_CARDS = 6;

interface HubCardProps {
  icon: string | null | undefined;
  title: string;
  onClick: () => void;
}

function HubCard({ icon, title, onClick }: HubCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 p-3 rounded-xl border border-border hover:bg-accent/50 transition-colors text-left cursor-pointer"
    >
      <IntegrationIcon
        icon={icon}
        name={title}
        size="sm"
        fallbackIcon={<CpuChip02 size={16} />}
        className="shrink-0"
      />
      <span className="text-sm font-medium text-foreground truncate">
        {title}
      </span>
    </button>
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

  // Get gateways and models
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

  const [selectedGateway, setSelectedGatewayState] = useStoredSelection<
    { gatewayId: string },
    (typeof gateways)[number]
  >(
    `${locator}:selected-gateway`,
    gateways,
    (g, state) => g.id === state.gatewayId,
  );

  const handleModelChange = (model: { id: string; connectionId: string }) => {
    setSelectedModelState(model);
  };

  const handleGatewayChange = (gatewayId: string) => {
    setSelectedGatewayState({ gatewayId });
  };

  // Get the onToolCall handler for invalidating collection queries
  const onToolCall = useInvalidateCollectionsOnToolCall();

  // Use shared persisted chat hook - must be called unconditionally (Rules of Hooks)
  const chat = usePersistedChat({
    threadId: activeThreadId,
    systemPrompt: SYSTEM_PROMPT,
    onToolCall,
    onCreateThread: (thread) =>
      createThread({
        id: thread.id,
        title: thread.title,
        gatewayId: selectedGateway?.id,
      }),
  });

  // Get branching state from context
  const { branchContext, clearBranch } = useChat();

  const handleSendMessage = async (text: string) => {
    if (!selectedModel) {
      toast.error("No model configured");
      return;
    }

    if (!selectedGateway?.id) {
      toast.error("No Hub configured");
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
      gateway: { id: selectedGateway.id },
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
    };

    await chat.sendMessage(text, metadata);
  };

  const userName = user?.name?.split(" ")[0] || "there";
  const greeting = getTimeBasedGreeting();

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
            ) : (
              <span className="text-sm font-medium text-foreground">Chat</span>
            )}
          </Chat.Header.Left>
          <Chat.Header.Right>
            {viewMode === "graph" && <MetricsModeSelector />}
            {viewMode !== "graph" && !chat.isEmpty && (
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
            {viewMode !== "graph" && chat.isEmpty && (
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
                  onSelectThread={(threadId) => {
                    setActiveThreadId(threadId);
                  }}
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
                minHeightOffset={240}
              />
            </Chat.Main>
            <Chat.Footer>
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
          </>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-10 py-10">
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

              {/* Ice breakers for selected hub */}
              {selectedGateway?.id && (
                <ErrorBoundary key={selectedGateway.id} fallback={null}>
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
                      gatewayId={selectedGateway.id}
                      onSelect={(prompt) => {
                        handleSendMessage(prompt.description ?? prompt.name);
                      }}
                      className="w-full"
                    />
                  </Suspense>
                </ErrorBoundary>
              )}

              {/* Chat Input */}
              <div className="w-full shadow-sm rounded-xl">
                <ChatInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={async () => {
                    if (inputValue.trim()) {
                      await handleSendMessage(inputValue.trim());
                    }
                  }}
                  placeholder="Ask anything or @ for context"
                  maxTextHeight="65px"
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
                </ChatInput>
              </div>

              {/* Hub Cards Grid - sorted by tool calls */}
              <TopHubsGrid
                gateways={gateways}
                onSelectGateway={handleGatewayChange}
              />
            </div>
          </div>
        )}
      </Chat>
    </MetricsModeProvider>
  );
}

// ---------- Top Hubs Grid Component ----------

function TopHubsGrid({
  gateways,
  onSelectGateway,
}: {
  gateways: ReturnType<typeof useGateways>;
  onSelectGateway: (gatewayId: string) => void;
}) {
  const { locator } = useProjectContext();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const { data: logsData } = useToolCall<
    { startDate: string; endDate: string; limit: number; offset: number },
    MonitoringLogsWithGatewayResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: { ...dateRange, limit: 1000, offset: 0 },
    scope: locator,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];
  const toolCallCounts = aggregateGatewayToolCalls(logs);

  // Sort gateways by tool call count (descending), take max 6
  const sortedGateways = [...gateways]
    .sort((a, b) => {
      const countA = toolCallCounts.get(a.id) ?? 0;
      const countB = toolCallCounts.get(b.id) ?? 0;
      return countB - countA;
    })
    .slice(0, MAX_HUB_CARDS);

  if (sortedGateways.length === 0) return null;

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-2">
        {sortedGateways.map((gateway) => (
          <HubCard
            key={gateway.id}
            icon={gateway.icon}
            title={gateway.title}
            onClick={() => onSelectGateway(gateway.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default function OrgHomePage() {
  // Force remount on navigation to reset chat view
  const routerState = useRouterState();

  return (
    <ChatProvider key={routerState.location.pathname}>
      <Suspense fallback={<DecoChatSkeleton />}>
        <HomeContent />
      </Suspense>
    </ChatProvider>
  );
}
