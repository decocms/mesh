import type { UseChatHelpers } from "@ai-sdk/react";
import { DecoChatAside } from "@deco/ui/components/deco-chat-aside.tsx";
import { DecoChatInputV2 } from "@deco/ui/components/deco-chat-input-v2.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import type { UIMessage } from "ai";
import type {
  PropsWithChildren,
  ReactElement,
  ReactNode,
  RefObject,
} from "react";
import { Children, isValidElement, useRef, useState } from "react";
import { toast } from "sonner";
import { GatewaySelector } from "./gateway-selector";
import { MessageAssistant } from "./message-assistant.tsx";
import { MessageFooter, MessageList } from "./message-list.tsx";
import { MessageUser } from "./message-user.tsx";
import type {
  ModelChangePayload,
  SelectedModelState,
} from "./model-selector.tsx";
import { ModelSelector } from "./model-selector.tsx";
import { UsageStats } from "./usage-stats.tsx";

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

function filterChildren(children: ReactNode, excludedTypes: unknown[]) {
  return Children.toArray(children).filter((child) => {
    if (!isValidElement(child)) return true;
    return !excludedTypes.includes(child.type);
  });
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

function ChatInputModelSelector(_props: {
  disabled?: boolean;
  selectedModel?: SelectedModelState;
  onModelChange: (model: ModelChangePayload) => void;
  className?: string;
}) {
  return null;
}

function ChatInputGatewaySelector(_props: {
  disabled?: boolean;
  selectedGatewayId?: string;
  onGatewayChange: (gatewayId: string) => void;
  className?: string;
}) {
  return null;
}

function ChatInput({
  onSubmit,
  onStop,
  disabled,
  isStreaming,
  placeholder,
  usageMessages,
  children,
  value,
  onValueChange,
}: PropsWithChildren<{
  onSubmit: (text: string) => Promise<void>;
  onStop: () => void;
  disabled: boolean;
  isStreaming: boolean;
  placeholder: string;
  usageMessages?: ChatMessage[];
  value?: string;
  onValueChange?: (value: string) => void;
}>) {
  const modelSelector = findChild(children, ChatInputModelSelector);
  const gatewaySelector = findChild(children, ChatInputGatewaySelector);
  const rest = filterChildren(children, [
    ChatInputModelSelector,
    ChatInputGatewaySelector,
  ]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!value?.trim() || isStreaming) {
      return;
    }
    const text = value.trim();
    try {
      await onSubmit(text);
      onValueChange?.("");
    } catch (error) {
      console.error("Failed to send message:", error);
      const message =
        error instanceof Error ? error.message : "Failed to send message";
      toast.error(message);
    }
  };

  const leftActions = (
    <div className="flex items-center gap-2 min-w-0">
      {gatewaySelector ? (
        <div
          className={cn(
            "flex items-center gap-2 flex-wrap min-w-0",
            gatewaySelector.props.disabled && "pointer-events-none opacity-60",
          )}
        >
          <GatewaySelector
            selectedGatewayId={gatewaySelector.props.selectedGatewayId}
            onGatewayChange={gatewaySelector.props.onGatewayChange}
            placeholder="Gateway"
            variant="bordered"
            className={gatewaySelector.props.className}
          />
        </div>
      ) : null}

      {modelSelector ? (
        <div
          className={cn(
            "flex items-center gap-2 flex-wrap min-w-0",
            modelSelector.props.disabled && "pointer-events-none opacity-60",
          )}
        >
          <ModelSelector
            selectedModel={modelSelector.props.selectedModel}
            onModelChange={modelSelector.props.onModelChange}
            placeholder="Model"
            variant="borderless"
            className={modelSelector.props.className}
          />
        </div>
      ) : null}

      {rest}
      {usageMessages ? <UsageStats messages={usageMessages} /> : null}
    </div>
  );

  return (
    <DecoChatInputV2
      value={value ?? ""}
      onChange={onValueChange ?? (() => {})}
      onSubmit={handleSubmit}
      onStop={onStop}
      disabled={disabled}
      isStreaming={isStreaming}
      placeholder={placeholder}
      leftActions={leftActions}
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
  Input: Object.assign(ChatInput, {
    ModelSelector: ChatInputModelSelector,
    GatewaySelector: ChatInputGatewaySelector,
  }),
});
