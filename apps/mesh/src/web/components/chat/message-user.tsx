import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deco/ui/components/alert-dialog.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { ReverseLeft } from "@untitledui/icons";
import { type UIMessage } from "ai";
import { useContext, useState } from "react";
import { MessageListContext } from "./message-list.tsx";
import { MessageTextPart } from "./parts/text-part.tsx";

export interface MessageProps<T extends Metadata> {
  message: UIMessage<T>;
  status?: "streaming" | "submitted" | "ready" | "error";
  className?: string;
  pairIndex?: number;
  onBranchFromMessage?: (messageId: string, messageText: string) => void;
}

export function MessageUser<T extends Metadata>({
  message,
  className,
  pairIndex,
  onBranchFromMessage,
}: MessageProps<T>) {
  const { id, parts } = message;
  const messageListContext = useContext(MessageListContext);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Early return if no parts
  if (!parts || parts.length === 0) {
    return null;
  }

  // Extract the full text from all text parts
  const messageText = parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("\n");

  const handleClick = () => {
    setIsFocused(true);
    if (pairIndex !== undefined) {
      messageListContext?.scrollToPair(pairIndex);
    }
  };

  const handleBranchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowBranchDialog(true);
  };

  const handleConfirmBranch = () => {
    setShowBranchDialog(false);
    onBranchFromMessage?.(id, messageText);
  };

  const canBranch = Boolean(onBranchFromMessage);

  return (
    <>
      <div
        className={cn(
          "message-block w-full min-w-0 group relative flex items-start gap-4 px-2.5 text-foreground flex-row-reverse",
          className,
        )}
      >
        <div
          tabIndex={0}
          onClick={handleClick}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full border min-w-0 shadow-xs rounded-lg text-[0.9375rem] wrap-break-word overflow-wrap-anywhere bg-background cursor-pointer transition-colors relative flex flex-col outline-none"
        >
          <div className="absolute inset-0 bg-muted/50 pointer-events-none" />
          <div
            className={cn(
              "relative z-10 px-4 py-2 transition-opacity max-h-[120px]",
              isFocused
                ? "overflow-auto opacity-100"
                : "overflow-hidden opacity-60 mask-b-from-0%",
            )}
          >
            <div>
              {parts.map((part, index) => {
                if (part.type === "text") {
                  return (
                    <MessageTextPart
                      key={`${id}-${index}`}
                      id={id}
                      part={part}
                    />
                  );
                }
                return null;
              })}
            </div>
          </div>
          {canBranch && (
            <div className="relative z-10 flex justify-end px-2 pb-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleBranchClick}
                    variant="ghost"
                    size="xs"
                    className="opacity-0 group-hover:opacity-100 hover:bg-gray-200/70 rounded-md transition-opacity text-muted-foreground hover:text-foreground aspect-square w-6 h-6 p-0"
                  >
                    <ReverseLeft size={16} className="p-0.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Edit from here</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={showBranchDialog} onOpenChange={setShowBranchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit from here?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new conversation branch from this point. The
              original conversation will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmBranch}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
