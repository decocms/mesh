/**
 * ToggleButtons — tasks/chat/main toggle buttons.
 *
 * Rendered inside the inner Suspense and portal'd up into the outer
 * Toolbar's toggle slot via <Toolbar.Toggles>.
 *
 * Tasks state is read directly from useTasksPanelState (URL-driven, owned
 * outside the agent subtree). Chat/main state is passed in as props from
 * the agent provider.
 */

import { LayoutLeft, Browser, LayoutRight } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.js";
import { useTasksPanelState } from "@/web/hooks/use-tasks-panel-state";

export interface ToggleButtonsProps {
  chatOpen: boolean;
  mainOpen: boolean;
  toggleChat: () => void;
  toggleMain: () => void;
}

export function ToggleButtons({
  chatOpen,
  mainOpen,
  toggleChat,
  toggleMain,
}: ToggleButtonsProps) {
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
