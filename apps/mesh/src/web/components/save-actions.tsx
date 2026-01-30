import { Button } from "@deco/ui/components/button.tsx";
import { FlipBackward, Loading01, Save01 } from "@untitledui/icons";

interface SaveActionsProps {
  onSave: () => void | Promise<void>;
  onUndo: () => void;
  isDirty: boolean;
  isSaving: boolean;
  saveLabel?: string;
  undoLabel?: string;
}

export function SaveActions({
  onSave,
  onUndo,
  isDirty,
  isSaving,
  saveLabel = "Save",
  undoLabel = "Undo",
}: SaveActionsProps) {
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={onUndo}
        disabled={!isDirty || isSaving}
        aria-label={undoLabel}
      >
        <FlipBackward size={14} />
        {undoLabel}
      </Button>
      <Button
        variant="default"
        size="sm"
        onClick={onSave}
        disabled={!isDirty || isSaving}
        aria-label={saveLabel}
      >
        {isSaving ? (
          <Loading01 size={14} className="animate-spin" />
        ) : (
          <Save01 size={14} />
        )}
        {saveLabel}
      </Button>
    </>
  );
}
