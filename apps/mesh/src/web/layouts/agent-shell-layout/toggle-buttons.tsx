/**
 * ToggleButtons — left/right panel toggles portal'd into the outer Toolbar.
 *
 * Layout differs by virtual MCP:
 *   - Non-decopilot agents: tasks + chat toggles (main panel opens/closes
 *     via the header tab bar).
 *   - Decopilot: tasks + main-view toggles (no tab bar; the main toggle
 *     replaces it).
 */

import {
  ClipboardCheck,
  LayoutRight,
  MessageChatCircle,
} from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.js";
import { useTasksPanelState } from "@/web/hooks/use-tasks-panel-state";

export interface ToggleButtonsProps {
  isDecopilot: boolean;
  chatOpen: boolean;
  mainOpen: boolean;
  toggleChat: () => void;
  toggleMain: () => void;
}

const TOGGLE_BASE =
  "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors";
const TOGGLE_ACTIVE = "bg-sidebar-accent text-sidebar-foreground";
const TOGGLE_INACTIVE =
  "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground";

export function ToggleButtons({
  isDecopilot,
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
        className={cn(TOGGLE_BASE, tasksOpen ? TOGGLE_ACTIVE : TOGGLE_INACTIVE)}
        title="Toggle tasks"
      >
        <ClipboardCheck size={16} />
      </button>
      {isDecopilot ? (
        <button
          type="button"
          onClick={toggleMain}
          aria-pressed={mainOpen}
          className={cn(
            TOGGLE_BASE,
            mainOpen ? TOGGLE_ACTIVE : TOGGLE_INACTIVE,
          )}
          title="Toggle main view"
        >
          <LayoutRight size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={toggleChat}
          aria-pressed={chatOpen}
          className={cn(
            TOGGLE_BASE,
            chatOpen ? TOGGLE_ACTIVE : TOGGLE_INACTIVE,
          )}
          title="Toggle chat"
        >
          <MessageChatCircle size={16} />
        </button>
      )}
    </>
  );
}
