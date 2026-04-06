import { Button } from "@deco/ui/components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { usePreferences } from "@/web/hooks/use-preferences.ts";
import { useSound } from "@/web/hooks/use-sound.ts";
import { switch005Sound } from "@deco/ui/lib/switch-005.ts";
import { BookOpen01, Image01, Link01, Settings04 } from "@untitledui/icons";
import { useState } from "react";

interface ToolsPopoverProps {
  disabled?: boolean;
  onOpenConnections: () => void;
}

export function ToolsPopover({
  disabled,
  onOpenConnections,
}: ToolsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = usePreferences();
  const isPlanMode = preferences.toolApprovalLevel === "plan";
  const playSwitchSound = useSound(switch005Sound);

  const handleTogglePlanMode = () => {
    playSwitchSound();
    setPreferences({
      ...preferences,
      toolApprovalLevel: isPlanMode ? "auto" : "plan",
    });
    setOpen(false);
  };

  const handleConnections = () => {
    onOpenConnections();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="default"
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground"
        >
          <Settings04 size={14} />
          Tools
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-52 p-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <button
          type="button"
          onClick={handleTogglePlanMode}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            "hover:bg-accent",
            isPlanMode && "text-purple-600 dark:text-purple-400",
          )}
        >
          <BookOpen01
            size={16}
            className={cn(isPlanMode && "text-purple-500")}
          />
          <span className="flex-1 text-left">Plan mode</span>
          {isPlanMode && (
            <span className="text-xs text-purple-500 font-medium">On</span>
          )}
        </button>

        <button
          type="button"
          disabled
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/50 cursor-not-allowed"
        >
          <Image01 size={16} />
          <span className="flex-1 text-left">Image</span>
          <span className="text-xs">Soon</span>
        </button>

        <button
          type="button"
          onClick={handleConnections}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
        >
          <Link01 size={16} />
          <span className="flex-1 text-left">Connections</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
