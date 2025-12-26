import { type UIMessage } from "ai";
import { useRef, useContext, useState } from "react";
import { cn } from "@deco/ui/lib/utils.ts";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { MessageTextPart } from "./parts/text-part.tsx";
import { MessageListContext } from "./message-list.tsx";
import { ChevronUp, ChevronDown } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";

export interface MessageProps<T extends Metadata> {
  message: UIMessage<T>;
  status?: "streaming" | "submitted" | "ready" | "error";
  className?: string;
  pairIndex?: number;
}

export function MessageUser<T extends Metadata>({
  message,
  className,
  pairIndex,
}: MessageProps<T>) {
  const { id, parts } = message;
  const messageRef = useRef<HTMLDivElement>(null);
  const messageListContext = useContext(MessageListContext);
  const [isExpanded, setIsExpanded] = useState(false);

  // Early return if no parts
  if (!parts || parts.length === 0) {
    return null;
  }

  const totalTextLength = parts.reduce((acc, part) => {
    if (part.type === "text") {
      return acc + part.text.length;
    }
    return acc;
  }, 0);

  const isLongMessage = totalTextLength > 60;

  const handleClick = () => {
    if (pairIndex !== undefined) {
      messageListContext?.scrollToPair(pairIndex);
    }
  };

  return (
    <div
      ref={messageRef}
      className={cn(
        "message-block w-full min-w-0 group relative flex items-start gap-4 px-4 text-foreground flex-row-reverse",
        className,
      )}
    >
      {" "}
      <div
        onClick={handleClick}
        className="w-full border min-w-0 shadow-[0_3px_6px_-1px_rgba(0,0,0,0.1)] rounded-lg text-[0.9375rem] break-words overflow-wrap-anywhere bg-muted px-4 py-2 cursor-pointer transition-colors"
      >
        <div
          className={cn(
            isLongMessage &&
              !isExpanded &&
              "overflow-hidden relative max-h-[60px]",
          )}
        >
          {parts.map((part, index) => {
            if (part.type === "text") {
              return (
                <MessageTextPart
                  key={`${id}-${index}`}
                  id={id}
                  text={part.text}
                />
              );
            }
            return null;
          })}
          {isLongMessage && !isExpanded && (
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-muted to-transparent pointer-events-none" />
          )}
        </div>
        {isLongMessage && (
          <div className="flex justify-center">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              variant="ghost"
              size="xs"
              className="text-xs w-full text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <ChevronUp className="text-sm" />
              ) : (
                <ChevronDown className="text-sm" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
