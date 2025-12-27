import { useConnection } from "@/web/hooks/collections/use-connection";
import { ItemCard } from "../tool-selector";
import type { ToolStep } from "../types";
import { usePrioritizedList } from "./hooks/use-prioritized-list";

export function ToolSelector({
  toolStep,
  onSelect,
  toolName,
}: {
  toolStep: ToolStep;
  onSelect: (toolName: string) => void;
  toolName?: string;
}) {
  const connection = useConnection(toolStep?.action?.connectionId ?? "");
  const tools = connection?.tools ?? [];
  const prioritizedTools = usePrioritizedList(
    tools,
    tools.find((t) => t.name === toolName) ?? null,
    (t) => t.name,
    (a, b) => a.name.localeCompare(b.name),
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {prioritizedTools.map((tool) => (
          <ItemCard
            key={tool.name}
            selected={tool.name === toolName}
            item={{
              icon: connection?.icon ?? null,
              title: tool.name,
            }}
            onClick={() => onSelect(tool.name)}
          />
        ))}
      </div>
    </div>
  );
}
