import { cn } from "@deco/ui/lib/utils.ts";
import type { PropsWithChildren } from "react";
import { ChatProvider, useChat } from "./context";
import { IceBreakers } from "./ice-breakers";
import { ChatInput } from "./input";
import { MessagePair, useMessagePairs } from "./message/pair.tsx";
import { NoLlmBindingEmptyState } from "./no-llm-binding-empty-state";
import { ThreadHistoryPopover } from "./popover-threads";
import { DecoChatSkeleton } from "./skeleton";
export type { ToolSelectionStrategy } from "@/mcp-clients/virtual-mcp/types";
export { useChat } from "./context";
export { ModelSelector } from "./select-model";
export type { ModelChangePayload, SelectedModelState } from "./select-model";
export type { VirtualMCPInfo } from "./select-virtual-mcp";
export type { ChatMessage, ChatStatus } from "./types.ts";

function ChatRoot({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  // Detect if className contains bg-background
  const hasBackgroundClass = className?.includes("bg-background");
  const surfaceBg = hasBackgroundClass ? "var(--background)" : "var(--muted)";

  return (
    <div
      className={cn(
        "flex flex-col h-full w-full bg-muted transform-[translateZ(0)]",
        className,
      )}
      style={{ "--chat-surface": surfaceBg } as React.CSSProperties}
    >
      {children}
    </div>
  );
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

function ChatMessages() {
  const { messages, status } = useChat();
  const messagePairs = useMessagePairs(messages);

  return (
    <div className="w-full min-w-0 max-w-full overflow-y-auto h-full overflow-x-hidden">
      <div className="flex flex-col min-w-0 max-w-2xl mx-auto w-full">
        {messagePairs.map((pair, index) => (
          <MessagePair
            key={`pair-${pair.user.id}`}
            pair={pair}
            isLastPair={index === messagePairs.length - 1}
            status={index === messagePairs.length - 1 ? status : undefined}
          />
        ))}
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

export const Chat = Object.assign(ChatRoot, {
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
