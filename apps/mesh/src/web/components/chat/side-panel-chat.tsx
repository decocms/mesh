import { IntegrationIcon } from "@/web/components/integration-icon";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { useProjectContext } from "@decocms/mesh-sdk";
import { CpuChip02, Plus, X } from "@untitledui/icons";
import { Suspense, useRef } from "react";
import { ErrorBoundary } from "../error-boundary";
import { Chat, useChat } from "./index";
import { TypewriterTitle } from "./typewriter-title";
import { useThreads } from "@/web/hooks/use-chat-store";
import {
  consumePendingFloatingMessage,
  type PendingFloatingMessage,
} from "./floating-chat-input";

/**
 * Hook to handle pending messages from the floating input.
 * Checks for pending messages whenever the chat becomes visible and model is ready.
 * Always starts a new thread for messages from the floating input.
 */
function usePendingFloatingMessage(
  chatOpen: boolean,
  selectedModel: unknown,
  activeThreadId: string,
  setActiveThreadId: (threadId: string) => void,
  setVirtualMcpId: (id: string | null) => void,
  setSelectedModel: (model: { id: string; connectionId: string }) => void,
  sendMessage: (doc: PendingFloatingMessage["doc"]) => void,
) {
  const lastCheckedOpenRef = useRef(false);
  const pendingMessageRef = useRef<PendingFloatingMessage | null>(null);
  const pendingThreadIdRef = useRef<string | null>(null);
  // Keep latest callbacks in refs to avoid stale closure issues
  const sendMessageRef = useRef(sendMessage);
  const setVirtualMcpIdRef = useRef(setVirtualMcpId);
  const setSelectedModelRef = useRef(setSelectedModel);
  sendMessageRef.current = sendMessage;
  setVirtualMcpIdRef.current = setVirtualMcpId;
  setSelectedModelRef.current = setSelectedModel;

  // Check for pending message when chat opens (transitions from closed to open)
  if (chatOpen && !lastCheckedOpenRef.current) {
    lastCheckedOpenRef.current = true;
    const pendingMessage = consumePendingFloatingMessage();
    if (pendingMessage) {
      // Store the message and create new thread - we'll send after re-render
      const newThreadId = crypto.randomUUID();
      pendingMessageRef.current = pendingMessage;
      pendingThreadIdRef.current = newThreadId;
      // Set the virtual MCP if one was selected in the floating input
      if (pendingMessage.virtualMcpId) {
        setVirtualMcpIdRef.current(pendingMessage.virtualMcpId);
      }
      // Set the model if one was selected in the floating input
      if (pendingMessage.model) {
        setSelectedModelRef.current({
          id: pendingMessage.model.id,
          connectionId: pendingMessage.model.connectionId,
        });
      }
      setActiveThreadId(newThreadId);
    }
  }

  // Send pending message after thread change has settled (thread ID matches)
  if (
    pendingMessageRef.current &&
    pendingThreadIdRef.current &&
    activeThreadId === pendingThreadIdRef.current &&
    selectedModel
  ) {
    const messageToSend = pendingMessageRef.current;
    pendingMessageRef.current = null;
    pendingThreadIdRef.current = null;
    // Use setTimeout to ensure we're after React's state updates
    setTimeout(() => {
      sendMessageRef.current(messageToSend.doc);
    }, 0);
  }

  // Reset when chat closes so we can check again next time it opens
  if (!chatOpen && lastCheckedOpenRef.current) {
    lastCheckedOpenRef.current = false;
  }
}

// Capybara avatar URL from decopilotAgent
const CAPYBARA_AVATAR_URL =
  "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png";

function ChatPanelContent() {
  const { org } = useProjectContext();
  const [chatOpen, setOpen] = useDecoChatOpen();
  const {
    selectedVirtualMcp,
    setVirtualMcpId,
    modelsConnections,
    isChatEmpty,
    activeThreadId,
    setActiveThreadId,
    threads,
    selectedModel,
    setSelectedModel,
    sendMessage,
  } = useChat();
  const activeThread = threads.find((thread) => thread.id === activeThreadId);

  // Handle pending messages from floating input when chat opens (always new thread)
  usePendingFloatingMessage(
    chatOpen,
    selectedModel,
    activeThreadId,
    setActiveThreadId,
    setVirtualMcpId,
    setSelectedModel,
    sendMessage,
  );

  if (modelsConnections.length === 0) {
    const title = "No model provider connected";
    const description =
      "Connect to a model provider to unlock AI-powered features.";

    return (
      <Chat>
        <Chat.Header>
          <Chat.Header.Left>
            <img
              src={CAPYBARA_AVATAR_URL}
              alt="Chat"
              className="size-5 rounded"
            />
            <span className="text-sm font-medium">Chat</span>
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
    <Chat>
      <Chat.Header>
        <Chat.Header.Left>
          {!isChatEmpty && activeThread?.title ? (
            <TypewriterTitle
              text={activeThread.title}
              className="text-sm font-medium text-foreground"
            />
          ) : (
            <span className="text-sm font-medium text-foreground">Chat</span>
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
          <Chat.ThreadHistoryPopover />
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
                  icon={selectedVirtualMcp?.icon ?? "/favicon.svg"}
                  name={selectedVirtualMcp?.title || "Chat"}
                  size="lg"
                  fallbackIcon={<CpuChip02 size={32} />}
                  className="size-[60px]! rounded-[18px]!"
                />
                <h3 className="text-xl font-medium text-foreground">
                  {selectedVirtualMcp?.title || "Chat"}
                </h3>
                <div className="text-muted-foreground text-center text-sm max-w-md">
                  {selectedVirtualMcp?.description ??
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
    </Chat>
  );
}

function ChatPanelWithThreads() {
  const { threads, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useThreads();
  return (
    <Chat.Provider
      initialThreads={threads}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      fetchNextPage={fetchNextPage}
    >
      <ChatPanelContent />
    </Chat.Provider>
  );
}

export function ChatPanel() {
  return (
    <ErrorBoundary fallback={<Chat.Skeleton />}>
      <Suspense fallback={<Chat.Skeleton />}>
        <ChatPanelWithThreads />
      </Suspense>
    </ErrorBoundary>
  );
}
