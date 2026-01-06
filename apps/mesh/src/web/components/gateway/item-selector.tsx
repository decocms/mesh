import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Checkbox } from "@deco/ui/components/checkbox.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { ArrowLeft } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { memo, useDeferredValue, useRef, useState } from "react";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";

/**
 * Generic item that can be displayed in the selector
 */
export interface SelectableItem {
  id: string; // Unique identifier (e.g., tool name, resource URI, prompt name)
  name: string; // Display name
  description?: string; // Optional description
}

/**
 * Connection with items that can be selected
 */
export interface ConnectionWithItems {
  id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  items: SelectableItem[];
}

export interface ItemSetSelectorProps {
  /** Current selection: connectionId -> array of selected item ids */
  itemSet: Record<string, string[]>;
  /** Callback when selection changes */
  onItemSetChange: (itemSet: Record<string, string[]>) => void;
  /** Function to get items from a connection */
  getItems: (
    connection: ReturnType<typeof useConnections>[number],
  ) => SelectableItem[];
  /** Label for items (e.g., "tools", "resources", "prompts") */
  itemLabel: string;
  /** Placeholder for empty state */
  emptyItemsMessage?: string;
  /** Extra content to render in the items panel */
  extraContent?: React.ReactNode;
}

interface ConnectionItemProps {
  connection: {
    id: string;
    title: string;
    description?: string | null;
    icon?: string | null;
  };
  isSelected: boolean;
  hasItemsEnabled: boolean;
  activeItemsCount: number;
  totalItemsCount: number;
  onSelect: () => void;
  onToggle: () => void;
}

const ConnectionItem = memo(function ConnectionItem({
  connection,
  isSelected,
  hasItemsEnabled,
  activeItemsCount,
  totalItemsCount,
  onSelect,
  onToggle,
}: ConnectionItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2 rounded-lg transition-colors will-change-auto",
        isSelected ? "bg-accent/50" : "hover:bg-muted/50",
      )}
    >
      <div
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={onSelect}
      >
        <IntegrationIcon
          icon={connection.icon}
          name={connection.title}
          size="xs"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {connection.title}
          </p>
        </div>
      </div>
      {totalItemsCount > 0 && (
        <>
          <span className="text-xs text-muted-foreground shrink-0">
            {activeItemsCount}/{totalItemsCount}
          </span>
          <Checkbox
            checked={hasItemsEnabled}
            onCheckedChange={onToggle}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      )}
    </div>
  );
});

interface SelectableItemRowProps {
  connectionId: string;
  item: SelectableItem;
  isSelected: boolean;
  onToggle: () => void;
}

const SelectableItemRow = memo(function SelectableItemRow({
  connectionId,
  item,
  isSelected,
  onToggle,
}: SelectableItemRowProps) {
  return (
    <label
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer group will-change-auto"
      htmlFor={`item-${connectionId}-${item.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              "text-sm font-medium",
              isSelected ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {item.name}
          </span>
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
      <div className="flex items-center shrink-0">
        <Checkbox
          id={`item-${connectionId}-${item.id}`}
          checked={isSelected}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </label>
  );
});

type FilterMode = "all" | "selected" | "unselected";

export function ItemSetSelector({
  itemSet,
  onItemSetChange,
  getItems,
  itemLabel,
  emptyItemsMessage,
  extraContent,
}: ItemSetSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const initialOrder = useRef<Set<string>>(new Set(Object.keys(itemSet)));

  const connections = useConnections({
    searchTerm: deferredSearchQuery.trim() || undefined,
  });

  const initialOrderSet = initialOrder.current;

  // selected first
  const selected = [...initialOrderSet.values()]
    .map((id) => connections.find((c) => c.id === id))
    .filter((c) => c !== undefined);

  // then not selected
  const notSelected = connections.filter((c) => !initialOrderSet.has(c.id));

  const sortedConnections = [...selected, ...notSelected];

  // Check if connection has any items enabled
  const isConnectionSelected = (connectionId: string): boolean => {
    const enabledItems = itemSet[connectionId];
    return enabledItems !== undefined && enabledItems.length > 0;
  };

  // Apply filter
  const filteredConnections = sortedConnections.filter((connection) => {
    if (filterMode === "all") return true;
    const hasItems = isConnectionSelected(connection.id);
    if (filterMode === "selected") return hasItems;
    if (filterMode === "unselected") return !hasItems;
    return true;
  });

  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(sortedConnections[0]?.id ?? null);

  // Get selected connection
  const selectedConnection = selectedConnectionId
    ? (sortedConnections.find((c) => c.id === selectedConnectionId) ?? null)
    : null;

  // Get items for selected connection
  const connectionItems = selectedConnection
    ? getItems(selectedConnection)
    : [];

  // Check if specific item is enabled
  const isItemSelected = (connectionId: string, itemId: string): boolean => {
    return itemSet[connectionId]?.includes(itemId) ?? false;
  };

  // Toggle a single item
  const toggleItem = (connectionId: string, itemId: string) => {
    const currentItems = itemSet[connectionId] ?? [];
    const isSelected = currentItems.includes(itemId);

    const newItemSet = { ...itemSet };

    if (isSelected) {
      // Remove item
      const updatedItems = currentItems.filter((t) => t !== itemId);
      if (updatedItems.length === 0) {
        // Remove connection entry if no items left
        delete newItemSet[connectionId];
      } else {
        newItemSet[connectionId] = updatedItems;
      }
    } else {
      // Add item
      newItemSet[connectionId] = [...currentItems, itemId];
    }

    onItemSetChange(newItemSet);
  };

  // Toggle all items for a connection
  const toggleConnection = (connectionId: string) => {
    const connection = sortedConnections.find((c) => c.id === connectionId);
    if (!connection) return;

    const items = getItems(connection);
    if (items.length === 0) return;

    const currentItems = itemSet[connectionId] ?? [];
    const allItemIds = items.map((t) => t.id);
    const allSelected =
      currentItems.length > 0 &&
      allItemIds.every((id) => currentItems.includes(id));

    const newItemSet = { ...itemSet };

    if (allSelected) {
      // Deselect all items
      delete newItemSet[connectionId];
    } else {
      // Select all items
      newItemSet[connectionId] = allItemIds;
      // Set this connection as the selected connection
      setSelectedConnectionId(connectionId);
    }

    onItemSetChange(newItemSet);
  };

  // Handle connection selection (mobile opens detail view)
  const handleConnectionSelect = (connectionId: string) => {
    setSelectedConnectionId(connectionId);
    setShowMobileDetail(true);
  };

  // Handle back button (mobile only)
  const handleMobileBack = () => {
    setShowMobileDetail(false);
  };

  return (
    <div className="flex h-full">
      {/* Left Column - Connections List (hidden on mobile when detail view is shown) */}
      <div
        className={cn(
          "w-full md:w-80 border-r border-border flex flex-col",
          showMobileDetail && "hidden md:flex",
        )}
      >
        {/* Search Input */}
        <CollectionSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search connections..."
        />

        {/* Filter Buttons */}
        <div className="flex gap-1 p-2 border-b border-border">
          <button
            onClick={() => setFilterMode("all")}
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border cursor-pointer",
              filterMode === "all"
                ? "bg-muted border-border"
                : "border-border opacity-75 hover:opacity-100",
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilterMode("selected")}
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border cursor-pointer",
              filterMode === "selected"
                ? "bg-muted border-border"
                : "border-border opacity-75 hover:opacity-100",
            )}
          >
            Selected
          </button>
          <button
            onClick={() => setFilterMode("unselected")}
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border cursor-pointer",
              filterMode === "unselected"
                ? "bg-muted border-border"
                : "border-border opacity-75 hover:opacity-100",
            )}
          >
            Unselected
          </button>
        </div>

        {/* Connections List */}
        <div className="flex-1 overflow-auto">
          {filteredConnections.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {searchQuery
                ? "No connections found"
                : filterMode === "selected"
                  ? "No servers selected"
                  : filterMode === "unselected"
                    ? "No unselected servers"
                    : "No connections available"}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredConnections.map((connection) => {
                const items = getItems(connection);
                const totalItems = items.length;
                const activeItems = itemSet[connection.id]?.length ?? 0;

                return (
                  <ConnectionItem
                    key={connection.id}
                    connection={connection}
                    isSelected={selectedConnectionId === connection.id}
                    hasItemsEnabled={isConnectionSelected(connection.id)}
                    activeItemsCount={activeItems}
                    totalItemsCount={totalItems}
                    onSelect={() => handleConnectionSelect(connection.id)}
                    onToggle={() => toggleConnection(connection.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Column - Items List (full width on mobile when shown) */}
      <div
        className={cn(
          "flex-1 flex-col",
          showMobileDetail ? "flex" : "hidden md:flex",
        )}
      >
        {selectedConnection ? (
          <>
            {/* Mobile Header with Back Button */}
            <div className="md:hidden border-b border-border p-4 flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMobileBack}
                className="h-8 w-8 p-0 shrink-0"
              >
                <ArrowLeft size={20} />
              </Button>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <IntegrationIcon
                  icon={selectedConnection.icon}
                  name={selectedConnection.title}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-medium text-foreground truncate">
                    {selectedConnection.title}
                  </h3>
                  {selectedConnection.description && (
                    <p className="text-sm text-muted-foreground truncate">
                      {selectedConnection.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Extra content (e.g., pattern input for resources) */}
            {extraContent}

            {/* Items List */}
            <div className="flex-1 overflow-auto p-4">
              {connectionItems.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  {emptyItemsMessage ||
                    `This connection has no ${itemLabel} available`}
                </div>
              ) : (
                <div className="space-y-2">
                  {connectionItems.map((item) => (
                    <SelectableItemRow
                      key={item.id}
                      connectionId={selectedConnection.id}
                      item={item}
                      isSelected={isItemSelected(
                        selectedConnection.id,
                        item.id,
                      )}
                      onToggle={() =>
                        toggleItem(selectedConnection.id, item.id)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm text-muted-foreground text-center">
              Select a connection to view its {itemLabel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
