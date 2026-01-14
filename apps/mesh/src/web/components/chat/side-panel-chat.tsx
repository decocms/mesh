import { IntegrationIcon } from "@/web/components/integration-icon";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { CpuChip02, Plus, X } from "@untitledui/icons";
import { Suspense } from "react";
import { ErrorBoundary } from "../error-boundary";
import { Chat, useChat } from "./index";


// Capybara avatar URL from decopilotAgent
const CAPYBARA_AVATAR_URL =
  "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png";

/**
 * Typewriter title component for animated thread titles
 */
function TypewriterTitle({
  text,
  className = "",
  speed = 30,
}: {
  text: string;
  className?: string;
  speed?: number;
}) {
  const animationDuration = (text.length / speed) * 1000;
  const steps = text.length;
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

function ChatPanelContent() {
  const { org } = useProjectContext();
  const [, setOpen] = useDecoChatOpen();
  const {
    createThread,
    activeThread,
    selectedGateway,
    modelsConnections,
    isChatEmpty,
  } = useChat();

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
            onClick={() => createThread()}
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
                  icon={selectedGateway?.icon ?? "/favicon.svg"}
                  name={selectedGateway?.title || "Chat"}
                  size="lg"
                  fallbackIcon={<CpuChip02 size={32} />}
                  className="size-[60px]! rounded-[18px]!"
                />
                <h3 className="text-xl font-medium text-foreground">
                  {selectedGateway?.title || "Chat"}
                </h3>
                <div className="text-muted-foreground text-center text-sm max-w-md">
                  {selectedGateway?.description ??
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
