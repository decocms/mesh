import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@deco/ui/components/dialog.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { Label } from "@deco/ui/components/label.tsx";

interface CommitDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (message: string) => Promise<void>;
  generatedMessage: string;
  isGenerating: boolean;
}

export function CommitDialog({
  open,
  onClose,
  onConfirm,
  generatedMessage,
  isGenerating,
}: CommitDialogProps) {
  const [message, setMessage] = useState(generatedMessage);
  const [committing, setCommitting] = useState(false);

  // Sync message when generatedMessage changes (when dialog opens with new content)
  if (message === "" && generatedMessage !== "") {
    setMessage(generatedMessage);
  }

  const handleConfirm = async () => {
    if (!message.trim()) return;
    setCommitting(true);
    try {
      await onConfirm(message);
      onClose();
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Commit message</Label>
            {isGenerating ? (
              <div className="text-sm text-muted-foreground italic">
                Generating message...
              </div>
            ) : (
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Describe your changes..."
                autoFocus
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={committing}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={committing || isGenerating || !message.trim()}
          >
            {committing ? "Committing..." : "Commit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
