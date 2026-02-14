/**
 * Page Diff Component
 *
 * Shows a readable diff between a historical version and the current page.
 * Compares scalar fields (title, path) and block-level changes (added, removed, modified).
 * Uses structured comparison rather than raw JSON diff.
 */

import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import { Loading01 } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { queryKeys } from "../lib/query-keys";
import { getPage, type Page, type BlockInstance } from "../lib/page-api";
import { readFileAt } from "../lib/history-api";

interface ScalarChange {
  field: string;
  oldValue: string;
  newValue: string;
}

interface BlockChange {
  type: "added" | "removed" | "modified";
  blockId: string;
  blockType: string;
  propChanges?: Array<{
    key: string;
    oldValue: string;
    newValue: string;
  }>;
}

interface PageDiffResult {
  scalarChanges: ScalarChange[];
  blockChanges: BlockChange[];
}

function truncateValue(value: unknown, maxLen = 60): string {
  const str =
    typeof value === "string" ? value : (JSON.stringify(value) ?? "undefined");
  return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
}

/**
 * Compute a property-level diff between two page versions.
 */
function diffPages(oldPage: Page, newPage: Page): PageDiffResult {
  const scalarChanges: ScalarChange[] = [];
  const blockChanges: BlockChange[] = [];

  // Compare scalar fields
  if (oldPage.title !== newPage.title) {
    scalarChanges.push({
      field: "title",
      oldValue: oldPage.title,
      newValue: newPage.title,
    });
  }
  if (oldPage.path !== newPage.path) {
    scalarChanges.push({
      field: "path",
      oldValue: oldPage.path,
      newValue: newPage.path,
    });
  }

  // Compare blocks by ID
  const oldBlockMap = new Map(oldPage.blocks.map((b) => [b.id, b]));
  const newBlockMap = new Map(newPage.blocks.map((b) => [b.id, b]));

  // Find removed blocks
  for (const [id, block] of oldBlockMap) {
    if (!newBlockMap.has(id)) {
      blockChanges.push({
        type: "removed",
        blockId: id,
        blockType: block.blockType,
      });
    }
  }

  // Find added blocks
  for (const [id, block] of newBlockMap) {
    if (!oldBlockMap.has(id)) {
      blockChanges.push({
        type: "added",
        blockId: id,
        blockType: block.blockType,
      });
    }
  }

  // Find modified blocks
  for (const [id, newBlock] of newBlockMap) {
    const oldBlock = oldBlockMap.get(id);
    if (!oldBlock) continue;

    const propChanges = diffBlockProps(oldBlock, newBlock);
    if (propChanges.length > 0) {
      blockChanges.push({
        type: "modified",
        blockId: id,
        blockType: newBlock.blockType,
        propChanges,
      });
    }
  }

  return { scalarChanges, blockChanges };
}

/**
 * Shallow comparison of block props, returning changed keys.
 */
function diffBlockProps(
  oldBlock: BlockInstance,
  newBlock: BlockInstance,
): Array<{ key: string; oldValue: string; newValue: string }> {
  const changes: Array<{ key: string; oldValue: string; newValue: string }> =
    [];
  const allKeys = new Set([
    ...Object.keys(oldBlock.props),
    ...Object.keys(newBlock.props),
  ]);

  for (const key of allKeys) {
    const oldVal = oldBlock.props[key];
    const newVal = newBlock.props[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        key,
        oldValue: truncateValue(oldVal),
        newValue: truncateValue(newVal),
      });
    }
  }

  return changes;
}

interface PageDiffProps {
  pageId: string;
  commitHash: string;
}

export default function PageDiff({ pageId, commitHash }: PageDiffProps) {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();

  const path = `.deco/pages/${pageId}.json`;

  // Fetch old version at commit
  const { data: oldContent, isLoading: isLoadingOld } = useQuery({
    queryKey: queryKeys.history.diff(connectionId, pageId, commitHash),
    queryFn: () => readFileAt(toolCaller, path, commitHash),
  });

  // Fetch current version
  const { data: currentPage, isLoading: isLoadingCurrent } = useQuery({
    queryKey: queryKeys.pages.detail(connectionId, pageId),
    queryFn: () => getPage(toolCaller, pageId),
  });

  if (isLoadingOld || isLoadingCurrent) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loading01 size={14} className="animate-spin" />
        Loading diff...
      </div>
    );
  }

  if (!oldContent || !currentPage) {
    return (
      <p className="text-xs text-muted-foreground p-3">
        Could not load version for comparison.
      </p>
    );
  }

  let oldPage: Page;
  try {
    oldPage = JSON.parse(oldContent);
  } catch {
    return (
      <p className="text-xs text-muted-foreground p-3">
        Could not parse historical version.
      </p>
    );
  }

  const diff = diffPages(oldPage, currentPage);

  if (diff.scalarChanges.length === 0 && diff.blockChanges.length === 0) {
    return (
      <p className="text-xs text-muted-foreground p-3 bg-muted/30 rounded">
        No differences found.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {/* Scalar changes */}
      {diff.scalarChanges.map((change) => (
        <div key={change.field} className="rounded border border-border p-2">
          <span className="font-medium">{change.field}</span>
          <div className="mt-1 space-y-0.5">
            <div className="bg-red-50 text-red-800 px-1.5 py-0.5 rounded font-mono">
              - {change.oldValue}
            </div>
            <div className="bg-green-50 text-green-800 px-1.5 py-0.5 rounded font-mono">
              + {change.newValue}
            </div>
          </div>
        </div>
      ))}

      {/* Block changes */}
      {diff.blockChanges.map((change) => (
        <div
          key={change.blockId}
          className={cn(
            "rounded border p-2",
            change.type === "added" && "border-green-200 bg-green-50/50",
            change.type === "removed" && "border-red-200 bg-red-50/50",
            change.type === "modified" && "border-border",
          )}
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-block px-1 py-0.5 rounded text-[10px] font-medium uppercase",
                change.type === "added" && "bg-green-100 text-green-700",
                change.type === "removed" && "bg-red-100 text-red-700",
                change.type === "modified" && "bg-yellow-100 text-yellow-700",
              )}
            >
              {change.type}
            </span>
            <span className="font-mono text-muted-foreground">
              {change.blockType.replace("sections--", "")}
            </span>
          </div>

          {/* Modified block prop changes */}
          {change.propChanges && change.propChanges.length > 0 && (
            <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-yellow-200">
              {change.propChanges.map((pc) => (
                <div key={pc.key}>
                  <span className="font-medium">{pc.key}:</span>
                  <div className="mt-0.5 space-y-0.5">
                    <div className="bg-red-50 text-red-800 px-1.5 py-0.5 rounded font-mono truncate">
                      - {pc.oldValue}
                    </div>
                    <div className="bg-green-50 text-green-800 px-1.5 py-0.5 rounded font-mono truncate">
                      + {pc.newValue}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
