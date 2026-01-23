import type { VirtualMCPEntity } from "@/tools/virtual-mcp/schema";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ChevronDown, Tool01, CubeOutline, File02 } from "@untitledui/icons";
import { useState } from "react";

export interface ConnectionSelection {
  connectionId: string;
  selectedTools: string[];
  selectedResources: string[];
  selectedPrompts: string[];
}

export type ToolSelectionMode = "inclusion" | "exclusion";

interface ConnectionSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string | null;
  virtualMcp: VirtualMCPEntity;
  allConnections: Array<{
    id: string;
    title: string;
    description?: string | null;
    icon?: string | null;
    tools?: Array<{ name: string; description?: string }> | null;
  }>;
  connectionPrompts: Map<string, Array<{ name: string; description?: string }>>;
  connectionResources: Map<
    string,
    Array<{ uri: string; name?: string; description?: string }>
  >;
  toolSelectionMode: ToolSelectionMode;
  onSave: (
    selections: ConnectionSelection[],
    toolSelectionMode: ToolSelectionMode,
  ) => void;
}

export function ConnectionSelectionDialog({
  open,
  onOpenChange,
  connectionId,
  virtualMcp,
  allConnections,
  connectionPrompts,
  connectionResources,
  toolSelectionMode: initialToolSelectionMode,
  onSave,
}: ConnectionSelectionDialogProps) {
  // Search for connections
  const [connectionSearch, setConnectionSearch] = useState("");

  // Selection mode (include vs exclude)
  const [selectionMode, setSelectionMode] = useState<ToolSelectionMode>(
    initialToolSelectionMode,
  );

  // Checkbox variant based on selection mode
  const checkboxVariant: CheckboxVariant =
    selectionMode === "exclusion" ? "exclude" : "default";

  // Selected connection to show in right panel
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(() => connectionId ?? null);

  // Selections - keyed by connection ID
  const [selections, setSelections] = useState<
    Record<
      string,
      { tools: Set<string>; resources: Set<string>; prompts: Set<string> }
    >
  >(() => {
    const initial: Record<
      string,
      { tools: Set<string>; resources: Set<string>; prompts: Set<string> }
    > = {};

    // Initialize from existing connections in virtualMcp
    for (const conn of virtualMcp.connections) {
      const connection = allConnections.find(
        (c) => c.id === conn.connection_id,
      );
      const tools =
        conn.selected_tools === null
          ? new Set(connection?.tools?.map((t) => t.name) ?? [])
          : new Set(conn.selected_tools);
      initial[conn.connection_id] = {
        tools,
        resources: new Set(conn.selected_resources ?? []),
        prompts: new Set(conn.selected_prompts ?? []),
      };
    }

    return initial;
  });

  // Section collapse state
  const [toolsOpen, setToolsOpen] = useState(true);
  const [resourcesOpen, setResourcesOpen] = useState(true);
  const [promptsOpen, setPromptsOpen] = useState(true);

  // Get current connection data
  const currentConnection = selectedConnectionId
    ? allConnections.find((c) => c.id === selectedConnectionId)
    : null;
  const currentTools = currentConnection?.tools ?? [];
  const currentResources = connectionResources.get(selectedConnectionId!) ?? [];
  const currentPrompts = connectionPrompts.get(selectedConnectionId!) ?? [];

  // Get selections for current connection
  const currentSelections = selectedConnectionId
    ? (selections[selectedConnectionId] ?? {
        tools: new Set<string>(),
        resources: new Set<string>(),
        prompts: new Set<string>(),
      })
    : {
        tools: new Set<string>(),
        resources: new Set<string>(),
        prompts: new Set<string>(),
      };

  // Get set of already-connected connection IDs (from virtualMcp, stable reference)
  const connectedIds = new Set(
    virtualMcp.connections.map((c) => c.connection_id),
  );

  // Sort connections - connected ones at top, then alphabetically
  const availableConnections = [...allConnections].sort((a, b) => {
    // Connected ones first
    const aConnected = connectedIds.has(a.id);
    const bConnected = connectedIds.has(b.id);
    if (aConnected && !bConnected) return -1;
    if (!aConnected && bConnected) return 1;
    // Then alphabetically
    return a.title.localeCompare(b.title);
  });

  // Filter by search
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
  const hasSelections = (connId: string): boolean => {
    const sel = selections[connId];
    if (!sel) return false;
    return sel.tools.size > 0 || sel.resources.size > 0 || sel.prompts.size > 0;
  };

  // Get selection summary for a connection
  const getSelectionSummary = (connId: string): string => {
    const sel = selections[connId];
    if (!sel) return "";
    const parts: string[] = [];
    if (sel.tools.size > 0) parts.push(`${sel.tools.size} tools`);
    if (sel.resources.size > 0) parts.push(`${sel.resources.size} resources`);
    if (sel.prompts.size > 0) parts.push(`${sel.prompts.size} prompts`);
    return parts.join(", ");
  };

  // Toggle helpers
  const toggleTool = (connId: string, toolName: string) => {
    setSelections((prev) => {
      const current = prev[connId] ?? {
        tools: new Set<string>(),
        resources: new Set<string>(),
        prompts: new Set<string>(),
      };
      const newTools = new Set(current.tools);
      if (newTools.has(toolName)) {
        newTools.delete(toolName);
      } else {
        newTools.add(toolName);
      }
      return {
        ...prev,
        [connId]: { ...current, tools: newTools },
      };
    });
  };

  const toggleResource = (connId: string, uri: string) => {
    setSelections((prev) => {
      const current = prev[connId] ?? {
        tools: new Set<string>(),
        resources: new Set<string>(),
        prompts: new Set<string>(),
      };
      const newResources = new Set(current.resources);
      if (newResources.has(uri)) {
        newResources.delete(uri);
      } else {
        newResources.add(uri);
      }
      return {
        ...prev,
        [connId]: { ...current, resources: newResources },
      };
    });
  };

  const togglePrompt = (connId: string, promptName: string) => {
    setSelections((prev) => {
      const current = prev[connId] ?? {
        tools: new Set<string>(),
        resources: new Set<string>(),
        prompts: new Set<string>(),
      };
      const newPrompts = new Set(current.prompts);
      if (newPrompts.has(promptName)) {
        newPrompts.delete(promptName);
      } else {
        newPrompts.add(promptName);
      }
      return {
        ...prev,
        [connId]: { ...current, prompts: newPrompts },
      };
    });
  };

  // Toggle all items for a connection
  const toggleAllForConnection = (connId: string) => {
    const connection = allConnections.find((c) => c.id === connId);
    if (!connection) return;

    const allTools = connection.tools?.map((t) => t.name) ?? [];
    const allResources =
      connectionResources.get(connId)?.map((r) => r.uri) ?? [];
    const allPrompts = connectionPrompts.get(connId)?.map((p) => p.name) ?? [];

    const current = selections[connId];
    const hasAll =
      current &&
      current.tools.size === allTools.length &&
      current.resources.size === allResources.length &&
      current.prompts.size === allPrompts.length;

    if (hasAll) {
      // Deselect all
      setSelections((prev) => {
        const newSelections = { ...prev };
        delete newSelections[connId];
        return newSelections;
      });
    } else {
      // Select all
      setSelections((prev) => ({
        ...prev,
        [connId]: {
          tools: new Set(allTools),
          resources: new Set(allResources),
          prompts: new Set(allPrompts),
        },
      }));
    }
  };

  const handleSave = () => {
    // Build all connection selections from current state
    const allSelections: ConnectionSelection[] = [];

    for (const connId of Object.keys(selections)) {
      const sel = selections[connId];
      if (!sel) continue;
      // Only include connections that have at least one selection
      if (
        sel.tools.size > 0 ||
        sel.resources.size > 0 ||
        sel.prompts.size > 0
      ) {
        allSelections.push({
          connectionId: connId,
          selectedTools: Array.from(sel.tools),
          selectedResources: Array.from(sel.resources),
          selectedPrompts: Array.from(sel.prompts),
        });
      }
    }

    onSave(allSelections, selectionMode);
  };

  // Build selections from virtualMcp
  const buildSelectionsFromVirtualMcp = () => {
    const initial: Record<
      string,
      { tools: Set<string>; resources: Set<string>; prompts: Set<string> }
    > = {};
    for (const conn of virtualMcp.connections) {
      const connection = allConnections.find(
        (c) => c.id === conn.connection_id,
      );
      const tools =
        conn.selected_tools === null
          ? new Set(connection?.tools?.map((t) => t.name) ?? [])
          : new Set(conn.selected_tools);
      initial[conn.connection_id] = {
        tools,
        resources: new Set(conn.selected_resources ?? []),
        prompts: new Set(conn.selected_prompts ?? []),
      };
    }
    return initial;
  };

  // Handle dialog open/close
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      // Sync selections with current virtualMcp state when opening
      setSelections(buildSelectionsFromVirtualMcp());
      setSelectedConnectionId(connectionId ?? null);
      setConnectionSearch("");
      setSelectionMode(initialToolSelectionMode);
    }
    onOpenChange(newOpen);
  };

  // Handle connection click - select it and auto-select all if new
  const handleConnectionClick = (connId: string) => {
    setSelectedConnectionId(connId);

    // If this connection has no selections yet, auto-select all
    if (!selections[connId]) {
      const connection = allConnections.find((c) => c.id === connId);
      if (connection) {
        const allTools = connection.tools?.map((t) => t.name) ?? [];
        const allResources =
          connectionResources.get(connId)?.map((r) => r.uri) ?? [];
        const allPrompts =
          connectionPrompts.get(connId)?.map((p) => p.name) ?? [];

        setSelections((prev) => ({
          ...prev,
          [connId]: {
            tools: new Set(allTools),
            resources: new Set(allResources),
            prompts: new Set(allPrompts),
          },
        }));
      }
    }
  };

  // Always allow saving - empty selections means removing all connections
  const canSave = true;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl h-[80vh] max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden w-[95vw]">
        <div className="flex-1 flex overflow-hidden min-h-0 flex-col sm:flex-row">
          {/* Left Sidebar - Connections List */}
          <div className="w-full sm:w-72 sm:border-r border-b sm:border-b-0 border-border flex flex-col bg-background sm:h-full max-h-[40vh] sm:max-h-full">
            {/* Mode Selector */}
            <div className="flex items-center justify-center gap-1 px-4 py-3 border-b border-border">
              <button
                type="button"
                onClick={() => setSelectionMode("inclusion")}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                  selectionMode === "inclusion"
                    ? "bg-primary/5 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Checkbox
                  checked={selectionMode === "inclusion"}
                  className="pointer-events-none size-3.5"
                  tabIndex={-1}
                />
                Included
              </button>
              <button
                type="button"
                onClick={() => setSelectionMode("exclusion")}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                  selectionMode === "exclusion"
                    ? "bg-destructive/5 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Checkbox
                  variant="exclude"
                  checked={selectionMode === "exclusion"}
                  className="pointer-events-none size-3.5"
                  tabIndex={-1}
                />
                Excluded
              </button>
            </div>

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
                  {filteredConnections.map((conn) => {
                    const isSelected = selectedConnectionId === conn.id;
                    const selected = hasSelections(conn.id);
                    const summary = getSelectionSummary(conn.id);

                    return (
                      <div
                        key={conn.id}
                        className={cn(
                          "flex items-center gap-2 p-2 h-12 rounded-lg cursor-pointer transition-colors",
                          isSelected ? "bg-accent" : "hover:bg-muted/50",
                        )}
                        onClick={() => handleConnectionClick(conn.id)}
                      >
                        <IntegrationIcon
                          icon={conn.icon}
                          name={conn.title}
                          size="xs"
                          className="shrink-0"
                        />
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <p className="text-sm font-medium text-foreground truncate">
                            {conn.title}
                          </p>
                          {selected && summary && (
                            <p className="text-xs text-muted-foreground truncate">
                              {summary}
                            </p>
                          )}
                        </div>
                        <Checkbox
                          variant={checkboxVariant}
                          checked={selected}
                          onCheckedChange={() =>
                            toggleAllForConnection(conn.id)
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                        />
                      </div>
                    );
                  })}
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

                {/* Content - Sections */}
                <div className="flex-1 overflow-auto">
                  {/* Tools Section */}
                  {currentTools.length > 0 && (
                    <Collapsible open={toolsOpen} onOpenChange={setToolsOpen}>
                      <CollapsibleTrigger className="w-full flex items-center gap-2 px-6 py-3 border-b border-border hover:bg-muted/50 transition-colors">
                        <Tool01
                          size={16}
                          className="text-muted-foreground shrink-0"
                        />
                        <span className="text-sm font-medium flex-1 text-left">
                          Tools
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {currentSelections.tools.size}/{currentTools.length}
                        </span>
                        <ChevronDown
                          size={16}
                          className={cn(
                            "text-muted-foreground transition-transform",
                            toolsOpen && "rotate-180",
                          )}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 py-3 space-y-1">
                          {currentTools.map((tool) => (
                            <label
                              key={tool.name}
                              className={cn(
                                "flex items-start gap-3 p-4 rounded-lg cursor-pointer transition-colors",
                                currentSelections.tools.has(tool.name)
                                  ? "bg-accent/25"
                                  : "hover:bg-muted/50",
                              )}
                            >
                              <div className="flex-1 min-w-0 space-y-2">
                                <p className="text-sm font-medium leading-none">
                                  {tool.name}
                                </p>
                                {tool.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {tool.description}
                                  </p>
                                )}
                              </div>
                              <Checkbox
                                variant={checkboxVariant}
                                checked={currentSelections.tools.has(tool.name)}
                                onCheckedChange={() =>
                                  toggleTool(selectedConnectionId!, tool.name)
                                }
                                className="mt-0.5"
                              />
                            </label>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Resources Section */}
                  {currentResources.length > 0 && (
                    <Collapsible
                      open={resourcesOpen}
                      onOpenChange={setResourcesOpen}
                    >
                      <CollapsibleTrigger className="w-full flex items-center gap-2 px-6 py-3 border-b border-border hover:bg-muted/50 transition-colors">
                        <CubeOutline
                          size={16}
                          className="text-muted-foreground shrink-0"
                        />
                        <span className="text-sm font-medium flex-1 text-left">
                          Resources
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {currentSelections.resources.size}/
                          {currentResources.length}
                        </span>
                        <ChevronDown
                          size={16}
                          className={cn(
                            "text-muted-foreground transition-transform",
                            resourcesOpen && "rotate-180",
                          )}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 py-3 space-y-1">
                          {currentResources.map((resource) => (
                            <label
                              key={resource.uri}
                              className={cn(
                                "flex items-start gap-3 p-4 rounded-lg cursor-pointer transition-colors",
                                currentSelections.resources.has(resource.uri)
                                  ? "bg-accent/25"
                                  : "hover:bg-muted/50",
                              )}
                            >
                              <div className="flex-1 min-w-0 space-y-2">
                                <p className="text-sm font-medium leading-none">
                                  {resource.name || resource.uri}
                                </p>
                                {resource.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {resource.description}
                                  </p>
                                )}
                              </div>
                              <Checkbox
                                variant={checkboxVariant}
                                checked={currentSelections.resources.has(
                                  resource.uri,
                                )}
                                onCheckedChange={() =>
                                  toggleResource(
                                    selectedConnectionId!,
                                    resource.uri,
                                  )
                                }
                                className="mt-0.5"
                              />
                            </label>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Prompts Section */}
                  {currentPrompts.length > 0 && (
                    <Collapsible
                      open={promptsOpen}
                      onOpenChange={setPromptsOpen}
                    >
                      <CollapsibleTrigger className="w-full flex items-center gap-2 px-6 py-3 border-b border-border hover:bg-muted/50 transition-colors">
                        <File02
                          size={16}
                          className="text-muted-foreground shrink-0"
                        />
                        <span className="text-sm font-medium flex-1 text-left">
                          Prompts
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {currentSelections.prompts.size}/
                          {currentPrompts.length}
                        </span>
                        <ChevronDown
                          size={16}
                          className={cn(
                            "text-muted-foreground transition-transform",
                            promptsOpen && "rotate-180",
                          )}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 py-3 space-y-1">
                          {currentPrompts.map((prompt) => (
                            <label
                              key={prompt.name}
                              className={cn(
                                "flex items-start gap-3 p-4 rounded-lg cursor-pointer transition-colors",
                                currentSelections.prompts.has(prompt.name)
                                  ? "bg-accent/25"
                                  : "hover:bg-muted/50",
                              )}
                            >
                              <div className="flex-1 min-w-0 space-y-2">
                                <p className="text-sm font-medium leading-none">
                                  {prompt.name}
                                </p>
                                {prompt.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {prompt.description}
                                  </p>
                                )}
                              </div>
                              <Checkbox
                                variant={checkboxVariant}
                                checked={currentSelections.prompts.has(
                                  prompt.name,
                                )}
                                onCheckedChange={() =>
                                  togglePrompt(
                                    selectedConnectionId!,
                                    prompt.name,
                                  )
                                }
                                className="mt-0.5"
                              />
                            </label>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Empty state */}
                  {currentTools.length === 0 &&
                    currentResources.length === 0 &&
                    currentPrompts.length === 0 && (
                      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                        This connection has no tools, resources, or prompts
                      </div>
                    )}
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
