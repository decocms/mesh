/**
 * Unsaved Changes Dialog
 *
 * AlertDialog that blocks site switching when the page composer has pending saves.
 * Offers three options: cancel (stay), discard changes, or save & switch.
 */

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
import { buttonVariants } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

interface UnsavedChangesDialogProps {
  open: boolean;
  onSaveAndSwitch: () => void;
  onDiscardAndSwitch: () => void;
  onCancel: () => void;
}

function UnsavedChangesDialog({
  open,
  onSaveAndSwitch,
  onDiscardAndSwitch,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes on this page. What would you like to do?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "destructive" }))}
            onClick={onDiscardAndSwitch}
          >
            Discard changes
          </AlertDialogAction>
          <AlertDialogAction onClick={onSaveAndSwitch}>
            Save & switch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default UnsavedChangesDialog;
