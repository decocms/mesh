/**
 * ToggleButtons — the new-task shortcut + tasks/chat/main toggle buttons.
 *
 * Rendered inside the inner Suspense and portal'd up into the outer
 * Toolbar's toggle slot via <Toolbar.Toggles>.
 */

import type { MutableRefObject } from "react";
import { Edit05, LayoutLeft, Browser, LayoutRight } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.js";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { isMac } from "@/web/lib/keyboard-shortcuts";

export interface ToggleButtonsProps {
  tasksOpen: boolean;
  chatOpen: boolean;
  mainOpen: boolean;
  toggleTasks: () => void;
  toggleChat: () => void;
  toggleMain: () => void;
  onNewTaskRef: MutableRefObject<(() => void) | null>;
}

export function ToggleButtons({
  tasksOpen,
  chatOpen,
  mainOpen,
  toggleTasks,
  toggleChat,
  toggleMain,
  onNewTaskRef,
}: ToggleButtonsProps) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              onNewTaskRef.current?.();
            }}
            aria-label="New task"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <Edit05 size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-1.5">
          New task
          <span className="flex items-center gap-0.5">
            {(isMac ? ["⇧", "⌘", "S"] : ["⇧", "Ctrl", "S"]).map((key) => (
              <kbd
                key={key}
                className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-sm border border-white/20 bg-white/10 text-white/70 text-xs font-mono"
              >
                {key}
              </kbd>
            ))}
          </span>
        </TooltipContent>
      </Tooltip>
      <div className="mx-1 h-4 w-px bg-sidebar-foreground/20" />
      <button
        type="button"
        onClick={toggleTasks}
        aria-pressed={tasksOpen}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
          tasksOpen
            ? "bg-sidebar-accent text-sidebar-foreground"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
        title="Toggle tasks"
      >
        <LayoutLeft size={16} />
      </button>
      <button
        type="button"
        onClick={toggleChat}
        aria-pressed={chatOpen}
        className={cn(
          "flex size-7 items-center justify-center rounded-md transition-colors",
          chatOpen
            ? "bg-sidebar-accent text-sidebar-foreground"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
        title="Toggle chat"
      >
        <Browser size={16} />
      </button>
      <button
        type="button"
        onClick={toggleMain}
        aria-pressed={mainOpen}
        className={cn(
          "flex size-7 items-center justify-center rounded-md transition-colors",
          mainOpen
            ? "bg-sidebar-accent text-sidebar-foreground"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
        title="Toggle content"
      >
        <LayoutRight size={16} />
      </button>
    </>
  );
}
