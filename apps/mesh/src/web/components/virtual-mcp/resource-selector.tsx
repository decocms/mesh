import { ItemSetSelector, type SelectableItem } from "./item-selector";
import type { useConnections } from "@/web/hooks/collections/use-connection";
import { Input } from "@deco/ui/components/input.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Plus, X } from "@untitledui/icons";
import { useState } from "react";

export interface ResourceSetSelectorProps {
  /** Current selection: connectionId -> array of selected resource URIs or patterns */
  resourceSet: Record<string, string[]>;
  /** Callback when selection changes */
  onResourceSetChange: (resourceSet: Record<string, string[]>) => void;
  /** Resources per connection: connectionId -> array of resources */
  connectionResources: Map<
    string,
    Array<{ uri: string; name?: string; description?: string }>
  >;
  /** Virtual MCP ID to exclude from selection (prevents self-reference) */
  excludeVirtualMcpId?: string;
}

/**
 * Check if a string is a pattern (contains wildcards)
 */
function isPattern(value: string): boolean {
  return value.includes("*");
}

/**
 * Pattern input component for adding resource URI patterns
 */
function PatternInput({
  patterns,
  onAddPattern,
  onRemovePattern,
}: {
  patterns: string[];
  onAddPattern: (pattern: string) => void;
  onRemovePattern: (pattern: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  const handleAddPattern = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !patterns.includes(trimmed)) {
      onAddPattern(trimmed);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddPattern();
    }
  };

  // Filter to only show patterns (not exact URIs)
  const displayPatterns = patterns.filter(isPattern);

  return (
    <div className="border-b border-border p-4 space-y-3">
      <div className="text-xs text-muted-foreground">
        Add URI patterns to match multiple resources. Use <code>*</code> for
        single segment and <code>**</code> for multiple segments.
      </div>
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., file:///**/*.ts or db://users/*"
          className="flex-1 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddPattern}
          disabled={!inputValue.trim()}
        >
          <Plus size={16} />
        </Button>
      </div>
      {displayPatterns.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {displayPatterns.map((pattern) => (
            <div
              key={pattern}
              className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-xs"
            >
              <code className="text-foreground">{pattern}</code>
              <button
                type="button"
                onClick={() => onRemovePattern(pattern)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ResourceSetSelector - Selector for resources in Virtual MCP configuration
 *
 * Supports both individual resource selection (via checkboxes) and
 * pattern-based selection (via URI patterns with wildcards).
 */
export function ResourceSetSelector({
  resourceSet,
  onResourceSetChange,
  connectionResources,
  excludeVirtualMcpId,
}: ResourceSetSelectorProps) {
  const [selectedConnectionId, _setSelectedConnectionId] = useState<
    string | null
  >(null);

  const getResources = (
    connection: ReturnType<typeof useConnections>[number],
  ): SelectableItem[] => {
    const resources = connectionResources.get(connection.id) ?? [];
    return resources.map((r) => ({
      id: r.uri,
      name: r.name || r.uri,
      description: r.description || r.uri,
    }));
  };

  const handleAddPattern = (connectionId: string, pattern: string) => {
    const currentItems = resourceSet[connectionId] ?? [];
    if (!currentItems.includes(pattern)) {
      onResourceSetChange({
        ...resourceSet,
        [connectionId]: [...currentItems, pattern],
      });
    }
  };

  const handleRemovePattern = (connectionId: string, pattern: string) => {
    const currentItems = resourceSet[connectionId] ?? [];
    const updated = currentItems.filter((item) => item !== pattern);
    if (updated.length === 0) {
      const newSet = { ...resourceSet };
      delete newSet[connectionId];
      onResourceSetChange(newSet);
    } else {
      onResourceSetChange({
        ...resourceSet,
        [connectionId]: updated,
      });
    }
  };

  // Track which connection is selected to show pattern input
  const handleItemSetChange = (newResourceSet: Record<string, string[]>) => {
    onResourceSetChange(newResourceSet);
  };

  // Get patterns for the selected connection
  const selectedPatterns = selectedConnectionId
    ? (resourceSet[selectedConnectionId] ?? [])
    : [];

  const extraContent = selectedConnectionId ? (
    <PatternInput
      patterns={selectedPatterns}
      onAddPattern={(pattern) =>
        handleAddPattern(selectedConnectionId, pattern)
      }
      onRemovePattern={(pattern) =>
        handleRemovePattern(selectedConnectionId, pattern)
      }
    />
  ) : null;

  return (
    <div className="h-full">
      <ItemSetSelector
        itemSet={resourceSet}
        onItemSetChange={handleItemSetChange}
        getItems={getResources}
        itemLabel="resources"
        emptyItemsMessage="This connection has no resources available"
        extraContent={extraContent}
        excludeVirtualMcpId={excludeVirtualMcpId}
      />
    </div>
  );
}
