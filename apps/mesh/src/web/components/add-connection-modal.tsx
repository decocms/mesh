/**
 * Add Connection Modal
 *
 * Two-panel modal for selecting connections to add to a toolbox.
 * Design based on Figma specs.
 */

import type { ConnectionEntity } from "@/tools/connection/schema";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogPortal,
  DialogOverlay,
} from "@deco/ui/components/dialog.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  Building02,
  Check,
  Container,
} from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

interface AddConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableConnections: ConnectionEntity[];
  onAdd: (connectionIds: string[]) => void;
  isLoading: boolean;
}

export function AddConnectionModal({
  open,
  onOpenChange,
  availableConnections,
  onAdd,
  isLoading,
}: AddConnectionModalProps) {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAdd = () => {
    onAdd(Array.from(selected));
    setSelected(new Set());
    setSearch("");
  };

  const handleClose = () => {
    setSelected(new Set());
    setSearch("");
    onOpenChange(false);
  };

  const handleSeeStore = () => {
    handleClose();
    navigate({ to: "/$org/store", params: { org: org.slug } });
  };

  // Filter connections by search
  const filteredConnections = availableConnections.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q)
    );
  });

  // Get selected connections for the left panel
  const selectedConnections = availableConnections.filter((c) =>
    selected.has(c.id),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="sm:max-w-5xl h-[80vh] max-h-[80vh] flex flex-col p-0 overflow-hidden w-[95vw]">
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left Panel */}
            <div className="w-[350px] shrink-0 border-r border-border flex flex-col">
              {/* Content */}
              <div className="flex-1 flex flex-col p-6 gap-10 overflow-hidden">
                {/* Title section */}
                <div className="flex flex-col gap-2">
                  <h2 className="text-lg font-medium text-foreground">
                    Add context to your toolbox
                  </h2>
                  <p className="text-base text-muted-foreground">
                    Select connections from your organization to use in this toolbox.
                  </p>
                </div>

                {/* Selected section */}
                <div className="flex-1 flex flex-col gap-2 overflow-hidden min-h-0">
                  <p className="text-xs font-mono text-muted-foreground uppercase">
                    SELECTED:
                  </p>
                  <div className="flex-1 overflow-auto space-y-2">
                    {selectedConnections.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        No connections selected
                      </p>
                    ) : (
                      selectedConnections.map((connection) => (
                        <div
                          key={connection.id}
                          className="flex items-center gap-3 p-2 rounded-lg border border-border bg-background"
                        >
                          <IntegrationIcon
                            icon={connection.icon}
                            name={connection.title}
                            size="xs"
                            fallbackIcon={<Container size={12} />}
                          />
                          <span className="flex-1 font-medium text-sm text-foreground truncate">
                            {connection.title}
                          </span>
                          <div className="size-4 rounded-full bg-primary flex items-center justify-center">
                            <Check
                              size={10}
                              className="text-primary-foreground"
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* See store link */}
              <div className="h-12 border-t border-border flex items-center px-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  onClick={handleSeeStore}
                >
                  <Building02 size={12} />
                  See store
                </Button>
              </div>
            </div>

            {/* Right Panel */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Search bar */}
              <CollectionSearch
                value={search}
                onChange={setSearch}
                placeholder="Search for a MCP..."
                className="border-b-0"
              />

              {/* Grid */}
              <div className="flex-1 overflow-auto p-6">
                {filteredConnections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Container
                      size={48}
                      className="text-muted-foreground mb-4"
                    />
                    <p className="text-muted-foreground">
                      {search
                        ? `No connections match "${search}"`
                        : "All connections are already in this toolbox"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {filteredConnections.map((connection) => {
                      const isSelected = selected.has(connection.id);
                      return (
                        <Card
                          key={connection.id}
                          onClick={() => handleToggle(connection.id)}
                          className={cn(
                            "cursor-pointer transition-colors group relative",
                            "hover:bg-muted/50",
                            isSelected && "ring-2 ring-primary ring-offset-0",
                          )}
                        >
                          <div className="flex flex-col gap-4 relative p-6">
                            {/* Header: Icon + Checkbox */}
                            <div className="flex items-start justify-between">
                              <IntegrationIcon
                                icon={connection.icon}
                                name={connection.title}
                                size="sm"
                                className="shrink-0 shadow-sm"
                                fallbackIcon={<Container />}
                              />
                              {/* Selection indicator */}
                              <div
                                className={cn(
                                  "size-6 rounded-full flex items-center justify-center transition-colors",
                                  isSelected
                                    ? "bg-primary"
                                    : "border border-border bg-background",
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isSelected && (
                                  <Check
                                    size={16}
                                    className="text-primary-foreground"
                                  />
                                )}
                              </div>
                            </div>

                            {/* Title and Description */}
                            <div className="flex flex-col gap-0">
                              <h3 className="text-base font-medium text-foreground truncate">
                                {connection.title}
                              </h3>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {connection.description || "No description"}
                              </p>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-5 flex items-center justify-end gap-2.5 shrink-0">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="h-10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={selected.size === 0 || isLoading}
              className="h-10"
            >
              {isLoading
                ? "Adding..."
                : `Add ${selected.size > 0 ? selected.size : ""} MCP${selected.size !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
