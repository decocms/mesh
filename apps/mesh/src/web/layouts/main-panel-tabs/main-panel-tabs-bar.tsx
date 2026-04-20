/**
 * MainPanelTabsBar — horizontal tab strip rendered in the agent-shell
 * header via `Toolbar.Tabs` (portal).
 *
 * Click semantics are tabs-as-toggles: clicking the active tab closes
 * the main panel; clicking any other tab opens or switches. The logic
 * lives in `resolveTabClickTarget` via `useMainPanelTabs`.
 *
 * Exception: the Automations pill represents two URL states — the list
 * (`?main=automations`) and the detail (`?main=automation:<id>`). It uses
 * `resolveAutomationsPillClickTarget` so that clicking on the detail
 * navigates back up to the list instead of closing.
 */

import { cn } from "@deco/ui/lib/utils.js";
import { useNavigate } from "@tanstack/react-router";
import {
  isAutomationsPillActive,
  resolveAutomationsPillClickTarget,
} from "./tab-id";
import { useMainPanelTabs } from "./use-main-panel-tabs";

export function MainPanelTabsBar({
  virtualMcpId,
  taskId,
}: {
  virtualMcpId: string;
  taskId: string;
}) {
  const navigate = useNavigate();
  const {
    activeTab,
    mainOpen,
    setActiveTab,
    systemTabs,
    layoutTabs,
    expandedTools,
  } = useMainPanelTabs({ virtualMcpId, taskId });

  const isActive = (id: string) => mainOpen && activeTab === id;

  const onAutomationsClick = () => {
    const target = resolveAutomationsPillClickTarget({ activeTab, mainOpen });
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, main: target }),
      replace: true,
    });
  };

  return (
    <div className="flex items-center min-w-0 ml-auto">
      {systemTabs.map((t) => {
        if (t.id === "automations") {
          return (
            <HeaderTabButton
              key={t.id}
              title={t.title}
              active={isAutomationsPillActive({ activeTab, mainOpen })}
              onClick={onAutomationsClick}
            />
          );
        }
        return (
          <HeaderTabButton
            key={t.id}
            title={t.title}
            active={isActive(t.id)}
            onClick={() => setActiveTab(t.id)}
          />
        );
      })}
      {layoutTabs.map((t) => (
        <HeaderTabButton
          key={t.id}
          title={t.title}
          active={isActive(t.id)}
          onClick={() => setActiveTab(t.id)}
        />
      ))}
      {expandedTools.map((t) => (
        <HeaderTabButton
          key={t.toolName}
          title={t.toolName}
          active={isActive(t.toolName)}
          onClick={() => setActiveTab(t.toolName)}
        />
      ))}
    </div>
  );
}

function HeaderTabButton({
  title,
  active,
  onClick,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 px-3 h-10 text-xs font-medium capitalize transition-colors",
        active
          ? "text-foreground border-b-2 border-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {title}
    </button>
  );
}
