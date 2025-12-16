import { useState } from "react";
import { useCopy } from "@deco/ui/hooks/use-copy.ts";
import { Button } from "@deco/ui/components/button.tsx";
import { MemoizedMarkdown } from "@deco/ui/components/chat/chat-markdown.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";

interface MessageTextPartProps {
  id: string;
  text: string;
  copyable?: boolean;
}

export function MessageTextPart({
  id,
  text,
  copyable = false,
}: MessageTextPartProps) {
  const { handleCopy } = useCopy();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyMessage = async () => {
    await handleCopy(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="group/part relative">
      <MemoizedMarkdown id={id} text={text} />
      {copyable && (
        <div className="flex w-full items-center justify-end gap-2 text-xs text-muted-foreground opacity-0 pointer-events-none transition-all duration-200 group-hover/part:opacity-100 group-hover/part:pointer-events-auto">
          <div className="flex gap-1">
            <Button
              onClick={handleCopyMessage}
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground px-2 py-1 h-auto whitespace-nowrap"
            >
              {isCopied ? (
                <>
                  <Icon name="check" className="mr-1 text-sm" />
                </>
              ) : (
                <>
                  <Icon name="content_copy" className="mr-1 text-sm" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
