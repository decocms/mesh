import { ItemSetSelector, type SelectableItem } from "./item-selector";
import type { useConnections } from "@/web/hooks/collections/use-connection";

export interface PromptSetSelectorProps {
  /** Current selection: connectionId -> array of selected prompt names */
  promptSet: Record<string, string[]>;
  /** Callback when selection changes */
  onPromptSetChange: (promptSet: Record<string, string[]>) => void;
  /** Prompts per connection: connectionId -> array of prompts */
  connectionPrompts: Map<string, Array<{ name: string; description?: string }>>;
  /** Virtual MCP ID to exclude from selection (prevents self-reference) */
  excludeVirtualMcpId?: string;
}

/**
 * PromptSetSelector - Selector for prompts in Virtual MCP configuration
 *
 * Reuses the ItemSetSelector pattern for consistent UX with tools.
 */
export function PromptSetSelector({
  promptSet,
  onPromptSetChange,
  connectionPrompts,
  excludeVirtualMcpId,
}: PromptSetSelectorProps) {
  const getPrompts = (
    connection: ReturnType<typeof useConnections>[number],
  ): SelectableItem[] => {
    const prompts = connectionPrompts.get(connection.id) ?? [];
    return prompts.map((p) => ({
      id: p.name,
      name: p.name,
      description: p.description,
    }));
  };

  return (
    <ItemSetSelector
      itemSet={promptSet}
      onItemSetChange={onPromptSetChange}
      getItems={getPrompts}
      itemLabel="prompts"
      emptyItemsMessage="This connection has no prompts available"
      excludeVirtualMcpId={excludeVirtualMcpId}
    />
  );
}
