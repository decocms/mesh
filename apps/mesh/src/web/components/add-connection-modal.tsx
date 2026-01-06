/**
 * Add Connection Modal
 *
 * Two-panel modal for selecting connections to add to a toolbox.
 * Design based on Figma specs.
 */

import type { ConnectionEntity } from "@/tools/connection/schema";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogPortal,
  DialogOverlay,
} from "@deco/ui/components/dialog.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  ArrowLeft,
  Building02,
  Check,
  Container,
  SearchMd,
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
        <DialogContent className="max-w-[1200px] w-[90vw] h-[80vh] max-h-[700px] p-0 overflow-hidden gap-0">
          <div className="flex h-full">
            {/* Left Panel */}
            <div className="w-[350px] shrink-0 border-r border-border flex flex-col">
              {/* Back button */}
              <div className="h-12 border-b border-border flex items-center px-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  onClick={handleClose}
                >
                  <ArrowLeft size={12} />
                  Back
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 flex flex-col p-6 gap-10 overflow-hidden">
                {/* Title section */}
                <div className="flex flex-col gap-4">
                  <h2 className="text-2xl font-medium text-foreground">
                    Add context to your project
                  </h2>
                  <p className="text-base text-muted-foreground">
                    Select MCPs from your organization to use in this project.
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
                          className="flex items-center gap-4 p-2 rounded-lg border border-border bg-background"
                        >
                          <IntegrationIcon
                            icon={connection.icon}
                            name={connection.title}
                            size="sm"
                            fallbackIcon={<Container size={16} />}
                          />
                          <span className="flex-1 font-medium text-base text-foreground truncate">
                            {connection.title}
                          </span>
                          <div className="size-4 rounded-full bg-primary flex items-center justify-center">
                            <Check size={10} className="text-primary-foreground" />
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
              <div className="h-12 border-b border-border flex items-center px-4 gap-2">
                <SearchMd size={16} className="text-muted-foreground shrink-0" />
                <Input
                  type="text"
                  placeholder="Search for a MCP..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-0 shadow-none focus-visible:ring-0 h-full px-0"
                />
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-auto p-6">
                {filteredConnections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Container size={48} className="text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      {search
                        ? `No connections match "${search}"`
                        : "All connections are already in this toolbox"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredConnections.map((connection) => {
                      const isSelected = selected.has(connection.id);
                      return (
                        <div
                          key={connection.id}
                          onClick={() => handleToggle(connection.id)}
                          className={`
                            relative cursor-pointer rounded-lg p-5 transition-all
                            ${
                              isSelected
                                ? "border-2 border-primary bg-background"
                                : "border border-border bg-background hover:border-muted-foreground/50"
                            }
                          `}
                        >
                          {/* Selection indicator */}
                          <div
                            className={`
                              absolute top-[18px] right-[18px] size-6 rounded-full flex items-center justify-center
                              ${
                                isSelected
                                  ? "bg-primary"
                                  : "border border-border"
                              }
                            `}
                          >
                            {isSelected && (
                              <Check size={16} className="text-primary-foreground" />
                            )}
                          </div>

                          {/* Icon */}
                          <div className="mb-4">
                            <IntegrationIcon
                              icon={connection.icon}
                              name={connection.title}
                              size="lg"
                              fallbackIcon={<Container size={24} />}
                            />
                          </div>

                          {/* Content */}
                          <div className="flex flex-col gap-0">
                            <p className="font-medium text-base text-foreground truncate pr-8">
                              {connection.title}
                            </p>
                            <p className="text-base text-muted-foreground line-clamp-2">
                              {connection.description || "No description"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border flex items-center justify-end gap-2 p-5">
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={selected.size === 0 || isLoading}
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

