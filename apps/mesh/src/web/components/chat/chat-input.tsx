import { cn } from "@deco/ui/lib/utils.ts";
import { Button } from "@deco/ui/components/button.tsx";
import { ArrowUp, Stop } from "@untitledui/icons";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import type {
  FormEvent,
  KeyboardEvent,
  PropsWithChildren,
  ReactNode,
} from "react";

interface ChatInputProps extends PropsWithChildren {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  className?: string;
  centered?: boolean;
  /** Content to show above the textarea (e.g., uploaded files, context resources) */
  contextContent?: ReactNode;
  /** Actions to show on the left side of the bottom bar (e.g., add context button) */
  leftActions?: ReactNode;
  /** Actions to show on the right side before the send button (e.g., model selector, audio) */
  rightActions?: ReactNode;
  /** Maximum height for the textarea scroll area */
  maxTextHeight?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  isStreaming,
  placeholder = "Ask anything or @ for context",
  className,
  centered: _centered = false,
  contextContent,
  leftActions,
  rightActions,
  maxTextHeight = "164px",
  children,
}: ChatInputProps) {
  const canSubmit = !disabled && !isStreaming && value.trim().length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isStreaming && onStop) {
      onStop();
    } else if (canSubmit) {
      onSubmit();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        onSubmit();
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn("w-full", className)}>
      <div
        className={cn(
          "relative rounded-xl border border-border bg-background w-full min-h-[130px] flex flex-col",
        )}
      >
        <div className="relative flex flex-col gap-2 p-2.5 flex-1">
          {/* Context Resources (files, mentions, etc) */}
          {contextContent && <div className="mb-1">{contextContent}</div>}

          {/* Input Area */}
          <div
            className="overflow-y-auto relative flex-1"
            style={{ maxHeight: maxTextHeight }}
          >
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isStreaming}
              className={cn(
                "placeholder:text-muted-foreground resize-none focus-visible:ring-0 border-0 p-2 text-sm min-h-[20px] w-full",
                "rounded-none shadow-none",
              )}
              rows={1}
              style={{
                minHeight: "20px",
                height: "auto",
                overflow: "hidden",
              }}
            />
          </div>
        </div>

        {/* Bottom Actions Row */}
        <div className="flex items-center justify-between p-2.5">
          {/* Left Actions (add context, files, etc) */}
          <div className="flex items-center overflow-hidden gap-2 min-w-0">
            {leftActions}
            {children}
          </div>

          {/* Right Actions (model selector, audio, send) */}
          <div className="flex items-center gap-1">
            {rightActions}
            <Button
              type={isStreaming ? "button" : "submit"}
              onClick={(e) => {
                if (isStreaming) {
                  e.preventDefault();
                  e.stopPropagation();
                  onStop?.();
                }
              }}
              variant={canSubmit || isStreaming ? "default" : "ghost"}
              size="icon"
              disabled={!canSubmit && !isStreaming}
              className={cn(
                "size-8 rounded-full transition-all",
                !canSubmit &&
                  !isStreaming &&
                  "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground cursor-not-allowed",
              )}
              title={isStreaming ? "Stop generating" : "Send message (Enter)"}
            >
              {isStreaming ? <Stop size={20} /> : <ArrowUp size={20} />}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
