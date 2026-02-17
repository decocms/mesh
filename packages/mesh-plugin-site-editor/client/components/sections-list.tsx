/**
 * Sections List Component (Block Browser)
 *
 * Displays all scanned blocks in a dense table-rows layout grouped by
 * collapsible categories. Navigates to block detail view on click.
 * Provides scan/re-scan trigger that calls CMS_BLOCK_SCAN via selfClient.
 */

import { useState } from "react";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@deco/ui/components/button.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deco/ui/components/table.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import { AlertCircle, Loading01 } from "@untitledui/icons";
import { ChevronDown, ChevronRight, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
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
  const { org } = useProjectContext();
  const navigate = siteEditorRouter.useNavigate();
  const queryClient = useQueryClient();

  const selfClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const {
    data: blocks = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: blockKeys.all(connectionId),
    queryFn: () => listBlocks(toolCaller),
  });

  const scanMutation = useMutation({
    mutationFn: () =>
      selfClient.callTool({
        name: "CMS_BLOCK_SCAN",
        arguments: { connectionId },
      }),
    onSuccess: () => {
      toast.success("Codebase scan complete");
      queryClient.invalidateQueries({
        queryKey: blockKeys.all(connectionId),
      });
    },
    onError: (err: unknown) => {
      toast.error(
        `Scan failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    },
  });

  const grouped = groupByCategory(blocks);
  const categoryNames = Object.keys(grouped).sort();

  // Track which categories are open (all open by default)
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set(categoryNames),
  );

  function toggleCategory(category: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Sections</h2>
          <Badge variant="secondary" className="text-xs">
            {blocks.length} blocks
          </Badge>
        </div>
        {blocks.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={scanMutation.isPending}
            onClick={() => scanMutation.mutate()}
          >
            {scanMutation.isPending ? (
              <Loading01 size={14} className="animate-spin mr-1" />
            ) : (
              <RefreshCw size={14} className="mr-1" />
            )}
            Re-scan
          </Button>
        )}
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
            {scanMutation.isPending ? (
              <Loading01
                size={48}
                className="animate-spin text-muted-foreground mb-4"
              />
            ) : (
              <Search size={48} className="text-muted-foreground mb-4" />
            )}
            <h3 className="text-lg font-medium mb-2">No blocks found</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              Scan your codebase to discover React components and generate
              editable prop forms automatically.
            </p>
            <Button
              variant="outline"
              disabled={scanMutation.isPending}
              onClick={() => scanMutation.mutate()}
            >
              {scanMutation.isPending ? (
                <Loading01 size={14} className="animate-spin mr-1" />
              ) : (
                <Search size={14} className="mr-1" />
              )}
              {scanMutation.isPending ? "Scanning..." : "Scan Codebase"}
            </Button>
          </div>
        ) : (
          categoryNames.map((category) => {
            const isOpen =
              openCategories.has(category) ||
              !openCategories.size; /* treat empty set as all-open on first render before state syncs */
            return (
              <Collapsible
                key={category}
                open={isOpen}
                onOpenChange={() => toggleCategory(category)}
              >
                <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border hover:bg-muted/50 transition-colors">
                  {isOpen ? (
                    <ChevronDown size={14} className="shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="shrink-0" />
                  )}
                  {category}
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {grouped[category].length}
                  </Badge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Component</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grouped[category].map((block) => (
                        <TableRow
                          key={block.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() =>
                            navigate({
                              to: "/site-editor-layout/sections/$blockId",
                              params: { blockId: block.id },
                            })
                          }
                        >
                          <TableCell className="text-sm font-medium">
                            {block.label}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {block.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {block.component}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CollapsibleContent>
              </Collapsible>
            );
          })
        )}
      </div>
    </div>
  );
}
