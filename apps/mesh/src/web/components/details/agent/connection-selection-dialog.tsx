import type { VirtualMCPEntity } from "@/tools/virtual/schema";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Checkbox,
  type CheckboxVariant,
} from "@deco/ui/components/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@deco/ui/components/dialog.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deco/ui/components/tabs.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  useConnections,
  useMCPClient,
  useMCPPromptsList,
  useMCPResourcesList,
  useMCPToolsList,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { CubeOutline, File02, Loading01, Tool01 } from "@untitledui/icons";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";

// Form types
// SelectionValue state meanings:
// - null: all items explicitly selected (e.g., clicked "Select All")
// - string[]: specific items selected (e.g., ["tool1", "tool2"])
// - undefined: connection not in form yet (no selections made)
// Note: Empty array [] means no items selected (all explicitly deselected)
type SelectionValue = string[] | null;

interface ConnectionFormValue {
  tools: SelectionValue;
  resources: SelectionValue;
  prompts: SelectionValue;
}

type FormData = Record<string, ConnectionFormValue>;

export interface ConnectionSelection {
  connectionId: string;
  selectedTools: string[] | null;
  selectedResources: string[] | null;
  selectedPrompts: string[] | null;
  totalToolsCount: number;
}

// Generic item type for selections
interface SelectableItem {
  id: string;
  name: string;
  description?: string;
}

// Loading spinner component
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <Loading01 className="animate-spin text-muted-foreground" size={24} />
    </div>
  );
}

// Generic Selection Item Component
function SelectionItem({
  item,
  isSelected,
  onToggle,
  checkboxVariant,
}: {
  item: SelectableItem;
  isSelected: boolean;
  onToggle: () => void;
  checkboxVariant: CheckboxVariant;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg cursor-pointer transition-colors",
        isSelected ? "bg-accent/25" : "hover:bg-muted/50",
      )}
    >
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-sm font-medium leading-none">{item.name}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
      <Checkbox
        variant={checkboxVariant}
        checked={isSelected}
        onCheckedChange={onToggle}
        className="mt-0.5"
      />
    </label>
  );
}

// Generic Selection Tab Component
function SelectionTab({
  items,
  selections,
  onToggle,
  onToggleAll,
  checkboxVariant,
  emptyMessage,
}: {
  items: SelectableItem[];
  selections: SelectionValue;
  onToggle: (itemId: string, allItemIds: string[]) => void;
  onToggleAll: () => void;
  checkboxVariant: CheckboxVariant;
  emptyMessage: string;
}) {
  const isAllSelected = selections === null;
  const allItemIds = items.map((item) => item.id);

  return (
    <div className="flex flex-col h-full">
      {/* Select All checkbox */}
      <div className="px-4 border-b border-border shrink-0">
        <label className="flex items-start gap-3 p-4 cursor-pointer">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium">
              Select All ({items.length})
            </span>
          </div>
          <Checkbox
            variant={checkboxVariant}
            checked={isAllSelected && items.length > 0}
            onCheckedChange={onToggleAll}
            className="mt-0.5"
          />
        </label>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-auto px-4 py-3 space-y-1">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          items.map((item) => {
            const isSelected =
              selections === null || selections.includes(item.id);
            return (
              <SelectionItem
                key={item.id}
                item={item}
                isSelected={isSelected}
                onToggle={() => onToggle(item.id, allItemIds)}
                checkboxVariant={checkboxVariant}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// Tools Tab Wrapper
function ToolsTab({
  connectionId,
  orgId,
  selections,
  onToggle,
  onToggleAll,
  checkboxVariant,
}: {
  connectionId: string;
  orgId: string;
  selections: SelectionValue;
  onToggle: (toolName: string, allToolNames: string[]) => void;
  onToggleAll: () => void;
  checkboxVariant: CheckboxVariant;
}) {
  const client = useMCPClient({ connectionId, orgId });
  const { data } = useMCPToolsList({ client });

  const items: SelectableItem[] = data.tools.map((tool) => ({
    id: tool.name,
    name: tool.name,
    description: tool.description,
  }));

  return (
    <SelectionTab
      items={items}
      selections={selections}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      checkboxVariant={checkboxVariant}
      emptyMessage="No tools available"
    />
  );
}

// Resources Tab Wrapper
function ResourcesTab({
  connectionId,
  orgId,
  selections,
  onToggle,
  onToggleAll,
  checkboxVariant,
}: {
  connectionId: string;
  orgId: string;
  selections: SelectionValue;
  onToggle: (name: string, allResourceNames: string[]) => void;
  onToggleAll: () => void;
  checkboxVariant: CheckboxVariant;
}) {
  const client = useMCPClient({ connectionId, orgId });
  const { data } = useMCPResourcesList({ client });

  const items: SelectableItem[] = data.resources.map((resource) => ({
    id: resource.name || resource.uri,
    name: resource.name || resource.uri,
    description: resource.description,
  }));

  return (
    <SelectionTab
      items={items}
      selections={selections}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      checkboxVariant={checkboxVariant}
      emptyMessage="No resources available"
    />
  );
}

// Prompts Tab Wrapper
function PromptsTab({
  connectionId,
  orgId,
  selections,
  onToggle,
  onToggleAll,
  checkboxVariant,
}: {
  connectionId: string;
  orgId: string;
  selections: SelectionValue;
  onToggle: (name: string, allPromptNames: string[]) => void;
  onToggleAll: () => void;
  checkboxVariant: CheckboxVariant;
}) {
  const client = useMCPClient({ connectionId, orgId });
  const { data } = useMCPPromptsList({ client });

  const items: SelectableItem[] = data.prompts.map((prompt) => ({
    id: prompt.name,
    name: prompt.name,
    description: prompt.description,
  }));

  return (
    <SelectionTab
      items={items}
      selections={selections}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      checkboxVariant={checkboxVariant}
      emptyMessage="No prompts available"
    />
  );
}

// Connection Sidebar Item Component
function ConnectionSidebarItem({
  connection,
  isSelected,
  hasSelections,
  summary,
  checkboxVariant,
  onClick,
  onToggleAll,
}: {
  connection: { id: string; title: string; icon?: string | null };
  isSelected: boolean;
  hasSelections: boolean;
  summary: string;
  checkboxVariant: CheckboxVariant;
  onClick: () => void;
  onToggleAll: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 h-12 rounded-lg cursor-pointer transition-colors",
        isSelected ? "bg-accent" : "hover:bg-muted/50",
      )}
      onClick={onClick}
    >
      <IntegrationIcon
        icon={connection.icon}
        name={connection.title}
        size="xs"
        className="shrink-0"
      />
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <p className="text-sm font-medium text-foreground truncate">
          {connection.title}
        </p>
        {hasSelections && summary && (
          <p className="text-xs text-muted-foreground truncate">{summary}</p>
        )}
      </div>
      <Checkbox
        variant={checkboxVariant}
        checked={hasSelections}
        onCheckedChange={onToggleAll}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />
    </div>
  );
}

interface ConnectionSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSelectedConnectionId: string | null;
  virtualMcp: VirtualMCPEntity;
  onSave: (selections: ConnectionSelection[]) => void;
}

// Helper: Initialize form data from virtualMcp
function initializeFormData(virtualMcp: VirtualMCPEntity): FormData {
  const formData: FormData = {};
  for (const conn of virtualMcp.connections) {
    formData[conn.connection_id] = {
      tools: conn.selected_tools,
      resources: conn.selected_resources ?? null,
      prompts: conn.selected_prompts ?? null,
    };
  }
  return formData;
}

export function ConnectionSelectionDialog({
  open,
  onOpenChange,
  defaultSelectedConnectionId,
  virtualMcp,
  onSave,
}: ConnectionSelectionDialogProps) {
  const allConnections = useConnections({});
  const { org } = useProjectContext();
  const [connectionSearch, setConnectionSearch] = useState("");
  const checkboxVariant: CheckboxVariant = "default";

  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(() => defaultSelectedConnectionId ?? allConnections[0]?.id ?? null);

  const [activeTab, setActiveTab] = useState<"tools" | "resources" | "prompts">(
    "tools",
  );

  // Use react-hook-form for state management
  const { watch, setValue, reset } = useForm<FormData>({
    defaultValues: initializeFormData(virtualMcp),
  });

  const formData = watch();

  const currentConnection = selectedConnectionId
    ? allConnections.find((c) => c.id === selectedConnectionId)
    : null;

  // Get current selections for the selected connection
  // Default to empty arrays ([]) when connection not in form (no selections yet)
  const currentSelections = selectedConnectionId
    ? (formData[selectedConnectionId] ?? {
        tools: [],
        resources: [],
        prompts: [],
      })
    : { tools: [], resources: [], prompts: [] };

  const connectedIds = new Set(
    virtualMcp.connections.map((c) => c.connection_id),
  );

  const availableConnections = [...allConnections].sort((a, b) => {
    const aConnected = connectedIds.has(a.id);
    const bConnected = connectedIds.has(b.id);
    if (aConnected && !bConnected) return -1;
    if (!aConnected && bConnected) return 1;
    return a.title.localeCompare(b.title);
  });

  const filteredConnections = connectionSearch
    ? availableConnections.filter(
        (conn) =>
          conn.title.toLowerCase().includes(connectionSearch.toLowerCase()) ||
          conn.description
            ?.toLowerCase()
            .includes(connectionSearch.toLowerCase()),
      )
    : availableConnections;

  // Check if a connection has any selections
  // Returns true if:
  // - Any field is null (all items selected)
  // - Any field has items in the array (specific items selected)
  // - Connection exists in virtualMcp (previously saved)
  // Returns false if:
  // - Connection not in formData (undefined)
  // - All fields are empty arrays (explicitly deselected)
  const hasSelections = (connId: string): boolean => {
    const sel = formData[connId];
    if (!sel) return false;
    const hasTools = sel.tools === null || (sel.tools && sel.tools.length > 0);
    const hasResources =
      sel.resources === null || (sel.resources && sel.resources.length > 0);
    const hasPrompts =
      sel.prompts === null || (sel.prompts && sel.prompts.length > 0);
    const isInVirtualMcp = virtualMcp.connections.some(
      (c) => c.connection_id === connId,
    );
    return hasTools || hasResources || hasPrompts || isInVirtualMcp;
  };

  const getSelectionSummary = (connId: string): string => {
    const sel = formData[connId];
    if (!sel) return "";
    const parts: string[] = [];
    if (sel.tools === null) {
      parts.push("all tools");
    } else if (sel.tools && sel.tools.length > 0) {
      parts.push(`${sel.tools.length} tools`);
    }
    if (sel.resources === null) {
      parts.push("all resources");
    } else if (sel.resources && sel.resources.length > 0) {
      parts.push(`${sel.resources.length} resources`);
    }
    if (sel.prompts === null) {
      parts.push("all prompts");
    } else if (sel.prompts && sel.prompts.length > 0) {
      parts.push(`${sel.prompts.length} prompts`);
    }
    return parts.join(", ");
  };

  // Generic toggle function for individual items
  // Handles state transitions:
  // - null → [all except clicked]: Deselecting from "all selected"
  // - undefined → [clicked]: First selection for this connection
  // - [items] including clicked → [items without clicked]: Deselecting item
  // - [items] not including clicked → [items + clicked]: Selecting item
  // Auto-converts to null when all items manually selected for consistency
  const toggleItem = (
    connId: string,
    field: "tools" | "resources" | "prompts",
    itemId: string,
    allItemIds: string[],
  ) => {
    const currentSelection = formData[connId]?.[field];
    let newSelection: SelectionValue;

    if (currentSelection === null) {
      // State: null (all selected) → [all except clicked]
      // User is deselecting one item from "all selected"
      newSelection = allItemIds.filter((id) => id !== itemId);
    } else if (currentSelection?.includes(itemId)) {
      // State: [items] including clicked → [items without clicked]
      // Deselecting an item
      newSelection = currentSelection.filter((id) => id !== itemId);
    } else {
      // State: undefined or [items] not including clicked → [items + clicked] or null
      // Selecting an item (handles both first selection and adding to existing)
      newSelection = [...(currentSelection ?? []), itemId];
      if (newSelection.length === allItemIds.length) {
        // Auto-convert to null when all items are selected for consistency
        newSelection = null;
      }
    }

    setValue(`${connId}.${field}`, newSelection);
  };

  // Toggle all items for a specific field (tools/resources/prompts)
  // Handles state transitions:
  // - undefined or [] → null: Select all
  // - null or [items] → []: Deselect all
  const toggleAll = (
    connId: string,
    field: "tools" | "resources" | "prompts",
  ) => {
    const current = formData[connId]?.[field];
    setValue(
      `${connId}.${field}`,
      current === null || (current && current.length > 0) ? [] : null,
    );
  };

  // Convenience wrappers for specific types
  const toggleTool = (
    connId: string,
    toolName: string,
    allToolNames: string[],
  ) => toggleItem(connId, "tools", toolName, allToolNames);
  const toggleResource = (
    connId: string,
    name: string,
    allResourceNames: string[],
  ) => toggleItem(connId, "resources", name, allResourceNames);
  const togglePrompt = (
    connId: string,
    promptName: string,
    allPromptNames: string[],
  ) => toggleItem(connId, "prompts", promptName, allPromptNames);

  const toggleAllTools = (connId: string) => toggleAll(connId, "tools");
  const toggleAllResources = (connId: string) => toggleAll(connId, "resources");
  const toggleAllPrompts = (connId: string) => toggleAll(connId, "prompts");

  // Toggle entire connection from sidebar checkbox
  // Handles state transitions:
  // - Has selections or in virtualMcp → delete from formData (undefined): Deselect all
  // - No selections → { tools: null, resources: null, prompts: null }: Select all
  const toggleAllForConnection = (connId: string) => {
    const current = formData[connId];
    const isInVirtualMcp = virtualMcp.connections.some(
      (c) => c.connection_id === connId,
    );

    // Check if there are any selections
    // - null means all items selected
    // - array with items means some items selected
    const hasAnySelections =
      current &&
      (current.tools === null ||
        (current.tools && current.tools.length > 0) ||
        current.resources === null ||
        (current.resources && current.resources.length > 0) ||
        current.prompts === null ||
        (current.prompts && current.prompts.length > 0));

    if (hasAnySelections || isInVirtualMcp) {
      // State: has selections → undefined (remove from formData)
      // This removes the connection completely, which means no selections
      const newFormData = { ...formData };
      delete newFormData[connId];
      reset(newFormData);
    } else {
      // State: undefined or no selections → all selected (null for all fields)
      setValue(connId, {
        tools: null,
        resources: null,
        prompts: null,
      });
    }
  };

  const handleSave = () => {
    const allSelections: ConnectionSelection[] = [];
    const allConnectionIds = new Set([
      ...Object.keys(formData),
      ...virtualMcp.connections.map((c) => c.connection_id),
    ]);

    for (const connId of allConnectionIds) {
      const sel = formData[connId];
      const connection = allConnections.find((c) => c.id === connId);
      const totalToolsCount = connection?.tools?.length ?? 0;

      if (!sel) {
        continue;
      }

      allSelections.push({
        connectionId: connId,
        selectedTools: sel.tools,
        selectedResources: sel.resources,
        selectedPrompts: sel.prompts,
        totalToolsCount,
      });
    }

    onSave(allSelections);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      reset(initializeFormData(virtualMcp));
      setSelectedConnectionId(
        defaultSelectedConnectionId ?? allConnections[0]?.id ?? null,
      );
      setConnectionSearch("");
      setActiveTab("tools");
    }
    onOpenChange(newOpen);
  };

  const handleConnectionClick = (connId: string) => {
    setSelectedConnectionId(connId);
    setActiveTab("tools");
  };

  const canSave = true;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl h-[80vh] max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden w-[95vw]">
        <div className="flex-1 flex overflow-hidden min-h-0 flex-col sm:flex-row">
          {/* Left Sidebar - Connections List */}
          <div className="w-full sm:w-72 sm:border-r border-b sm:border-b-0 border-border flex flex-col bg-background sm:h-full max-h-[40vh] sm:max-h-full">
            {/* Search */}
            <CollectionSearch
              value={connectionSearch}
              onChange={setConnectionSearch}
              placeholder="Search connections..."
            />

            {/* Connections List */}
            <div className="flex-1 overflow-auto p-2">
              {filteredConnections.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
                  {connectionSearch
                    ? "No connections found"
                    : "No connections available"}
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {filteredConnections.map((conn) => (
                    <ConnectionSidebarItem
                      key={conn.id}
                      connection={conn}
                      isSelected={selectedConnectionId === conn.id}
                      hasSelections={hasSelections(conn.id)}
                      summary={getSelectionSummary(conn.id)}
                      checkboxVariant={checkboxVariant}
                      onClick={() => handleConnectionClick(conn.id)}
                      onToggleAll={() => toggleAllForConnection(conn.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Content - Tools/Resources/Prompts */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentConnection ? (
              <>
                {/* Header */}
                <div className="p-6 border-b border-border shrink-0">
                  <div className="flex items-center gap-3">
                    <IntegrationIcon
                      icon={currentConnection.icon}
                      name={currentConnection.title}
                      size="md"
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold truncate">
                        {currentConnection.title}
                      </h2>
                      {currentConnection.description && (
                        <p className="text-sm text-muted-foreground truncate">
                          {currentConnection.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content - Tabs */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <Tabs
                    value={activeTab}
                    onValueChange={(value) =>
                      setActiveTab(value as "tools" | "resources" | "prompts")
                    }
                    variant="underline"
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <TabsList variant="underline" className="shrink-0 px-6">
                      <TabsTrigger
                        value="tools"
                        variant="underline"
                        className="gap-2"
                      >
                        <Tool01 size={16} />
                        Tools
                      </TabsTrigger>
                      <TabsTrigger
                        value="resources"
                        variant="underline"
                        className="gap-2"
                      >
                        <CubeOutline size={16} />
                        Resources
                      </TabsTrigger>
                      <TabsTrigger
                        value="prompts"
                        variant="underline"
                        className="gap-2"
                      >
                        <File02 size={16} />
                        Prompts
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent
                      value="tools"
                      className="flex-1 overflow-hidden mt-0"
                    >
                      <ErrorBoundary>
                        <Suspense fallback={<LoadingSpinner />}>
                          <ToolsTab
                            connectionId={selectedConnectionId!}
                            orgId={org.id}
                            selections={currentSelections.tools}
                            onToggle={(toolName, allToolNames) =>
                              toggleTool(
                                selectedConnectionId!,
                                toolName,
                                allToolNames,
                              )
                            }
                            onToggleAll={() =>
                              toggleAllTools(selectedConnectionId!)
                            }
                            checkboxVariant={checkboxVariant}
                          />
                        </Suspense>
                      </ErrorBoundary>
                    </TabsContent>

                    <TabsContent
                      value="resources"
                      className="flex-1 overflow-hidden mt-0"
                    >
                      <ErrorBoundary>
                        <Suspense fallback={<LoadingSpinner />}>
                          <ResourcesTab
                            connectionId={selectedConnectionId!}
                            orgId={org.id}
                            selections={currentSelections.resources}
                            onToggle={(name, allResourceNames) =>
                              toggleResource(
                                selectedConnectionId!,
                                name,
                                allResourceNames,
                              )
                            }
                            onToggleAll={() =>
                              toggleAllResources(selectedConnectionId!)
                            }
                            checkboxVariant={checkboxVariant}
                          />
                        </Suspense>
                      </ErrorBoundary>
                    </TabsContent>

                    <TabsContent
                      value="prompts"
                      className="flex-1 overflow-hidden mt-0"
                    >
                      <ErrorBoundary>
                        <Suspense fallback={<LoadingSpinner />}>
                          <PromptsTab
                            connectionId={selectedConnectionId!}
                            orgId={org.id}
                            selections={currentSelections.prompts}
                            onToggle={(name, allPromptNames) =>
                              togglePrompt(
                                selectedConnectionId!,
                                name,
                                allPromptNames,
                              )
                            }
                            onToggleAll={() =>
                              toggleAllPrompts(selectedConnectionId!)
                            }
                            checkboxVariant={checkboxVariant}
                          />
                        </Suspense>
                      </ErrorBoundary>
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Select a connection to view its tools, resources, and prompts
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
