/**
 * ToggleButtons — tasks/chat toggle buttons.
 *
 * Rendered inside the inner Suspense and portal'd up into the outer
 * Toolbar's toggle slot via <Toolbar.Toggles>.
 *
 * Tasks state is read directly from useTasksPanelState (URL-driven, owned
 * outside the agent subtree). Chat state is passed in as props from the
 * agent provider. The main-panel toggle was removed — the header tab
 * bar now opens/closes the main panel.
 */

import { LayoutLeft, Browser } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.js";
import { useTasksPanelState } from "@/web/hooks/use-tasks-panel-state";

export interface ToggleButtonsProps {
  chatOpen: boolean;
  toggleChat: () => void;
}

export function ToggleButtons({ chatOpen, toggleChat }: ToggleButtonsProps) {
  const { tasksOpen, toggleTasks } = useTasksPanelState();

  return (
    <>
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
    </>
  );
}
