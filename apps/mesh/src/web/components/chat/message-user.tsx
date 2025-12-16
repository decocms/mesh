import { type UIMessage } from "ai";
import { useRef } from "react";
import { cn } from "@deco/ui/lib/utils.ts";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { MessageTextPart } from "./parts/text-part.tsx";

export interface MessageProps<T extends Metadata> {
  message: UIMessage<T>;
  status?: "streaming" | "submitted" | "ready" | "error";
  className?: string;
}

function useTimestamp(created_at: string | Date) {
  return new Date(created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageUser<T extends Metadata>({
  message,
  className,
}: MessageProps<T>) {
  const { id, parts, metadata: { created_at } = {} } = message;
  const formattedTimestamp = useTimestamp(
    created_at ?? new Date().toISOString(),
  );
  const messageRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    messageRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div
      ref={messageRef}
      className={cn(
        "message-block sticky top-0 z-50 bg-background w-full min-w-0 group relative flex items-start gap-4 px-4 text-foreground flex-row-reverse py-4",
        className,
      )}
    > <div onClick={handleClick} className="w-full border min-w-0 shadow-[0_3px_6px_-1px_rgba(0,0,0,0.1)] rounded-lg text-[0.9375rem] break-words overflow-wrap-anywhere bg-muted px-4 pt-2 pb-1 cursor-pointer hover:bg-muted/80 transition-colors">

      <div className="flex flex-col gap-2">
        <div className="w-full min-w-0 not-only:rounded-2xl text-[0.9375rem] wrap-break-word overflow-wrap-anywhere bg-muted">
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
        <div className="gap-2 text-xs text-muted-foreground w-full flex justify-end mb-2">
          <span>{formattedTimestamp}</span>
        </div>
      </div>
      </div>
    </div>
  );
}
