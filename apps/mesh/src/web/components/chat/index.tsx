import type { UseChatHelpers } from "@ai-sdk/react";
import { cn } from "@deco/ui/lib/utils.ts";
import { X } from "@untitledui/icons";
import type { UIMessage } from "ai";
import type {
  PropsWithChildren,
  ReactElement,
  ReactNode,
  RefObject,
} from "react";
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useTransition,
} from "react";
import { ChatProvider, useChat } from "./context";
import { IceBreakers } from "./ice-breakers";
import { ChatInput } from "./input";
import { MessagePair, useMessagePairs } from "./message/pair.tsx";
import { NoLlmBindingEmptyState } from "./no-llm-binding-empty-state";
import { ThreadHistoryPopover } from "./popover-threads";
import { DecoChatSkeleton } from "./skeleton";
import type { Metadata } from "./types.ts";
export { useChat } from "./context";
export { ModelSelector } from "./select-model";
export type { ModelChangePayload, SelectedModelState } from "./select-model";
export type { VirtualMCPInfo } from "./select-virtual-mcp";

export type ChatMessage = UIMessage<Metadata>;

export type ChatStatus = UseChatHelpers<UIMessage<Metadata>>["status"];

function useChatAutoScroll({
  messageCount,
  chatStatus,
  sentinelRef,
}: {
  messageCount: number;
  chatStatus: ChatStatus;
  sentinelRef: RefObject<HTMLDivElement | null>;
}) {
  const [_, startTransition] = useTransition();

  // Periodic scrolling during streaming (low priority)
  // oxlint-disable-next-line ban-use-effect/ban-use-effect -- Interval lifecycle management requires useEffect
  useEffect(() => {
    if (chatStatus !== "streaming") {
      return;
    }

    const intervalId = setInterval(() => {
      startTransition(() => {
        sentinelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }, 500);

    return () => {
      clearInterval(intervalId);
    };
  }, [chatStatus, sentinelRef]);

  // Scroll to the sentinel when the message count changes
  // oxlint-disable-next-line ban-use-effect/ban-use-effect -- Interval lifecycle management requires useEffect
  useEffect(() => {
    startTransition(() => {
      sentinelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [messageCount, sentinelRef]);
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
        "flex flex-col h-full w-full bg-muted transform-[translateZ(0)]",
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
    <div className="flex h-12 items-center justify-between gap-4 border-b border-border px-4 flex-none">
      {left}
      {right}
    </div>
  );
}

function ChatHeaderLeft({ children }: PropsWithChildren) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      {children}
    </div>
  );
}

function ChatHeaderRight({ children }: PropsWithChildren) {
  return <div className="flex flex-none items-center gap-1">{children}</div>;
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
  minHeightOffset = 240,
  messageBackground,
}: {
  minHeightOffset?: number;
  messageBackground?: "muted" | "background";
}) {
  const { messages, chatStatus: status } = useChat();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const messagePairs = useMessagePairs(messages);

  useChatAutoScroll({
    messageCount: messagePairs.length,
    chatStatus: status,
    sentinelRef,
  });

  return (
    <div className="w-full min-w-0 max-w-full overflow-y-auto h-full overflow-x-hidden">
      <div className="flex flex-col min-w-0 max-w-2xl mx-auto w-full">
        {messagePairs.map((pair, index) => (
          <MessagePair
            key={`pair-${pair.user.id}`}
            pair={pair}
            isLastPair={index === messagePairs.length - 1}
            minHeightOffset={minHeightOffset}
            status={index === messagePairs.length - 1 ? status : undefined}
            messageBackground={messageBackground}
          />
        ))}
        <div ref={sentinelRef} className="h-0" />
      </div>
    </div>
  );
}

function ChatFooter({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "flex-none w-full mx-auto p-2",
        "max-w-2xl min-w-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Highlight component - reusable banner for errors, warnings, and info messages.
 */
export function ChatHighlight({
  title,
  description,
  icon,
  variant = "default",
  onDismiss,
  children,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  variant?: "default" | "danger" | "warning";
  onDismiss?: () => void;
  children?: ReactNode;
}) {
  const variantStyles = {
    default: {
      container:
        "border-muted-foreground/30 bg-muted/50 hover:bg-muted transition-colors",
      icon: "text-muted-foreground",
      title: "text-muted-foreground",
      description: "text-muted-foreground/70",
    },
    danger: {
      container: "border-destructive/30 bg-destructive/5",
      icon: "text-destructive",
      title: "text-destructive font-medium",
      description: "text-muted-foreground",
    },
    warning: {
      container: "border-amber-500/30 bg-amber-500/5",
      icon: "text-amber-600 dark:text-amber-500",
      title: "text-amber-600 dark:text-amber-500 font-medium",
      description: "text-muted-foreground",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-3 py-2.5 rounded-lg border border-dashed text-sm w-full",
        styles.container,
      )}
    >
      {icon && <div className={cn("mt-0.5 shrink-0", styles.icon)}>{icon}</div>}
      <div className="flex-1 min-w-0">
        {title && (
          <div className={cn("text-xs mb-1", styles.title)}>{title}</div>
        )}
        {description && (
          <div
            className={cn(
              "text-xs line-clamp-2",
              styles.description,
              children ? "mb-2" : "",
            )}
          >
            {description}
          </div>
        )}
        {children && <div className="flex gap-2">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      )}
    </div>
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
  Provider: ChatProvider,
  Skeleton: DecoChatSkeleton,
  IceBreakers: IceBreakers,
  NoLlmBindingEmptyState: NoLlmBindingEmptyState,
  ThreadHistoryPopover: ThreadHistoryPopover,
});
