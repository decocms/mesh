/**
 * MainPanelTabsBar — horizontal tab strip rendered in the agent-shell
 * header via `Toolbar.Tabs` (portal).
 *
 * Click semantics are tabs-as-toggles: clicking the active tab closes
 * the main panel; clicking any other tab opens or switches. The logic
 * lives in `resolveTabClickTarget` via `useMainPanelTabs`.
 */

import { cn } from "@deco/ui/lib/utils.js";
import { useMainPanelTabs } from "./use-main-panel-tabs";

export function MainPanelTabsBar({
  virtualMcpId,
  taskId,
}: {
  virtualMcpId: string;
  taskId: string;
}) {
  const {
    activeTab,
    mainOpen,
    setActiveTab,
    systemTabs,
    layoutTabs,
    expandedTools,
    automationTabParsed,
  } = useMainPanelTabs({ virtualMcpId, taskId });

  const isActive = (id: string) => mainOpen && activeTab === id;

  return (
    <div className="flex items-center min-w-0">
      {systemTabs.map((t) => (
        <HeaderTabButton
          key={t.id}
          title={t.title}
          active={isActive(t.id)}
          onClick={() => setActiveTab(t.id)}
        />
      ))}
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
      {automationTabParsed && (
        <HeaderTabButton
          title={
            automationTabParsed.kind === "new" ? "New automation" : "Automation"
          }
          active={isActive(activeTab)}
          onClick={() => setActiveTab(activeTab)}
          ephemeral
        />
      )}
    </div>
  );
}

function HeaderTabButton({
  title,
  active,
  onClick,
  ephemeral,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  ephemeral?: boolean;
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
        ephemeral && "italic",
      )}
    >
      {title}
    </button>
  );
}
