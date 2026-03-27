/**
 * Log Row Component
 *
 * Displays a single monitoring log entry in the table.
 * Clicking the row opens a detail drawer (managed by parent).
 */

import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import type { EnrichedMonitoringLog } from "./types.tsx";
import { TableCell, TableRow } from "@deco/ui/components/table.tsx";

// ============================================================================
// Helpers
// ============================================================================

function formatPayloadSize(data: Record<string, unknown>): string {
  const bytes = JSON.stringify(data).length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// Types
// ============================================================================

interface Connection {
  id: string;
  icon?: string | null;
  title?: string;
}

interface LogRowProps {
  log: EnrichedMonitoringLog;
  isSelected: boolean;
  connection: Connection | undefined;
  virtualMcpName: string;
  onSelect: () => void;
  lastLogRef?: (node: HTMLTableRowElement | null) => void;
}

// ============================================================================
// Component
// ============================================================================

export function LogRow({
  log,
  isSelected,
  connection,
  virtualMcpName,
  onSelect,
  lastLogRef,
}: LogRowProps) {
  const timestamp = new Date(log.timestamp);
  const dateStr = timestamp.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const timeStr = timestamp.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <TableRow
      ref={lastLogRef}
      className={cn(
        "h-14 md:h-16 transition-colors cursor-pointer",
        isSelected ? "bg-muted/50 hover:bg-muted/60" : "hover:bg-muted/40",
      )}
      onClick={onSelect}
    >
      {/* Connection Icon */}
      <TableCell className="w-12 md:w-16 px-2 md:px-4">
        <div className="flex items-center justify-center">
          <IntegrationIcon
            icon={connection?.icon || null}
            name={log.connectionTitle}
            size="xs"
            className="shadow-sm"
          />
        </div>
      </TableCell>

      {/* Tool Name + Connection Name */}
      <TableCell className="min-w-0 pr-2 md:pr-4">
        <div className="text-xs font-medium text-foreground truncate block">
          {log.toolName}
        </div>
        <div className="text-xs text-muted-foreground truncate block">
          {log.connectionTitle}
        </div>
      </TableCell>

      {/* Agent */}
      <TableCell className="w-24 md:w-32 px-2 md:px-3 text-xs text-muted-foreground">
        <div className="truncate">{virtualMcpName}</div>
      </TableCell>

      {/* Date */}
      <TableCell className="w-20 md:w-24 px-2 md:px-3 text-xs text-muted-foreground">
        {dateStr}
      </TableCell>

      {/* Status Badge */}
      <TableCell className="w-16 md:w-20 px-2 md:px-3">
        <Badge
          variant={log.isError ? "destructive" : "success"}
          className="text-xs px-1.5 md:px-2 py-0.5 md:py-1"
        >
          {log.isError ? "Error" : "Success"}
        </Badge>
      </TableCell>

      {/* Duration + payload size hint */}
      <TableCell className="w-16 md:w-20 px-2 md:px-3 text-xs text-muted-foreground font-mono text-right pr-3 md:pr-5">
        <div>{log.durationMs}ms</div>
        {log.input && (
          <div className="text-[10px] text-muted-foreground/60">
            {formatPayloadSize(log.input)}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
