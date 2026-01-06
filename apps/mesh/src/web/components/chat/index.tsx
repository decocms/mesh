import type { UseChatHelpers } from "@ai-sdk/react";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { AlertCircle, AlertTriangle, CornerUpLeft, X } from "@untitledui/icons";
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
 * Highlight component - reusable banner for errors, warnings, and info messages.
 */
function ChatHighlight({
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
    <ChatHighlight
      variant="default"
      title="Editing message (click to view original)"
      description={branchContext.originalMessageText}
      icon={<CornerUpLeft size={14} />}
      onDismiss={() => {
        clearBranchContext();
        setInputValue("");
      }}
    >
      <Button
        size="sm"
        variant="outline"
        onClick={onGoToOriginalMessage}
        className="h-7 text-xs"
      >
        View original
      </Button>
    </ChatHighlight>
  );
}

/**
 * Error banner - shows when a chat error occurs.
 */
function ChatErrorBanner({
  error,
  onFixInChat,
  onDismiss,
}: {
  error: Error | undefined;
  onFixInChat: () => void;
  onDismiss: () => void;
}) {
  if (!error) return null;

  return (
    <ChatHighlight
      variant="danger"
      title="Error occurred"
      description={error.message}
      icon={<AlertCircle size={16} />}
      onDismiss={onDismiss}
    >
      <Button
        size="sm"
        variant="outline"
        onClick={onFixInChat}
        className="h-7 text-xs"
      >
        Fix in chat
      </Button>
      <Button size="sm" variant="outline" disabled className="h-7 text-xs">
        Report
      </Button>
    </ChatHighlight>
  );
}

/**
 * Finish reason warning - shows when completion stops for non-"stop" reasons.
 */
function ChatFinishReasonWarning({
  finishReason,
  onContinue,
  onDismiss,
}: {
  finishReason: string | null;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  if (!finishReason || finishReason === "stop") return null;

  const getMessage = (reason: string): string => {
    switch (reason) {
      case "length":
        return "Response reached the model's output limit. Different models have different limits. Try switching models or asking it to continue.";
      case "content-filter":
        return "Response was filtered due to content policy.";
      case "tool-calls":
        return "Response paused after tool execution to prevent infinite loops and save costs. Click continue to keep working.";
      default:
        return `Response stopped unexpectedly: ${reason}`;
    }
  };

  return (
    <ChatHighlight
      variant="warning"
      title="Response incomplete"
      description={getMessage(finishReason)}
      icon={<AlertTriangle size={16} />}
      onDismiss={onDismiss}
    >
      <Button
        size="sm"
        variant="outline"
        onClick={onContinue}
        className="h-7 text-xs"
      >
        Continue
      </Button>
    </ChatHighlight>
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
  ErrorBanner: ChatErrorBanner,
  FinishReasonWarning: ChatFinishReasonWarning,
  Provider: ChatProvider,
});
