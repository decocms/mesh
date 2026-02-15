/**
 * Sections List Component (Block Browser)
 *
 * Displays all scanned blocks grouped by category.
 * Navigates to block detail view on click.
 * Uses SITE_BINDING tools (LIST_FILES, READ_FILE) via block-api helpers.
 */

import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@deco/ui/components/button.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { AlertCircle, Loading01 } from "@untitledui/icons";
import { Box, Search } from "lucide-react";
import { blockKeys } from "../lib/query-keys";
import { siteEditorRouter } from "../lib/router";
import { listBlocks } from "../lib/block-api";
import type { BlockSummary } from "../lib/block-api";

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
  // Sort blocks within each category
  for (const category of Object.keys(groups)) {
    groups[category].sort((a, b) => a.label.localeCompare(b.label));
  }
  return groups;
}

export default function SectionsList() {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const navigate = siteEditorRouter.useNavigate();

  const {
    data: blocks = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: blockKeys.all(connectionId),
    queryFn: () => listBlocks(toolCaller),
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-2">Error loading blocks</h3>
        <p className="text-muted-foreground text-center">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const grouped = groupByCategory(blocks);
  const categoryNames = Object.keys(grouped).sort();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <h2 className="text-sm font-medium">Sections</h2>
        <Badge variant="secondary" className="text-xs">
          {blocks.length} blocks
        </Badge>
      </div>

      {/* Block list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground mb-4"
            />
            <p className="text-sm text-muted-foreground">Loading blocks...</p>
          </div>
        ) : blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <Search size={48} className="text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No blocks found</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              Scan your codebase to discover React components and generate
              editable prop forms automatically.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                console.log(
                  "[site-editor] Scan trigger placeholder -- wire to CMS_BLOCK_SCAN in Phase 3",
                );
              }}
            >
              <Search size={14} className="mr-1" />
              Scan Codebase
            </Button>
          </div>
        ) : (
          categoryNames.map((category) => (
            <div key={category}>
              {/* Category header */}
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border">
                {category}
              </div>

              {/* Blocks in category */}
              {grouped[category].map((block) => (
                <button
                  key={block.id}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/site-editor-layout/sections/$blockId",
                      params: { blockId: block.id },
                    })
                  }
                  className="group flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-muted/50 border-b border-border last:border-b-0 transition-colors"
                >
                  <Box size={16} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="truncate font-medium text-sm block">
                      {block.label}
                    </span>
                    <span className="text-xs text-muted-foreground truncate block">
                      {block.component}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {block.propsCount} props
                  </Badge>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
