import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import {
  Command,
  CommandItem,
  CommandGroup,
  CommandList,
  CommandInput,
} from "@deco/ui/components/command.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";

export interface ToolSelectorProps {
  selectedConnectionId: string | null;
  onConnectionSelect: (connectionId: string | null) => void;
}

export function ConnectionSelector({
  selectedConnectionId,
  onConnectionSelect,
}: ToolSelectorProps) {
  // Load all connections once, filter client-side to avoid re-fetch flicker
  const allConnections = useConnections();
  const [searchQuery, setSearchQuery] = useState("");

  // Client-side search filtering
  const connections = (() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return allConnections;
    return allConnections.filter(
      (c) =>
        c.title.toLowerCase().includes(term) ||
        c.description?.toLowerCase().includes(term),
    );
  })();

  // Keep selected connection even if filtered out of search results
  const selectedConnection =
    allConnections.find((c) => c.id === selectedConnectionId) ?? null;

  return (
    <div className="flex flex-col">
      <Command>
        <CommandInput
          placeholder="Search connections..."
          value={searchQuery}
          onValueChange={(value) => setSearchQuery(value)}
        />
        <CommandList>
          <CommandGroup>
            {connections.map((connection) => (
              <CommandItem
                key={connection.id}
                value={connection.id}
                onSelect={() => onConnectionSelect(connection.id)}
              >
                <ItemCard
                  item={{
                    icon: connection.icon ?? "",
                    title: connection.title,
                  }}
                  selected={selectedConnectionId === connection.id}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>

      {/* Empty state when no connection selected */}
      {!selectedConnection && connections.length > 0 && (
        <div className="border-t border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Select a connection to view tools
          </p>
        </div>
      )}
    </div>
  );
}

export function ToolSelector({
  selectedConnectionId,
  selectedToolName,
  onToolNameChange,
}: {
  selectedConnectionId: string | null;
  selectedToolName: string | null;
  onToolNameChange: (toolName: string | null) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const connections = useConnections();
  const selectedConnection = connections.find(
    (c) => c.id === selectedConnectionId,
  );
  const connectionTools = selectedConnection?.tools ?? [];
  const isToolSelected = (toolName: string) => selectedToolName === toolName;
  return (
    selectedConnection && (
      <div className="border-t border-border">
        <div className="relative">
          <Command>
            <CommandInput
              placeholder="Search tools..."
              value={searchQuery}
              onValueChange={(value) => setSearchQuery(value)}
            />
            <CommandList>
              <CommandGroup>
                {connectionTools.map((t) => (
                  <CommandItem
                    key={t.name}
                    value={t.name}
                    onSelect={() => onToolNameChange(t.name)}
                  >
                    <ItemCard
                      item={{ icon: null, title: t.name }}
                      selected={isToolSelected(t.name)}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </div>
    )
  );
}

export function ItemCard({
  item,
  selected,
  backButton = false,
}: {
  item: { icon: string | null; title: string };
  selected: boolean;
  backButton?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer w-full",
        selected && "bg-primary/10 hover:bg-primary/20",
      )}
    >
      {backButton && (
        <ChevronLeft
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            selected ? "text-foreground" : "text-muted-foreground/50",
          )}
        />
      )}
      {item.icon !== null && (
        <IntegrationIcon icon={item.icon ?? null} name={item.title} size="sm" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {item.title}
        </p>
      </div>
    </div>
  );
}
