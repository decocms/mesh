import { IntegrationIcon } from "@/web/components/integration-icon";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  getWellKnownDecopilotVirtualMCP,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { ClockRewind, Users03, Plus, X } from "@untitledui/icons";
import { Suspense, useState } from "react";
import { ErrorBoundary } from "../error-boundary";
import { Chat, useChat } from "./index";
import { ThreadsView } from "./threads-sidebar";
import { TypewriterTitle } from "./typewriter-title";

function ChatPanelContent() {
  const { org } = useProjectContext();
  const [, setOpen] = useDecoChatOpen();
  const {
    selectedVirtualMcp,
    modelsConnections,
    isChatEmpty,
    activeThreadId,
    setActiveThreadId,
    threads,
  } = useChat();
  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  const [showThreadsOverlay, setShowThreadsOverlay] = useState(false);

  // Use Decopilot as default agent
  const defaultAgent = getWellKnownDecopilotVirtualMCP(org.id);
  const displayAgent = selectedVirtualMcp ?? defaultAgent;

  if (modelsConnections.length === 0) {
    const title = "No model provider connected";
    const description =
      "Connect to a model provider to unlock AI-powered features.";

    return (
      <Chat>
        <Chat.Header>
          <Chat.Header.Left>
            <IntegrationIcon
              icon={displayAgent.icon}
              name={displayAgent.title}
              size="xs"
              className="size-5 rounded-md aspect-square shrink-0"
            />
            <span className="text-sm font-medium">{displayAgent.title}</span>
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
            <Chat.NoLlmBindingEmptyState
              title={title}
              description={description}
              org={org}
            />
          </Chat.EmptyState>
        </Chat.Main>
      </Chat>
    );
  }

  return (
    <Chat className="relative overflow-hidden">
      {/* Chat view */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col transition-all duration-300 ease-in-out",
          showThreadsOverlay
            ? "opacity-0 -translate-x-4 pointer-events-none"
            : "opacity-100 translate-x-0",
        )}
      >
        <Chat.Header>
          <Chat.Header.Left>
            <IntegrationIcon
              icon={displayAgent.icon}
              name={displayAgent.title}
              size="xs"
              className="size-5 rounded-md aspect-square shrink-0"
            />
            {!isChatEmpty && activeThread?.title ? (
              <TypewriterTitle
                text={activeThread.title}
                className="text-sm font-medium text-foreground"
              />
            ) : (
              <span className="text-sm font-medium text-foreground">
                {displayAgent.title}
              </span>
            )}
          </Chat.Header.Left>
          <Chat.Header.Right>
            <button
              type="button"
              onClick={() => setActiveThreadId(crypto.randomUUID())}
              className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent group cursor-pointer"
              title="New chat"
            >
              <Plus
                size={16}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </button>
            <button
              type="button"
              onClick={() => setShowThreadsOverlay(true)}
              className="flex size-6 items-center justify-center rounded-full p-1 hover:bg-transparent group cursor-pointer"
              title="Chat history"
            >
              <ClockRewind
                size={16}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </button>
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
          {isChatEmpty ? (
            <Chat.EmptyState>
              <div className="flex flex-col items-center gap-6 w-full px-4">
                <div className="flex flex-col items-center justify-center gap-4 p-0 text-center">
                  <IntegrationIcon
                    icon={displayAgent.icon}
                    name={displayAgent.title}
                    size="lg"
                    fallbackIcon={<Users03 size={32} />}
                    className="size-[60px]! rounded-[18px]!"
                  />
                  <h3 className="text-xl font-medium text-foreground">
                    {displayAgent.title}
                  </h3>
                  <div className="text-muted-foreground text-center text-sm max-w-md">
                    {displayAgent.description ??
                      "Ask anything about configuring model providers or using MCP Mesh."}
                  </div>
                </div>
                <Chat.IceBreakers />
              </div>
            </Chat.EmptyState>
          ) : (
            <Chat.Messages minHeightOffset={280} />
          )}
        </Chat.Main>

        <Chat.Footer>
          <Chat.Input />
        </Chat.Footer>
      </div>

      {/* Threads view */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col transition-all duration-300 ease-in-out",
          showThreadsOverlay
            ? "opacity-100 translate-x-0"
            : "opacity-0 translate-x-4 pointer-events-none",
        )}
      >
        <ThreadsView
          threads={threads}
          activeThreadId={activeThreadId}
          onThreadSelect={setActiveThreadId}
          onClose={() => setShowThreadsOverlay(false)}
        />
      </div>
    </Chat>
  );
}

export function ChatPanel() {
  return (
    <ErrorBoundary fallback={<Chat.Skeleton />}>
      <Suspense fallback={<Chat.Skeleton />}>
        <Chat.Provider>
          <ChatPanelContent />
        </Chat.Provider>
      </Suspense>
    </ErrorBoundary>
  );
}
