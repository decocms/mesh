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
import { Edit02 } from "@untitledui/icons";
import { type UIMessage } from "ai";
import { useContext, useState } from "react";
import { MessageListContext } from "./list.tsx";
import { MessageTextPart } from "./parts/text-part.tsx";
import { useChat } from "../context";
import { useBranchMessage } from "../../../hooks/use-branch-message";

export interface MessageProps<T extends Metadata> {
  message: UIMessage<T>;
  status?: "streaming" | "submitted" | "ready" | "error";
  className?: string;
  pairIndex?: number;
}

/**
 * Edit message button with branch dialog
 * Handles the entire flow of branching a conversation from a specific message
 */
interface EditMessageButtonProps {
  messageId: string;
  parts: UIMessage["parts"];
}

function EditMessageButton({ messageId, parts }: EditMessageButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const { setInputValue, startBranch, setActiveThreadId, activeThreadId } =
    useChat();
  const branchMessage = useBranchMessage(setActiveThreadId);

  // Extract the full text from all text parts
  const messageText = parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("\n");

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDialog(true);
  };

  const handleConfirm = async () => {
    // Branch creates new thread and copies messages
    await branchMessage(messageId, messageText, activeThreadId);

    // Set the input value for editing
    setInputValue(messageText);

    // Track the original context for the preview
    startBranch({
      originalThreadId: activeThreadId,
      originalMessageId: messageId,
      originalMessageText: messageText,
    });

    setShowDialog(false);
  };

  return (
    <>
      <div className="flex justify-center items-end px-2 pb-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleButtonClick}
              variant="ghost"
              size="xs"
              className="opacity-0 group-hover:opacity-100 hover:bg-gray-200/70 rounded-md transition-opacity text-muted-foreground hover:text-foreground aspect-square w-6 h-6 p-0"
            >
              <Edit02 size={16} className="p-0.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Edit message</TooltipContent>
        </Tooltip>
      </div>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit message?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new conversation branch from this point. The
              original conversation will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function MessageUser<T extends Metadata>({
  message,
  className,
  pairIndex,
}: MessageProps<T>) {
  const { id, parts } = message;
  const messageListContext = useContext(MessageListContext);
  const [isFocused, setIsFocused] = useState(false);

  // Early return if no parts
  if (!parts || parts.length === 0) {
    return null;
  }

  const handleClick = () => {
    setIsFocused(true);
    if (pairIndex !== undefined) {
      messageListContext?.scrollToPair(pairIndex);
    }
  };

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
          className="w-full border min-w-0 shadow-xs rounded-lg text-[0.9375rem] wrap-break-word overflow-wrap-anywhere bg-background cursor-pointer transition-colors relative flex outline-none"
        >
          <div
            className={cn(
              "z-10 px-4 py-2 transition-opacity max-h-[120px] flex-1",
              isFocused
                ? "overflow-auto opacity-100"
                : "overflow-hidden opacity-99 mask-b-from-1%",
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
          <EditMessageButton messageId={id} parts={parts} />
        </div>
      </div>
    </>
  );
}
