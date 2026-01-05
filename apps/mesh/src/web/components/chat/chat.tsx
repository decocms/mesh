import type { UseChatHelpers } from "@ai-sdk/react";
import { DecoChatAside } from "@deco/ui/components/deco-chat-aside.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import type { UIMessage } from "ai";
import { CornerUpLeft, X } from "@untitledui/icons";
import type {
  PropsWithChildren,
  ReactElement,
  ReactNode,
  RefObject,
} from "react";
import { Children, isValidElement, use, useRef } from "react";
import type { BranchContext } from "../../hooks/use-persisted-chat";
import { ChatInput as ChatInputComponent } from "./chat-input";
import { ChatInputContext } from "./chat-input-context";
import { MessageAssistant } from "./message-assistant.tsx";
import { MessageFooter, MessageList } from "./message-list.tsx";
import { MessageUser } from "./message-user.tsx";
export { useGateways } from "./gateway-selector";
export type { GatewayInfo } from "./gateway-selector";
export { useModels } from "./model-selector.tsx";
export type {
  ModelChangePayload,
  ModelInfo,
  ModelInfoWithConnection,
  SelectedModelState,
} from "./model-selector.tsx";

export type ChatMessage = UIMessage<Metadata>;

export type ChatStatus = UseChatHelpers<UIMessage<Metadata>>["status"];

/**
 * Hook to access chat input state from context.
 * Must be used within ChatInputProvider.
 */
export function useChatInput() {
  const ctx = use(ChatInputContext);
  if (!ctx) {
    throw new Error("useChatInput must be used within ChatInputProvider");
  }
  return ctx;
}

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
    <DecoChatAside className={cn("h-full", className)}>
      {children}
    </DecoChatAside>
  );
}

function ChatHeader({ children }: PropsWithChildren) {
  const left = findChild(children, ChatHeaderLeft);
  const right = findChild(children, ChatHeaderRight);

  return (
    <DecoChatAside.Header>
      <div className="flex items-center gap-2">{left?.props.children}</div>
      <div className="flex items-center gap-1">{right?.props.children}</div>
    </DecoChatAside.Header>
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
    <DecoChatAside.Content className={className}>
      {children}
    </DecoChatAside.Content>
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
  onBranchFromMessage,
}: {
  messages: ChatMessage[];
  status?: ChatStatus;
  minHeightOffset?: number;
  onBranchFromMessage?: (messageId: string, messageText: string) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  useChatAutoScroll({ messageCount: messages.length, sentinelRef });

  return (
    <MessageList minHeightOffset={minHeightOffset}>
      {messages.map((message, index) =>
        message.role === "user" ? (
          <MessageUser
            key={message.id}
            onBranchFromMessage={onBranchFromMessage}
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
    <DecoChatAside.Footer className="max-w-2xl mx-auto w-full min-w-0">
      {children}
    </DecoChatAside.Footer>
  );
}

/**
 * Branch preview banner - shows when editing a message from a branch.
 * Manages input clearing internally.
 */
function ChatBranchPreview({
  branchContext,
  clearBranchContext,
  onGoToOriginalMessage,
}: {
  branchContext: BranchContext | null;
  clearBranchContext: () => void;
  onGoToOriginalMessage: () => void;
}) {
  const { setInputValue } = useChatInput();

  if (!branchContext) return null;

  const handleGoToOriginal = () => {
    setInputValue("");
    onGoToOriginalMessage();
  };

  const handleCancel = () => {
    clearBranchContext();
    setInputValue("");
  };

  return (
    <button
      type="button"
      onClick={handleGoToOriginal}
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
          handleCancel();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            handleCancel();
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

function ChatInput({
  onSubmit,
  onStop,
  disabled,
  isStreaming,
  placeholder,
  children,
}: PropsWithChildren<{
  onSubmit: (text: string) => Promise<void>;
  onStop: () => void;
  disabled: boolean;
  isStreaming: boolean;
  placeholder: string;
}>) {
  const { inputValue, setInputValue } = useChatInput();

  const handleSubmit = async () => {
    if (!inputValue?.trim() || isStreaming) {
      return;
    }
    const text = inputValue.trim();
    try {
      await onSubmit(text);
      setInputValue("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  return (
    <ChatInputComponent
      value={inputValue}
      onChange={setInputValue}
      onSubmit={handleSubmit}
      onStop={onStop}
      disabled={disabled}
      isStreaming={isStreaming}
      placeholder={placeholder}
      leftActions={children}
    />
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
  BranchPreview: ChatBranchPreview,
  Input: ChatInput,
});
