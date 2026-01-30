/**
 * Log Row Component
 *
 * Displays a single monitoring log entry in the table.
 */

import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ChevronDown, ChevronRight } from "@untitledui/icons";
import { Fragment } from "react";
import { ExpandedLogContent, type EnrichedMonitoringLog } from "./types.tsx";
import { TableCell, TableRow } from "@deco/ui/components/table.tsx";

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
  isFirst: boolean;
  isExpanded: boolean;
  connection: Connection | undefined;
  virtualMcpName: string; // já resolvido pelo pai
  onToggle: () => void;
  lastLogRef?: (node: HTMLTableRowElement | null) => void;
}

// ============================================================================
// Component
// ============================================================================

export function LogRow({
  log,
  isFirst,
  isExpanded,
  connection,
  virtualMcpName,
  onToggle,
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
    <Fragment>
      <TableRow
        ref={lastLogRef}
        className={cn(
          "h-14 md:h-16 transition-colors cursor-pointer",
          isExpanded ? "bg-muted/30 hover:bg-accent/80" : "hover:bg-muted/40",
        )}
        onClick={onToggle}
      >
        {/* Expand Icon */}
        <TableCell className="w-10 md:w-12 px-2 md:px-4">
          <div className="flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown size={16} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={16} className="text-muted-foreground" />
            )}
          </div>
        </TableCell>

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

        {/* User Name */}
        <TableCell className="w-20 md:w-24 px-2 md:px-3 text-xs text-muted-foreground">
          {log.userName}
        </TableCell>

        {/* Date */}
        <TableCell className="w-20 md:w-24 px-2 md:px-3 text-xs text-muted-foreground">
          {dateStr}
        </TableCell>

        {/* Time */}
        <TableCell className="w-20 md:w-28 px-2 md:px-3 text-xs text-muted-foreground">
          {timeStr}
        </TableCell>

        {/* Duration */}
        <TableCell className="w-16 md:w-20 px-2 md:px-3 text-xs text-muted-foreground font-mono text-right">
          {log.durationMs}ms
        </TableCell>

        {/* Status Badge */}
        <TableCell className="w-16 md:w-24 px-2 md:px-3 pr-3 md:pr-5">
          <div className="flex items-center justify-end">
            <Badge
              variant={log.isError ? "destructive" : "success"}
              className="text-xs px-1.5 md:px-2 py-0.5 md:py-1"
            >
              {log.isError ? "Error" : "OK"}
            </Badge>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={9} className="p-0">
            <ExpandedLogContent log={log} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
