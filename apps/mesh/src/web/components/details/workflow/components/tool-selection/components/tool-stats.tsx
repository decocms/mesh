import { Box, Clock, Database, Loader2 } from "lucide-react";
import type { McpState } from "@/web/hooks/use-mcp";
import type { ExecutionStats } from "../utils/calculate-execution-stats";

export function ToolStats({
  mcpState,
  stats,
}: {
  mcpState: McpState;
  stats: ExecutionStats | null;
}) {
  return (
    <div className="flex items-center gap-4 py-2 shrink-0">
      {/* MCP Status */}
      <div className="flex items-center gap-2">
        {mcpState === "ready" ? (
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        ) : mcpState === "connecting" ? (
          <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
        ) : (
          <div className="h-2 w-2 rounded-full bg-red-500" />
        )}
        <span className="font-mono text-sm capitalize text-muted-foreground">
          {mcpState.replace("_", " ")}
        </span>
      </div>

      {/* Execution Stats */}
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-sm">{stats?.duration || "-"}</span>
      </div>
      <div className="flex items-center gap-2">
        <Box className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-sm">{stats?.tokens || "-"}</span>
      </div>
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-sm">{stats?.bytes || "-"}</span>
      </div>
    </div>
  );
}
