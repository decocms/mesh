import { useState, type ReactNode } from "react";
import { useCopy } from "@deco/ui/hooks/use-copy.ts";
import { Button } from "@deco/ui/components/button.tsx";
import { MemoizedMarkdown } from "@deco/ui/components/chat/chat-markdown.tsx";
import { Check, Copy01 } from "@untitledui/icons";

interface MessageTextPartProps {
  id: string;
  text: string;
  copyable?: boolean;
  extraActions?: ReactNode;
}

export function MessageTextPart({
  id,
  text,
  copyable = false,
  extraActions,
}: MessageTextPartProps) {
  const { handleCopy } = useCopy();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyMessage = async () => {
    await handleCopy(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const showActions = copyable || extraActions;

  return (
    <div className="group/part relative">
      <MemoizedMarkdown id={id} text={text} />
      {showActions && (
        <div className="flex w-full items-center text-xs text-muted-foreground opacity-0 pointer-events-none transition-all duration-200 group-hover/part:opacity-100 group-hover/part:pointer-events-auto mt-2">
          <div className="flex items-center gap-1">
            {copyable && (
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
