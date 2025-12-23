/**
 * Log Row Component
 *
 * Displays a single monitoring log entry in the table.
 */

import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { Fragment } from "react";
import { ExpandedLogContent, type EnrichedMonitoringLog } from "./types.tsx";

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
  gatewayName: string; // já resolvido pelo pai
  onToggle: () => void;
  lastLogRef?: (node: HTMLDivElement | null) => void;
}

// ============================================================================
// Component
// ============================================================================

export function LogRow({
  log,
  isFirst,
  isExpanded,
  connection,
  gatewayName,
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
      <div
        ref={lastLogRef}
        className={`flex items-center h-14 md:h-16 ${isFirst ? "" : "border-t border-border/60"} transition-colors cursor-pointer ${
          isExpanded ? "bg-muted/30 hover:bg-accent/80" : "hover:bg-muted/40"
        }`}
        onClick={onToggle}
      >
        {/* Expand Icon */}
        <div className="flex items-center justify-center w-10 md:w-12 px-2 md:px-4">
          <Icon
            name={isExpanded ? "expand_more" : "chevron_right"}
            size={16}
            className="text-muted-foreground"
          />
        </div>

        {/* Connection Icon */}
        <div className="flex items-center justify-center w-12 md:w-16 px-2 md:px-4">
          <IntegrationIcon
            icon={connection?.icon || null}
            name={log.connectionTitle}
            size="xs"
            className="shadow-sm"
          />
        </div>

        {/* Tool Name + Connection Name */}
        <div className="flex-1 min-w-0 pr-2 md:pr-4">
          <div className="text-xs font-medium text-foreground truncate block">
            {log.toolName}
          </div>
          <div className="text-xs text-muted-foreground truncate block">
            {log.connectionTitle}
          </div>
        </div>

        {/* Gateway */}
        <div className="w-24 md:w-32 px-2 md:px-3 text-xs text-muted-foreground truncate">
          {gatewayName}
        </div>

        {/* User Name */}
        <div className="w-20 md:w-24 px-2 md:px-3 text-xs text-muted-foreground">
          {log.userName}
        </div>

        {/* Date */}
        <div className="w-20 md:w-24 px-2 md:px-3 text-xs text-muted-foreground">
          {dateStr}
        </div>

        {/* Time */}
        <div className="w-20 md:w-28 px-2 md:px-3 text-xs text-muted-foreground">
          {timeStr}
        </div>

        {/* Duration */}
        <div className="w-16 md:w-20 px-2 md:px-3 text-xs text-muted-foreground font-mono text-right">
          {log.durationMs}ms
        </div>

        {/* Status Badge */}
        <div className="w-16 md:w-24 flex items-center justify-end pr-3 md:pr-5">
          <Badge
            variant={log.isError ? "destructive" : "success"}
            className="text-xs px-1.5 md:px-2 py-0.5 md:py-1"
          >
            {log.isError ? "Error" : "OK"}
          </Badge>
        </div>
      </div>
      {isExpanded && (
        <div>
          <ExpandedLogContent log={log} />
        </div>
      )}
    </Fragment>
  );
}
