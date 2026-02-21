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
import type { GitCommit } from "../lib/git-api";

interface RevertDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  commit: GitCommit | null;
}

export function RevertDialog({
  open,
  onClose,
  onConfirm,
  commit,
}: RevertDialogProps) {
  if (!commit) return null;

  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revert to this commit?</AlertDialogTitle>
          <AlertDialogDescription>
            This will restore the page to commit{" "}
            <code className="bg-muted px-1 rounded text-xs">
              {commit.hash.slice(0, 8)}
            </code>{" "}
            — "{commit.message}". Any unsaved changes will be replaced.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Revert</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
