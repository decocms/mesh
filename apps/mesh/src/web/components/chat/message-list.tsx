import {
  Children,
  isValidElement,
  type ReactNode,
  PropsWithChildren,
  type ReactElement,
  createContext,
  useRef,
  cloneElement,
} from "react";
import { cn } from "@deco/ui/lib/utils.ts";

export const MessageListContext = createContext<{
  scrollToPair: (pairIndex: number) => void;
} | null>(null);

export function MessageFooter({ children }: PropsWithChildren) {
  return <>{children}</>;
}

interface MessagePair {
  user: ReactElement | null;
  assistant: ReactElement | null;
}

function groupMessagesInPairs(messages: ReactNode[]): MessagePair[] {
  const pairs: MessagePair[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!isValidElement(message)) continue;

    // Use message.props.message.role instead of component type comparison
    // This fixes HMR issues where component references change
    const messageRole = (message.props as any)?.message?.role;

    if (messageRole === "assistant") {
      const previousMessage = messages[i - 1];
      const prevRole =
        isValidElement(previousMessage) &&
        (previousMessage.props as any)?.message?.role;

      const user =
        previousMessage &&
        isValidElement(previousMessage) &&
        prevRole === "user"
          ? (previousMessage as ReactElement)
          : null;

      pairs.push({ user, assistant: message as ReactElement });
    }
  }

  return pairs;
}

interface MessageListProps {
  children: ReactNode;
  className?: string;
  minHeightOffset?: number;
}

export function MessageList({
  children,
  className,
  minHeightOffset,
}: MessageListProps) {
  const messageListRef = useRef<HTMLDivElement>(null);
  const pairRefs = useRef<(HTMLDivElement | null)[]>([]);
  const childrenArray = Children.toArray(children);

  const lastChild = childrenArray[childrenArray.length - 1];
  const footer =
    lastChild && isValidElement(lastChild) && lastChild.type === MessageFooter
      ? lastChild
      : null;

  const messages = footer ? childrenArray.slice(0, -1) : childrenArray;

  const messagePairs = groupMessagesInPairs(messages);

  const scrollToPair = (pairIndex: number) => {
    const pairElement = pairRefs.current[pairIndex];
    if (pairElement && messageListRef.current) {
      const containerOffsetTop = messageListRef.current.offsetTop;
      const elementOffsetTop = pairElement.offsetTop;

      messageListRef.current.scrollTo({
        top: elementOffsetTop - containerOffsetTop,
        behavior: "smooth",
      });
    }
  };

  return (
    <MessageListContext.Provider value={{ scrollToPair }}>
      <div
        ref={messageListRef}
        className={cn(
          "w-full min-w-0 max-w-full overflow-y-auto h-full overflow-x-hidden",
          className,
        )}
      >
        <div className="flex flex-col min-w-0 max-w-2xl mx-auto w-full">
          {messagePairs.map((pair, index) => {
            const isLastPair = index === messagePairs.length - 1;

            return (
              <div
                key={index}
                ref={(el) => {
                  pairRefs.current[index] = el;
                }}
                className="flex flex-col gap-2 py-2"
                style={
                  isLastPair && minHeightOffset
                    ? { minHeight: `calc(100vh - ${minHeightOffset}px)` }
                    : undefined
                }
              >
                {/* Sticky overlay to prevent scrolling content from appearing above the user message */}
                <div className="sticky top-0 z-50 bg-background w-full h-2"/>
                <div className="sticky top-2 z-50">
                  {pair.user && isValidElement(pair.user)
                    ? cloneElement(pair.user, { pairIndex: index } as any)
                    : pair.user}
                </div>
                {pair.assistant}
              </div>
            );
          })}

          {footer}
        </div>
      </div>
    </MessageListContext.Provider>
  );
}
