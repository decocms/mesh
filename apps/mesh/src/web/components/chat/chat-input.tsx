import { cn } from "@deco/ui/lib/utils.ts";
import { Button } from "@deco/ui/components/button.tsx";
import { ArrowUp, Stop } from "@untitledui/icons";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  className?: string;
  /** Content to show on the left side of the bottom bar (e.g., model/gateway selectors, usage stats) */
  leftActions?: ReactNode;
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
  leftActions,
  maxTextHeight = "164px",
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
      <div className="relative rounded-xl border border-border bg-background w-full min-h-[130px] flex flex-col shadow-sm">
        <div className="relative flex flex-col gap-2 p-2.5 flex-1">
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
        <div className="flex items-center justify-between px-2.5 pb-2.5">
          {/* Left Actions (model selector, gateway selector, usage stats, etc) */}
          <div className="flex items-center gap-2 overflow-hidden">{leftActions}</div>

          {/* Send Button */}
          <div className="flex items-center gap-1">
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
