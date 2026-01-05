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
import { ChevronDown, ChevronUp, ReverseLeft } from "@untitledui/icons";
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
          "message-block w-full min-w-0 group relative flex items-start gap-4 px-2.5 text-foreground flex-row-reverse",
          className,
        )}
      >
        <div
          onClick={handleClick}
          className="w-full border min-w-0 shadow-xs rounded-lg text-[0.9375rem] wrap-break-word overflow-wrap-anywhere bg-background px-4 py-2 cursor-pointer transition-colors relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-muted/50 pointer-events-none" />
          <div
            className={cn(
              "relative z-10",
              isLongMessage &&
                !isExpanded &&
                "overflow-hidden max-h-[60px] mask-b-from-0%",
              !isLongMessage && "flex items-center",
            )}
          >
            <div className={cn(!isLongMessage && "-mb-2")}>
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
          {isLongMessage && (
            <div className="flex justify-center relative z-10">
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
          {canBranch && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleBranchClick}
                  variant="ghost"
                  size="xs"
                  className={cn(
                    "absolute right-4 z-10 opacity-0 group-hover:opacity-100 hover:bg-gray-200/70 rounded-md transition-opacity text-muted-foreground hover:text-foreground aspect-square w-6 h-6 p-0",
                    isLongMessage ? "bottom-2" : "top-1/2 -translate-y-1/2",
                  )}
                >
                  <ReverseLeft size={16} className="p-0.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Edit from here</TooltipContent>
            </Tooltip>
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
