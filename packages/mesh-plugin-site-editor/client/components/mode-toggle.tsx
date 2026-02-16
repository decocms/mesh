/**
 * Mode Toggle Component
 *
 * Toggle between edit mode (click-to-select sections) and interact mode
 * (clicks pass through to the site normally for testing links/buttons).
 */

import { MousePointer2, Hand } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";

interface ModeToggleProps {
  mode: "edit" | "interact";
  onChange: (mode: "edit" | "interact") => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
      <Button
        variant={mode === "edit" ? "default" : "ghost"}
        size="icon"
        onClick={() => onChange("edit")}
        title="Edit mode - click to select sections"
        className="h-7 w-7"
      >
        <MousePointer2 size={14} />
      </Button>
      <Button
        variant={mode === "interact" ? "default" : "ghost"}
        size="icon"
        onClick={() => onChange("interact")}
        title="Interact mode - test links and buttons"
        className="h-7 w-7"
      >
        <Hand size={14} />
      </Button>
    </div>
  );
}
