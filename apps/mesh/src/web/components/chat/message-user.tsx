import { type UIMessage } from "ai";
import { useRef, useContext, useState } from "react";
import { cn } from "@deco/ui/lib/utils.ts";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { MessageTextPart } from "./parts/text-part.tsx";
import { MessageListContext } from "./message-list.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";

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

  const totalTextLength = parts.reduce((acc, part) => {
    if (part.type === "text") {
      return acc + part.text.length;
    }
    return acc;
  }, 0);

  const isLongMessage = totalTextLength > 50;

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
        className="w-full border min-w-0 shadow-[0_3px_6px_-1px_rgba(0,0,0,0.1)] rounded-lg text-[0.9375rem] break-words overflow-wrap-anywhere bg-muted px-4 py-2 cursor-pointer transition-colors relative"
      >
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              "w-full min-w-0 not-only:rounded-2xl text-[0.9375rem] wrap-break-word overflow-wrap-anywhere bg-muted transition-all",
              isLongMessage && !isExpanded && "max-h-16 overflow-hidden relative",
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
          </div>
          {isLongMessage && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="cursor-pointer flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors relative -mt-8 pt-8 pb-2 bg-gradient-to-t from-muted via-muted/80 to-transparent"
            >
              <Icon
                name={isExpanded ? "expand_less" : "expand_more"}
                size={16}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
