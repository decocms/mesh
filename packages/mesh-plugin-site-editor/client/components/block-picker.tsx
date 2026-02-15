/**
 * Block Picker Component
 *
 * Modal dialog for selecting a block type from the library to add to a page.
 * Lists available blocks grouped by category with a search filter.
 * Uses @deco/ui Dialog and fetches blocks via block-api helpers.
 */

import { useState } from "react";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { Box, Search } from "lucide-react";
import { Loading01 } from "@untitledui/icons";
import { queryKeys } from "../lib/query-keys";
import { listBlocks } from "../lib/block-api";
import type { BlockSummary } from "../lib/block-api";

interface BlockPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (blockType: string, defaults: Record<string, unknown>) => void;
}

/**
 * Group blocks by category, sorted alphabetically within each group.
 */
function groupByCategory(
  blocks: BlockSummary[],
): Record<string, BlockSummary[]> {
  const groups: Record<string, BlockSummary[]> = {};
  for (const block of blocks) {
    const category = block.category || "Other";
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(block);
  }
  for (const category of Object.keys(groups)) {
    groups[category].sort((a, b) => a.label.localeCompare(b.label));
  }
  return groups;
}

export function BlockPicker({ open, onClose, onSelect }: BlockPickerProps) {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const [filter, setFilter] = useState("");

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: queryKeys.blocks.all(connectionId),
    queryFn: () => listBlocks(toolCaller),
    enabled: open,
  });

  // Filter blocks by search term
  const filtered = filter
    ? blocks.filter(
        (b) =>
          b.label.toLowerCase().includes(filter.toLowerCase()) ||
          b.component.toLowerCase().includes(filter.toLowerCase()) ||
          b.category.toLowerCase().includes(filter.toLowerCase()),
      )
    : blocks;

  const grouped = groupByCategory(filtered);
  const categoryNames = Object.keys(grouped).sort();

  const handleSelect = (block: BlockSummary) => {
    onSelect(block.id, {});
    onClose();
    setFilter("");
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      setFilter("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Section</DialogTitle>
        </DialogHeader>

        {/* Search filter */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search blocks..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Block list */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loading01
                size={24}
                className="animate-spin text-muted-foreground mb-2"
              />
              <p className="text-sm text-muted-foreground">Loading blocks...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Search size={32} className="text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {filter ? "No blocks match your search" : "No blocks available"}
              </p>
            </div>
          ) : (
            categoryNames.map((category) => (
              <div key={category} className="mb-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider py-1.5">
                  {category}
                </div>
                {grouped[category].map((block) => (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => handleSelect(block)}
                    className={cn(
                      "flex items-center gap-3 w-full text-left px-3 py-2 rounded transition-colors",
                      "hover:bg-muted/50",
                    )}
                  >
                    <Box size={16} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate">
                        {block.label}
                      </span>
                      <span className="text-xs text-muted-foreground block truncate">
                        {block.component}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
