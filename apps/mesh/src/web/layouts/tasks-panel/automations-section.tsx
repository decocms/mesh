import { ChevronDown, ChevronRight, Plus } from "@untitledui/icons";
import { useProjectContext } from "@decocms/mesh-sdk";
import type { AutomationListItem } from "@/web/hooks/use-automations";
import { AutomationRow } from "./automation-row";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";

export function AutomationsSection({
  automations,
  activeAutomationId,
  onSelect,
  onNew,
}: {
  automations: AutomationListItem[];
  activeAutomationId: string | null;
  onSelect: (a: AutomationListItem) => void;
  onNew: () => void;
}) {
  const { org } = useProjectContext();
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(
    LOCALSTORAGE_KEYS.automationsSectionCollapsed(org.id),
    false,
  );

  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2 h-7 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 hover:text-foreground"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span>Automations</span>
          <span className="text-muted-foreground/70">{automations.length}</span>
        </button>
        <button
          type="button"
          onClick={onNew}
          aria-label="New automation"
          className="flex size-5 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
        >
          <Plus size={12} />
        </button>
      </div>
      {!collapsed && (
        <>
          {automations.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground/70">
              No automations
            </div>
          ) : (
            automations.map((a) => (
              <AutomationRow
                key={a.id}
                automation={a}
                isActive={activeAutomationId === a.id}
                onClick={() => onSelect(a)}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}
