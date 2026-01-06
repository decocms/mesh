/**
 * Monitoring Types and Shared Components
 *
 * Contains shared types and the ExpandedLogContent component used by LogRow.
 */

import { useProjectContext } from "@/web/providers/project-context-provider";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { Download01, Check, Copy01, Play } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { MONITORING_CONFIG } from "./config.ts";
import { JsonSyntaxHighlighter } from "@/web/components/json-syntax-highlighter.tsx";

// ============================================================================
// Types
// ============================================================================

import type {
  MonitoringLog as BaseMonitoringLog,
  MonitoringLogsResponse as BaseMonitoringLogsResponse,
} from "./monitoring-stats-row.tsx";

// Re-export base types for convenience
export type { BaseMonitoringLog, BaseMonitoringLogsResponse };

// ----------------------------------------------------------------------------
// Home Page Types (KPIs, Dashboard)
// ----------------------------------------------------------------------------

export interface MonitoringStats {
  totalCalls: number;
  errorRate: number;
  avgDurationMs: number;
  errorRatePercent: string;
}

export interface MonitoringLogWithGateway extends BaseMonitoringLog {
  gatewayId?: string | null;
}

export interface MonitoringLogsWithGatewayResponse {
  logs: MonitoringLogWithGateway[];
  total: number;
}

export function hasMonitoringActivity(stats?: MonitoringStats | null): boolean {
  return (stats?.totalCalls ?? 0) > 0;
}

// ----------------------------------------------------------------------------
// Full Monitoring Page Types
// ----------------------------------------------------------------------------

export interface MonitoringLog extends BaseMonitoringLog {
  organizationId: string;
  userId: string | null;
  requestId: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  userAgent: string | null;
  gatewayId: string | null;
  properties: Record<string, string> | null;
}

export interface EnrichedMonitoringLog extends MonitoringLog {
  userName: string;
  userImage: string | undefined;
  gatewayName: string | null;
}

export interface MonitoringLogsResponse
  extends Omit<BaseMonitoringLogsResponse, "logs"> {
  logs: MonitoringLog[];
}

export interface MonitoringSearchParams {
  // Time range using expressions (from/to)
  from?: string; // e.g., "now-24h", "now-7d", or ISO string
  to?: string; // e.g., "now" or ISO string
  connectionId?: string[]; // Array of connection IDs
  gatewayId?: string[]; // Array of gateway IDs
  tool?: string;
  status?: "all" | "success" | "errors";
  search?: string;
  page?: number;
  streaming?: boolean;
  // Property filter (key=value format, e.g., "thread_id=abc123")
  propertyFilter?: string;
}

// ============================================================================
// JSON Processing Utilities
// ============================================================================

interface TruncatedJson {
  content: string;
  isTruncated: boolean;
  originalSize: number;
}

function truncateJsonForDisplay(
  data: Record<string, unknown> | null,
): TruncatedJson {
  if (!data) {
    return { content: "null", isTruncated: false, originalSize: 4 };
  }

  const fullJson = JSON.stringify(data, null, 2);
  const originalSize = fullJson.length;

  if (originalSize <= MONITORING_CONFIG.maxJsonRenderSize) {
    return { content: fullJson, isTruncated: false, originalSize };
  }

  // Truncate and add indicator
  const truncated = fullJson.slice(0, MONITORING_CONFIG.maxJsonRenderSize);
  return {
    content: truncated + "\n\n... [TRUNCATED - content too large to display]",
    isTruncated: true,
    originalSize,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// Expanded Log Content Component
// ============================================================================

interface ExpandedLogContentProps {
  log: EnrichedMonitoringLog;
}

export function ExpandedLogContent({ log }: ExpandedLogContentProps) {
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const navigate = useNavigate();
  const { org } = useProjectContext();

  // Process JSON for display (React 19 compiler handles optimization)
  const inputJson = truncateJsonForDisplay(log.input);
  const outputJson = truncateJsonForDisplay(log.output);

  // Keep full JSON for copy (stringify lazily only when copying)
  const getFullJson = (data: Record<string, unknown> | null) =>
    JSON.stringify(data, null, 2);

  const handleCopy = async (type: "input" | "output") => {
    // Always copy full JSON, not truncated
    const fullJson = getFullJson(type === "input" ? log.input : log.output);
    try {
      await navigator.clipboard.writeText(fullJson);
      if (type === "input") {
        setCopiedInput(true);
        setTimeout(() => setCopiedInput(false), 2000);
      } else {
        setCopiedOutput(true);
        setTimeout(() => setCopiedOutput(false), 2000);
      }
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleDownload = (type: "input" | "output") => {
    const fullJson = getFullJson(type === "input" ? log.input : log.output);
    const blob = new Blob([fullJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${log.toolName}-${type}-${log.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReplay = () => {
    // Generate unique replay ID
    const replayId = crypto.randomUUID();
    // Store input in sessionStorage
    sessionStorage.setItem(`replay-${replayId}`, JSON.stringify(log.input));
    // Navigate to tool page with replayId
    navigate({
      to: "/$org/mcps/$connectionId/$collectionName/$itemId",
      params: {
        org: org.slug,
        connectionId: log.connectionId,
        collectionName: "tools",
        itemId: encodeURIComponent(log.toolName),
      },
      search: { replayId },
    });
  };

  return (
    <div className="space-y-3 text-sm px-3 md:px-5 py-4 bg-muted/30">
      {/* Metadata Row: User Agent and Gateway */}
      {(log.userAgent || log.gatewayName) && (
        <div className="flex flex-wrap gap-4 text-xs">
          {log.userAgent && (
            <div>
              <span className="font-medium text-muted-foreground">
                Client:{" "}
              </span>
              <span className="font-mono text-foreground">{log.userAgent}</span>
            </div>
          )}
          {log.gatewayName && (
            <div>
              <span className="font-medium text-muted-foreground">
                Gateway:{" "}
              </span>
              <span className="text-foreground">{log.gatewayName}</span>
            </div>
          )}
        </div>
      )}
      {/* Properties Row */}
      {log.properties && Object.keys(log.properties).length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">
            Properties
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(log.properties).map(([key, value]) => (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="font-mono text-xs px-2 py-0.5 cursor-pointer hover:bg-secondary/80 transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(`${key}=${value}`);
                      toast.success("Copied to clipboard");
                    }}
                  >
                    {key}={value}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Click to copy</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
      {log.errorMessage && (
        <div>
          <div className="font-medium text-destructive mb-1">Error Message</div>
          <div className="text-destructive font-mono text-xs bg-destructive/10 p-2 rounded break-all">
            {log.errorMessage}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="rounded-lg bg-muted overflow-hidden border border-border">
            <div className="flex items-center justify-between p-1 pl-4 bg-transparent border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase text-muted-foreground tracking-widest select-none">
                  Input
                </span>
                {inputJson.isTruncated && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    ({formatBytes(inputJson.originalSize)} - truncated)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {log.input && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleReplay}
                        aria-label="Replay tool call"
                        className="text-muted-foreground hover:text-foreground rounded-lg h-8 w-8"
                      >
                        <Play size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Replay tool call</TooltipContent>
                  </Tooltip>
                )}
                {inputJson.isTruncated && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDownload("input")}
                        aria-label="Download full input"
                        className="text-muted-foreground hover:text-foreground rounded-lg h-8 w-8"
                      >
                        <Download01 size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download full input</TooltipContent>
                  </Tooltip>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleCopy("input")}
                  aria-label="Copy input"
                  className="text-muted-foreground hover:text-foreground rounded-lg h-8 w-8"
                >
                  {copiedInput ? <Check size={14} /> : <Copy01 size={14} />}
                </Button>
              </div>
            </div>
            <div className="h-[200px] md:h-[300px] overflow-auto">
              <JsonSyntaxHighlighter jsonString={inputJson.content} />
            </div>
          </div>
        </div>
        <div>
          <div className="rounded-lg bg-muted overflow-hidden border border-border">
            <div className="flex items-center justify-between p-1 pl-4 bg-transparent border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase text-muted-foreground tracking-widest select-none">
                  Output
                </span>
                {outputJson.isTruncated && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    ({formatBytes(outputJson.originalSize)} - truncated)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {outputJson.isTruncated && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDownload("output")}
                        aria-label="Download full output"
                        className="text-muted-foreground hover:text-foreground rounded-lg h-8 w-8"
                      >
                        <Download01 size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download full output</TooltipContent>
                  </Tooltip>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleCopy("output")}
                  aria-label="Copy output"
                  className="text-muted-foreground hover:text-foreground rounded-lg h-8 w-8"
                >
                  {copiedOutput ? <Check size={14} /> : <Copy01 size={14} />}
                </Button>
              </div>
            </div>
            <div className="h-[200px] md:h-[300px] overflow-auto">
              <JsonSyntaxHighlighter jsonString={outputJson.content} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
