import { useConnections } from "@/web/hooks/collections/use-connection";
import { ItemCard } from "../tool-selector";
import { usePrioritizedList } from "./hooks/use-prioritized-list";

export function ConnectionSelector({
  selectedConnectionName,
  onSelect,
}: {
  selectedConnectionName: string | null;
  onSelect: (connectionId: string) => void;
}) {
  const connections = useConnections();
  const prioritizedConnections = usePrioritizedList(
    connections,
    connections.find((c) => c.title === selectedConnectionName) ?? null,
    (c) => c.title,
    (a, b) => a.title.localeCompare(b.title),
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {prioritizedConnections.map((connection) => (
          <ItemCard
            key={connection.id}
            selected={connection.title === selectedConnectionName}
            item={{
              icon: connection.icon,
              title: connection.title,
            }}
            onClick={() => onSelect(connection.id)}
          />
        ))}
      </div>
    </div>
  );
}
