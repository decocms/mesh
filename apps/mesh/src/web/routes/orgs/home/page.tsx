/**
 * Organization Home Page
 *
 * Dashboard with greeting, agent selector, ice breakers, and chat input.
 * Supports graph view toggle in header.
 */

import { Chat, useChat } from "@/web/components/chat/index";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { ViewModeToggle } from "@deco/ui/components/view-mode-toggle.tsx";
import { useRouterState } from "@tanstack/react-router";
import { GitBranch01, MessageChatSquare, Plus } from "@untitledui/icons";
import { Suspense } from "react";
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
  const { createThread, activeThread, hasModelsBinding, chat, user } =
    useChat();

  // View mode state (chat vs graph)
  const [viewMode, setViewMode] = useLocalStorage<HomeViewMode>(
    `${locator}:home-view-mode`,
    "chat",
  );

  const userName = user?.name?.split(" ")[0] || "there";
  const greeting = getTimeBasedGreeting();

  // Show empty state when no LLM binding is found
  if (!hasModelsBinding) {
    return (
      <div className="flex flex-col size-full bg-background items-center justify-center">
        <Chat.NoLlmBindingEmptyState org={org} />
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
                <Chat.ThreadHistoryPopover variant="outline" />
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
              <Chat.Messages minHeightOffset={280} />
            </Chat.Main>
            <Chat.Footer>
              <Chat.Input />
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
              <Chat.Input />

              {/* Ice breakers for selected agent */}
              <Chat.IceBreakers className="w-full" />
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

export default function OrgHomePage() {
  // Force remount on navigation to reset chat view
  const routerState = useRouterState();

  return (
    <ErrorBoundary
      fallback={({ error, resetError }) => (
        <HomeChatErrorFallback error={error} onRetry={resetError} />
      )}
    >
      <Suspense fallback={<Chat.Skeleton />}>
        <Chat.Provider key={routerState.location.pathname}>
          <HomeContent />
        </Chat.Provider>
      </Suspense>
    </ErrorBoundary>
  );
}
