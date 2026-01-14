import { useState, type ReactNode } from "react";
import { useCopy } from "@deco/ui/hooks/use-copy.ts";
import { Button } from "@deco/ui/components/button.tsx";
import { MemoizedMarkdown } from "@deco/ui/components/chat/chat-markdown.tsx";
import { Check, Copy01 } from "@untitledui/icons";
import type { TextUIPart } from "ai";
import { cn } from "@deco/ui/lib/utils.ts";

interface MessageTextPartProps {
  id: string;
  part: TextUIPart;
  copyable?: boolean;
  extraActions?: ReactNode;
  hasToolCallAfter?: boolean;
}

export function MessageTextPart({
  id,
  part,
  copyable = false,
  extraActions,
  hasToolCallAfter = false,
}: MessageTextPartProps) {
  const { handleCopy } = useCopy();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyMessage = async () => {
    await handleCopy(part.text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Only show copy button on the last part (the one with extraActions/usage stats)
  const showCopyButton = copyable && extraActions;
  const showActions = showCopyButton || extraActions;

  return (
    <div className={cn("group/part relative", !hasToolCallAfter && "mb-2")}>
      <MemoizedMarkdown id={id} text={part.text} />
      {showActions && (
        <div className="flex w-full items-center text-xs text-muted-foreground opacity-0 pointer-events-none transition-all duration-200 group-hover/part:opacity-100 group-hover/part:pointer-events-auto mt-2">
          <div className="flex items-center gap-1">
            {showCopyButton && (
              <Button
                onClick={handleCopyMessage}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground size-6 whitespace-nowrap"
              >
                {isCopied ? <Check size={12} /> : <Copy01 size={12} />}
              </Button>
            )}
            {extraActions}
          </div>
        </div>
      )}
    </div>
  );
}
