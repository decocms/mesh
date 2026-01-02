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
import { Textarea } from "@deco/ui/components/textarea.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import {
  ChevronDown,
  ChevronUp,
  CornerUpLeft,
  X,
  Check,
} from "@untitledui/icons";
import { type UIMessage } from "ai";
import { useContext, useRef, useState } from "react";
import { MessageListContext } from "./message-list.tsx";
import { MessageTextPart } from "./parts/text-part.tsx";

export interface MessageProps<T extends Metadata> {
  message: UIMessage<T>;
  status?: "streaming" | "submitted" | "ready" | "error";
  className?: string;
  pairIndex?: number;
  isEditing?: boolean;
  onStartEdit?: (messageId: string) => void;
  onCancelEdit?: () => void;
  onSubmitEdit?: (messageId: string, newText: string) => void;
}

export function MessageUser<T extends Metadata>({
  message,
  className,
  pairIndex,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
}: MessageProps<T>) {
  const { id, parts } = message;
  const messageRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageListContext = useContext(MessageListContext);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);
  const [editText, setEditText] = useState("");

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
    if (pairIndex !== undefined && !isEditing) {
      messageListContext?.scrollToPair(pairIndex);
    }
  };

  const handleRevertClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowRevertDialog(true);
  };

  const handleConfirmRevert = () => {
    setShowRevertDialog(false);
    setEditText(messageText);
    onStartEdit?.(id);
    // Focus the textarea after a small delay to ensure it's rendered
    setTimeout(() => {
      textareaRef.current?.focus();
      // Move cursor to end
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.value.length;
        textareaRef.current.selectionEnd = textareaRef.current.value.length;
      }
    }, 50);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditText("");
    onCancelEdit?.();
  };

  const handleSubmitEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editText.trim()) {
      onSubmitEdit?.(id, editText.trim());
      setEditText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (editText.trim()) {
        onSubmitEdit?.(id, editText.trim());
        setEditText("");
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditText("");
      onCancelEdit?.();
    }
  };

  const canEdit = Boolean(onStartEdit);

  // Editing mode UI
  if (isEditing) {
    return (
      <div
        ref={messageRef}
        className={cn(
          "message-block w-full min-w-0 group relative flex items-start gap-4 px-2 text-foreground flex-row-reverse",
          className,
        )}
      >
        <div className="w-full border-2 border-dashed border-primary min-w-0 shadow-[0_3px_6px_-1px_rgba(0,0,0,0.1)] rounded-lg text-[0.9375rem] break-words overflow-wrap-anywhere bg-muted px-4 py-2 transition-colors">
          <div className="flex items-center gap-2 mb-2 text-xs text-primary font-medium">
            <CornerUpLeft size={12} />
            Editing message...
          </div>
          <Textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[60px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none text-[0.9375rem]"
            placeholder="Digite sua mensagem..."
          />
          <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-primary/20">
            <Button
              onClick={handleCancelEdit}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} className="mr-1" />
              Cancel
            </Button>
            <Button
              onClick={handleSubmitEdit}
              variant="default"
              size="sm"
              className="h-7 px-2"
              disabled={!editText.trim()}
            >
              <Check size={14} className="mr-1" />
              Send
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Normal display mode
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
            {canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleRevertClick}
                    variant="ghost"
                    size="xs"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  >
                    <CornerUpLeft size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Edit from here
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={showRevertDialog} onOpenChange={setShowRevertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit from here?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all messages sent after this one. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRevert}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
