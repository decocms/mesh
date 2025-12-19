import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@deco/ui/components/dialog.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowLeft, Building2, Check, Search } from "lucide-react";
import { useState, useEffect } from "react";

type BaseConnection = {
  id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
};

interface SelectMCPsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: BaseConnection[];
  initialSelected?: string[];
  onConfirm: (selectedIds: string[]) => void;
  onBack?: () => void;
  onSeeStore?: () => void;
}

export function SelectMCPsModal({
  open,
  onOpenChange,
  connections,
  initialSelected = [],
  onConfirm,
  onBack,
  onSeeStore,
}: SelectMCPsModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelected),
  );
  const [search, setSearch] = useState("");

  // Reset state when modal opens
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(initialSelected));
      setSearch("");
    }
  }, [open, initialSelected]);

  const filteredConnections = !search.trim()
    ? connections
    : connections.filter(
        (c) =>
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          c.description?.toLowerCase().includes(search.toLowerCase()),
      );

  const selectedConnections = connections.filter((c) => selectedIds.has(c.id));

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIds));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[1200px] p-0 gap-0 overflow-hidden"
        closeButtonClassName="hidden"
      >
        <div className="flex h-[600px]">
          {/* Left Sidebar */}
          <div className="w-[350px] border-r border-border flex flex-col shrink-0">
            {/* Back button */}
            <div className="h-12 px-4 py-3.5 border-b border-border flex items-center">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground gap-2"
                onClick={onBack}
              >
                <ArrowLeft className="size-3" />
                Back
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 flex flex-col gap-10 overflow-auto">
              <div className="flex flex-col gap-4">
                <h2 className="text-2xl font-medium text-foreground">
                  Add context to your project
                </h2>
                <p className="text-base text-muted-foreground">
                  Select MCPs from your organization to use in this project.
                </p>
              </div>

              {/* Selected MCPs */}
              <div className="flex-1 flex flex-col gap-2 min-h-0">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
                  SELECTED:
                </span>
                <div className="flex flex-col gap-2 overflow-auto">
                  {selectedConnections.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No MCPs selected yet
                    </p>
                  ) : (
                    selectedConnections.map((connection) => (
                      <SelectedMCPItem
                        key={connection.id}
                        connection={connection}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* See store button */}
            <div className="h-12 px-4 py-3.5 border-t border-border flex items-center">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground gap-2"
                onClick={onSeeStore}
              >
                <Building2 className="size-3" />
                See store
              </Button>
            </div>
          </div>

          {/* Right Content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search bar */}
            <div className="h-12 px-4 py-3.5 border-b border-border flex items-center gap-2.5">
              <Search className="size-4 text-muted-foreground shrink-0" />
              <Input
                type="text"
                placeholder="Search for a MCP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0 h-auto p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
              />
            </div>

            {/* Grid */}
            <div className="flex-1 p-6 overflow-auto">
              <div className="flex flex-wrap gap-4 content-start">
                {filteredConnections.map((connection) => (
                  <MCPCard
                    key={connection.id}
                    connection={connection}
                    selected={selectedIds.has(connection.id)}
                    onClick={() => toggleSelection(connection.id)}
                  />
                ))}
                {filteredConnections.length === 0 && (
                  <div className="w-full py-12 text-center text-muted-foreground">
                    {search
                      ? "No MCPs found matching your search"
                      : "No MCPs available"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-border p-5 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" onClick={handleConfirm}>
            Add {selectedIds.size} MCP{selectedIds.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SelectedMCPItemProps {
  connection: BaseConnection;
}

function SelectedMCPItem({ connection }: SelectedMCPItemProps) {
  return (
    <div className="flex items-center gap-4 p-2 rounded-lg border border-border bg-white">
      <div className="size-8 rounded-lg border border-border/10 bg-white flex items-center justify-center shrink-0 overflow-hidden">
        {connection.icon ? (
          <img src={connection.icon} alt="" className="size-5 object-contain" />
        ) : (
          <div className="size-5 rounded bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
            {connection.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <span className="flex-1 text-base font-medium text-foreground truncate">
        {connection.title}
      </span>
      <div className="size-4 rounded-full bg-brand-green-light flex items-center justify-center shrink-0">
        <Check className="size-2.5 text-brand-green-dark" strokeWidth={3} />
      </div>
    </div>
  );
}

interface MCPCardProps {
  connection: BaseConnection;
  selected: boolean;
  onClick: () => void;
}

function MCPCard({ connection, selected, onClick }: MCPCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-64 p-5 rounded-lg bg-white text-left transition-all relative",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-2 border-brand-green-light"
          : "border border-border hover:border-muted-foreground/50",
      )}
    >
      {/* Selection indicator */}
      <div
        className={cn(
          "absolute top-5 right-5 size-6 rounded-full flex items-center justify-center transition-all",
          selected ? "bg-brand-green-light" : "border border-border",
        )}
      >
        {selected && (
          <Check className="size-4 text-brand-green-dark" strokeWidth={2.5} />
        )}
      </div>

      {/* Icon */}
      <div className="size-12 rounded-lg border border-border/10 bg-white flex items-center justify-center mb-4 overflow-hidden">
        {connection.icon ? (
          <img src={connection.icon} alt="" className="size-8 object-contain" />
        ) : (
          <div className="size-8 rounded bg-muted flex items-center justify-center text-lg font-medium text-muted-foreground">
            {connection.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-0">
        <h3 className="text-base font-medium text-foreground truncate pr-8">
          {connection.title}
        </h3>
        <p className="text-base text-muted-foreground line-clamp-2">
          {connection.description || "No description available"}
        </p>
      </div>
    </button>
  );
}
