/**
 * Organization Home Page
 *
 * Dashboard with greeting, chat input, and grids of gateways and MCP servers.
 */

import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { authClient } from "@/web/lib/auth-client";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ChevronRight, Container, CpuChip02, Plus } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useState, useRef } from "react";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { ChatProvider, useChat } from "@/web/components/chat/chat-context";
import {
  Chat,
  GatewaySelector,
  ModelSelector,
  UsageStats,
  useGateways,
  useModels,
} from "@/web/components/chat/index";
import { ChatInput } from "@/web/components/chat/chat-input";
import { ChatPanel } from "@/web/components/chat/side-panel-chat";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { ThreadHistoryPopover } from "@/web/components/chat/thread-history-popover";
import { useThreads } from "@/web/hooks/use-chat-store";
import { useRouterState } from "@tanstack/react-router";
import { createContext, useContext } from "react";
import { createToolCaller } from "@/tools/client";
import { useToolCall } from "@/web/hooks/use-tool-call";
import type { MonitoringLogsWithGatewayResponse } from "@/web/components/monitoring/index";

// Context to allow sidebar to reset home view
const HomeViewContext = createContext<{ resetToGreeting: () => void } | null>(
  null,
);

function useHomeView() {
  const context = useContext(HomeViewContext);
  if (!context) {
    throw new Error("useHomeView must be used within HomeViewProvider");
  }
  return context;
}

// Export for sidebar to use
export { useHomeView };

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

// ---------- Section Header ----------

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-5 border-b border-border shrink-0">
      <span className="text-sm text-muted-foreground">{title}</span>
      {onSeeAll && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-7 gap-2 px-3"
          onClick={onSeeAll}
        >
          See all
          <ChevronRight size={11} />
        </Button>
      )}
    </div>
  );
}

// ---------- Item Card ----------

interface ItemCardProps {
  icon: string | null | undefined;
  name: string;
  subtitle?: string;
  onClick?: () => void;
  fallbackIcon?: React.ReactNode;
}

function ItemCard({
  icon,
  name,
  subtitle,
  onClick,
  fallbackIcon,
}: ItemCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-5 py-4 border-b border-r border-border overflow-hidden",
        onClick && "cursor-pointer hover:bg-muted/30 transition-colors",
      )}
      onClick={onClick}
    >
      <IntegrationIcon
        icon={icon}
        name={name}
        size="sm"
        fallbackIcon={fallbackIcon}
        className="shrink-0 shadow-sm"
      />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {name}
        </span>
        {subtitle && (
          <span className="text-sm text-muted-foreground truncate">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

function AddItemCard({ onClick }: { onClick?: () => void }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center border-b border-r border-border overflow-hidden",
        onClick && "cursor-pointer hover:bg-muted/30 transition-colors",
      )}
      onClick={onClick}
    >
      <Plus size={24} className="text-muted-foreground" />
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="bg-muted/50 border-b border-r border-border overflow-hidden" />
  );
}

// ---------- Gateways Grid ----------

const GRID_COLS = 3;
const GRID_ROWS = 4;
const GRID_TOTAL = GRID_COLS * GRID_ROWS;

function getLast24HoursDateRange() {
  // Round to the nearest 5 minutes to avoid infinite re-suspending
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

function GatewaysGrid() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();
  const gateways = useGateways({ pageSize: GRID_TOTAL }) ?? [];

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

  const handleSeeAll = () => {
    navigate({ to: "/$org/gateways", params: { org: org.slug } });
  };

  const handleGatewayClick = (gatewayId: string) => {
    navigate({
      to: "/$org/gateways/$gatewayId",
      params: { org: org.slug, gatewayId },
    });
  };

  const handleAddClick = () => {
    navigate({
      to: "/$org/gateways",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  // Sort gateways by tool call count (descending), then show up to 11 items + add button = 12 cells
  const sortedGateways = [...gateways].sort((a, b) => {
    const countA = toolCallCounts.get(a.id) ?? 0;
    const countB = toolCallCounts.get(b.id) ?? 0;
    return countB - countA;
  });

  const displayGateways = sortedGateways.slice(0, GRID_TOTAL - 1);
  const emptyCells = GRID_TOTAL - displayGateways.length - 1;

  return (
    <div className="flex-1 border-r border-border flex flex-col min-w-0 min-h-0">
      <SectionHeader title="Top MCP Gateways" onSeeAll={handleSeeAll} />
      <div
        className="grid grid-cols-3 flex-1 min-h-0 overflow-hidden"
        style={{ gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}
      >
        <AddItemCard onClick={handleAddClick} />
        {displayGateways.map((gateway) => {
          const toolCallCount = toolCallCounts.get(gateway.id) ?? 0;
          return (
            <ItemCard
              key={gateway.id}
              icon={gateway.icon}
              name={gateway.title}
              subtitle={
                toolCallCount > 0
                  ? `${toolCallCount.toLocaleString()} calls`
                  : "—"
              }
              onClick={() => handleGatewayClick(gateway.id)}
              fallbackIcon={<CpuChip02 size={16} />}
            />
          );
        })}
        {Array.from({ length: emptyCells }).map((_, i) => (
          <EmptyCard key={`empty-${i}`} />
        ))}
      </div>
    </div>
  );
}

// ---------- MCP Servers Grid ----------

function aggregateServerToolCalls(
  logs: Array<{ connectionId?: string | null }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const log of logs) {
    if (!log.connectionId) continue;
    counts.set(log.connectionId, (counts.get(log.connectionId) ?? 0) + 1);
  }
  return counts;
}

function McpServersGrid() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();
  const connections = useConnections({ pageSize: GRID_TOTAL }) ?? [];

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
  const toolCallCounts = aggregateServerToolCalls(logs);

  const handleSeeAll = () => {
    navigate({ to: "/$org/mcps", params: { org: org.slug } });
  };

  const handleConnectionClick = (connectionId: string) => {
    navigate({
      to: "/$org/mcps/$connectionId",
      params: { org: org.slug, connectionId },
    });
  };

  const handleAddClick = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  // Sort connections by tool call count (descending), then show up to 11 items + add button = 12 cells
  const sortedConnections = [...connections].sort((a, b) => {
    const countA = toolCallCounts.get(a.id) ?? 0;
    const countB = toolCallCounts.get(b.id) ?? 0;
    return countB - countA;
  });

  const displayConnections = sortedConnections.slice(0, GRID_TOTAL - 1);
  const emptyCells = GRID_TOTAL - displayConnections.length - 1;

  return (
    <div className="flex-1 border-r border-border flex flex-col min-w-0 min-h-0">
      <SectionHeader title="Top MCP Servers" onSeeAll={handleSeeAll} />
      <div
        className="grid grid-cols-3 flex-1 min-h-0 overflow-hidden"
        style={{ gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}
      >
        <AddItemCard onClick={handleAddClick} />
        {displayConnections.map((connection) => {
          const toolCallCount = toolCallCounts.get(connection.id) ?? 0;
          return (
            <ItemCard
              key={connection.id}
              icon={connection.icon}
              name={connection.title}
              subtitle={
                toolCallCount > 0
                  ? `${toolCallCount.toLocaleString()} calls`
                  : "—"
              }
              onClick={() => handleConnectionClick(connection.id)}
              fallbackIcon={<Container size={16} />}
            />
          );
        })}
        {Array.from({ length: emptyCells }).map((_, i) => (
          <EmptyCard key={`empty-${i}`} />
        ))}
      </div>
    </div>
  );
}

function GridsSkeleton() {
  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 border-r border-border flex flex-col min-h-0">
        <div className="px-5 py-5 border-b border-border shrink-0">
          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div
          className="grid grid-cols-3 flex-1 min-h-0 overflow-hidden"
          style={{ gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}
        >
          {Array.from({ length: GRID_TOTAL }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-5 py-4 border-b border-r border-border overflow-hidden"
            >
              <div className="size-8 bg-muted animate-pulse rounded-lg" />
              <div className="flex flex-col gap-1">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-3 w-16 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 border-r border-border flex flex-col min-h-0">
        <div className="px-5 py-5 border-b border-border shrink-0">
          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div
          className="grid grid-cols-3 flex-1 min-h-0 overflow-hidden"
          style={{ gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}
        >
          {Array.from({ length: GRID_TOTAL }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-5 py-4 border-b border-r border-border overflow-hidden"
            >
              <div className="size-8 bg-muted animate-pulse rounded-lg" />
              <div className="flex flex-col gap-1">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-3 w-16 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Main Content ----------

function HomeContent({
  showChat,
  setShowChat,
}: {
  showChat: boolean;
  setShowChat: (show: boolean) => void;
}) {
  const { org, locator } = useProjectContext();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const {
    inputValue,
    setInputValue,
    setPendingSubmit,
    createThread,
    activeThreadId,
    setActiveThreadId,
    hideThread,
  } = useChat();
  const { threads, refetch } = useThreads();

  // Get gateways and models
  const gateways = useGateways();
  const models = useModels();

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

  const userName = user?.name?.split(" ")[0] || "there";
  const greeting = getTimeBasedGreeting();

  // If chat is active, show full screen chat
  if (showChat) {
    return <ChatPanel />;
  }

  return (
    <div className="flex flex-col size-full bg-background">
      {/* Header */}
      <header className="flex items-center justify-between h-12 px-5 border-b border-border shrink-0">
        <button
          type="button"
          onClick={() => setShowChat(false)}
          className="text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
        >
          {org.name || org.slug}
        </button>
        <div className="flex items-center gap-2">
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
            onSelectThread={(threadId) => {
              setActiveThreadId(threadId);
              setShowChat(true);
            }}
            onRemoveThread={hideThread}
            onOpen={() => refetch()}
          />
        </div>
      </header>

      {/* Greeting + Chat Input - takes more space than grids */}
      <div className="flex-[2] min-h-0 flex flex-col items-center justify-center px-10 py-10 border-b border-border">
        <div className="flex flex-col items-center gap-6 w-full max-w-[550px]">
          <div className="text-center">
            <p className="text-lg font-medium text-foreground">
              {greeting} {userName},
            </p>
            <p className="text-base text-muted-foreground">
              What are we building today?
          </p>
        </div>

          <div className="w-full shadow-sm rounded-xl">
            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={() => {
                if (inputValue.trim()) {
                  // Always create a new thread when submitting from home
                  createThread();
                  // Mark that we have a pending message to send
                  setPendingSubmit(true);
                  // Show the chat full screen
                  setShowChat(true);
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
        </div>
      </div>

      {/* Grids - takes less space than greeting */}
      <div className="flex-[3] flex min-h-0">
        <ErrorBoundary fallback={<GridsSkeleton />}>
          <Suspense fallback={<GridsSkeleton />}>
            <GatewaysGrid />
            <McpServersGrid />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default function OrgHomePage() {
  // Force remount on navigation to reset chat view
  const routerState = useRouterState();
  const [showChat, setShowChat] = useState(false);
  const setShowChatRef = useRef(setShowChat);
  setShowChatRef.current = setShowChat;

  // Set up event listener on mount (ref-based to avoid useEffect)
  const listenerSetupRef = useRef(false);
  if (!listenerSetupRef.current) {
    listenerSetupRef.current = true;
    const handleReset = () => setShowChatRef.current(false);
    window.addEventListener("reset-home-view", handleReset);
    // Note: We don't clean up since this is a page-level component
  }

  return (
    <HomeViewContext.Provider
      value={{ resetToGreeting: () => setShowChat(false) }}
    >
      <ChatProvider key={routerState.location.pathname}>
        <HomeContent showChat={showChat} setShowChat={setShowChat} />
    </ChatProvider>
    </HomeViewContext.Provider>
  );
}
