/**
 * CommitDialog Component
 *
 * Inline commit flow within the toolbar area.
 * Three states: generating (AI call in flight), editing (textarea + Confirm/Cancel),
 * committing (GIT_COMMIT in flight).
 */

import { useState } from "react";
import { Loading01 } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";

interface CommitDialogProps {
  /** Initial message from AI generation (may be empty string if generation failed) */
  initialMessage: string;
  /** Whether the AI generation call is still in flight */
  isGenerating: boolean;
  /** Whether the GIT_COMMIT call is in flight */
  isCommitting: boolean;
  /** Called with the final message text when user confirms */
  onConfirm: (message: string) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

export function CommitDialog({
  initialMessage,
  isGenerating,
  isCommitting,
  onConfirm,
  onCancel,
}: CommitDialogProps) {
  const [message, setMessage] = useState(initialMessage);

  // Sync message when initialMessage changes (AI call completes)
  // Use a key-based approach from the parent instead of useEffect.
  // The parent re-mounts this component with a new key once AI call completes.

  if (isGenerating) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 text-xs text-muted-foreground">
        <Loading01 size={12} className="animate-spin shrink-0" />
        <span>Generating commit message...</span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        placeholder="Enter commit message..."
        className="flex-1 min-w-[280px] text-xs px-2 py-1.5 rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary font-mono"
        autoFocus
        onKeyDown={(e) => {
          // Cmd+Enter / Ctrl+Enter confirms
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (message.trim()) onConfirm(message.trim());
          }
          // Escape cancels
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          disabled={isCommitting || !message.trim()}
          onClick={() => {
            if (message.trim()) onConfirm(message.trim());
          }}
        >
          {isCommitting ? (
            <Loading01 size={12} className="animate-spin mr-1" />
          ) : null}
          {isCommitting ? "Committing..." : "Commit"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isCommitting}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
