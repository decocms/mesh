import type { UseChatHelpers } from "@ai-sdk/react";
import { cn } from "@deco/ui/lib/utils.ts";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { CornerUpLeft, X } from "@untitledui/icons";
import type { UIMessage } from "ai";
import type {
  PropsWithChildren,
  ReactElement,
  ReactNode,
  RefObject,
} from "react";
import { Children, isValidElement, useRef } from "react";
import { ChatInput } from "./chat-input";
import type { BranchContext } from "./chat-context";
import { ChatProvider } from "./chat-context";
import { MessageAssistant } from "./message-assistant.tsx";
import { MessageFooter, MessageList } from "./message-list.tsx";
import { MessageUser } from "./message-user.tsx";

export { GatewaySelector, useGateways } from "./gateway-selector";
export type { GatewayInfo } from "./gateway-selector";
export { ModelSelector, useModels } from "./model-selector.tsx";
export type {
  ModelChangePayload,
  ModelInfo,
  ModelInfoWithConnection,
  SelectedModelState,
} from "./model-selector.tsx";
export { UsageStats } from "./usage-stats";

export type ChatMessage = UIMessage<Metadata>;

export type ChatStatus = UseChatHelpers<UIMessage<Metadata>>["status"];

function useChatAutoScroll({
  messageCount,
  sentinelRef,
}: {
  messageCount: number;
  sentinelRef: RefObject<HTMLDivElement | null>;
}) {
  const lastMessageCountRef = useRef(messageCount);
  const lastScrolledCountRef = useRef(0);

  if (
    messageCount > lastMessageCountRef.current &&
    lastScrolledCountRef.current !== messageCount
  ) {
    queueMicrotask(() => {
      sentinelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      lastScrolledCountRef.current = messageCount;
    });
  }

  lastMessageCountRef.current = messageCount;
}

function findChild<T>(
  children: ReactNode,
  type: (props: T) => ReactNode,
): ReactElement<T> | null {
  const arr = Children.toArray(children);
  for (const child of arr) {
    if (isValidElement(child) && child.type === type) {
      return child as ReactElement<T>;
    }
  }
  return null;
}

function ChatRoot({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "flex flex-col h-full w-full bg-sidebar transform-[translateZ(0)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ChatHeader({ children }: PropsWithChildren) {
  const left = findChild(children, ChatHeaderLeft);
  const right = findChild(children, ChatHeaderRight);

  return (
    <div className="flex h-12 items-center justify-between border-b border-border px-4 flex-none">
      <div className="flex items-center gap-2">{left?.props.children}</div>
      <div className="flex items-center gap-1">{right?.props.children}</div>
    </div>
  );
}

function ChatHeaderLeft({ children }: PropsWithChildren) {
  return <>{children}</>;
}

function ChatHeaderRight({ children }: PropsWithChildren) {
  return <>{children}</>;
}

function ChatMain({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("flex-1 min-h-0 overflow-y-auto", className)}>
      {children}
    </div>
  );
}

function ChatEmptyState({ children }: PropsWithChildren) {
  return (
    <div className="h-full w-full flex items-center justify-center max-w-2xl mx-auto">
      {children}
    </div>
  );
}

function ChatMessages({
  messages,
  status,
  minHeightOffset = 240,
}: {
  messages: ChatMessage[];
  status?: ChatStatus;
  minHeightOffset?: number;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  useChatAutoScroll({ messageCount: messages.length, sentinelRef });

  return (
    <MessageList minHeightOffset={minHeightOffset}>
      {messages.map((message, index) =>
        message.role === "user" ? (
          <MessageUser
            key={message.id}
            message={message as UIMessage<Metadata>}
          />
        ) : message.role === "assistant" ? (
          <MessageAssistant
            key={message.id}
            message={message as UIMessage<Metadata>}
            status={index === messages.length - 1 ? status : undefined}
          />
        ) : null,
      )}
      <MessageFooter>
        <div ref={sentinelRef} className="h-0" />
      </MessageFooter>
    </MessageList>
  );
}

function ChatFooter({ children }: PropsWithChildren) {
  return (
    <div className={cn("flex-none w-full mx-auto p-2", "max-w-2xl min-w-0")}>
      {children}
    </div>
  );
}

/**
 * Branch preview banner - shows when editing a message from a branch.
 */
function ChatBranchPreview({
  branchContext,
  clearBranchContext,
  onGoToOriginalMessage,
  setInputValue,
}: {
  branchContext: BranchContext | null;
  clearBranchContext: () => void;
  onGoToOriginalMessage: () => void;
  setInputValue: (value: string) => void;
}) {
  if (!branchContext) return null;

  return (
    <button
      type="button"
      onClick={onGoToOriginalMessage}
      className="flex items-start gap-2 px-2 py-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/50 text-sm hover:bg-muted transition-colors cursor-pointer text-left w-full"
      title="Click to view original message"
    >
      <CornerUpLeft
        size={14}
        className="text-muted-foreground mt-0.5 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-1">
          Editing message (click to view original):
        </div>
        <div className="text-muted-foreground/70 line-clamp-2">
          {branchContext.originalMessageText}
        </div>
      </div>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          clearBranchContext();
          setInputValue("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            clearBranchContext();
            setInputValue("");
          }
        }}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Cancel editing"
      >
        <X size={14} />
      </span>
    </button>
  );
}

export const Chat = Object.assign(ChatRoot, {
  Header: Object.assign(ChatHeader, {
    Left: ChatHeaderLeft,
    Right: ChatHeaderRight,
  }),
  Main: ChatMain,
  Messages: ChatMessages,
  EmptyState: ChatEmptyState,
  Footer: ChatFooter,
  Input: ChatInput,
  BranchPreview: ChatBranchPreview,
  Provider: ChatProvider,
});
