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
import { Button } from "@deco/ui/components/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { ChevronDown, ChevronUp, CornerUpLeft } from "@untitledui/icons";
import { type UIMessage } from "ai";
import { useContext, useRef, useState } from "react";
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
  const messageRef = useRef<HTMLDivElement>(null);
  const messageListContext = useContext(MessageListContext);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBranchDialog, setShowBranchDialog] = useState(false);

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

  // Extract the full text from all text parts
  const messageText = parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("\n");

  const handleClick = () => {
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
        ref={messageRef}
        className={cn(
          "message-block w-full min-w-0 group relative flex items-start gap-4 px-2 text-foreground flex-row-reverse",
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
          <div
            className={cn(
              "flex items-center",
              isLongMessage ? "justify-between" : "justify-end",
            )}
          >
            {isLongMessage && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                variant="ghost"
                size="xs"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? (
                  <ChevronUp className="text-sm" />
                ) : (
                  <ChevronDown className="text-sm" />
                )}
              </Button>
            )}
            {canBranch && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleBranchClick}
                    variant="ghost"
                    size="xs"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  >
                    <CornerUpLeft size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Edit from here</TooltipContent>
              </Tooltip>
            )}
          </div>
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
