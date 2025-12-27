/**
 * STDIO Status Panel
 *
 * Displays process status, logs, and controls for STDIO MCP connections.
 * Shown in the right panel of connection settings for STDIO type connections.
 */

import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { ScrollArea } from "@deco/ui/components/scroll-area.tsx";
import {
  RefreshCw,
  Terminal,
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

interface StdioLogEntry {
  timestamp: number;
  level: "info" | "error" | "debug";
  message: string;
}

interface StdioConnectionInfo {
  status: "starting" | "running" | "stopped" | "error" | "disconnected";
  command: string;
  restartCount: number;
  error?: string;
  startedAt?: number;
  logsCount: number;
}

interface StdioInfoResponse {
  info: StdioConnectionInfo | null;
  logs: StdioLogEntry[];
}

export function StdioStatusPanel({ connectionId }: { connectionId: string }) {
  const queryClient = useQueryClient();

  // Fetch STDIO info and logs
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["stdio-info", connectionId],
    queryFn: async (): Promise<StdioInfoResponse> => {
      const response = await fetch(`/api/stdio/${connectionId}/logs`);
      if (!response.ok) {
        // If 404, the process hasn't started yet
        if (response.status === 404) {
          return { info: null, logs: [] };
        }
        throw new Error("Failed to fetch STDIO status");
      }
      return response.json();
    },
    refetchInterval: 3000, // Refresh every 3s
  });

  // Start mutation - for starting a process that hasn't started yet
  const startMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/stdio/${connectionId}/start`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start STDIO connection");
      }
      return response.json();
    },
    onSuccess: () => {
      // Refetch status after a short delay to allow start
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["stdio-info", connectionId] });
      }, 1000);
    },
  });

  // Restart mutation - for restarting a running process
  const restartMutation = useMutation({
    mutationFn: async () => {
      // First stop, then start
      await fetch(`/api/stdio/${connectionId}/restart`, { method: "POST" });
      // Then start it again
      const response = await fetch(`/api/stdio/${connectionId}/start`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to restart STDIO connection");
      }
      return response.json();
    },
    onSuccess: () => {
      // Refetch status after a short delay to allow restart
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["stdio-info", connectionId] });
      }, 1500);
    },
  });

  const getStatusBadge = (status: StdioConnectionInfo["status"] | undefined) => {
    switch (status) {
      case "running":
        return (
          <Badge variant="default" className="bg-green-600 text-white gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Running
          </Badge>
        );
      case "starting":
        return (
          <Badge variant="secondary" className="gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Starting
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-600 gap-1">
            <AlertCircle className="w-3 h-3" />
            Disconnected
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="w-3 h-3" />
            Error
          </Badge>
        );
      case "stopped":
        return (
          <Badge variant="outline" className="gap-1">
            <Terminal className="w-3 h-3" />
            Stopped
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground gap-1">
            <Clock className="w-3 h-3" />
            Not Started
          </Badge>
        );
    }
  };

  const getLogLevelClass = (level: StdioLogEntry["level"]) => {
    switch (level) {
      case "error":
        return "text-red-400";
      case "debug":
        return "text-gray-500";
      default:
        return "text-gray-300";
    }
  };

  const info = data?.info;
  const logs = data?.logs ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">Process Status</span>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(info?.status)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {info?.status === "running" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => restartMutation.mutate()}
              disabled={restartMutation.isPending}
              className="gap-1"
            >
              {restartMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Restart
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="gap-1"
            >
              {startMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Start
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Info Section */}
      {info && (
        <div className="p-4 border-b border-border text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Command</span>
            <code className="text-xs bg-muted px-2 py-0.5 rounded max-w-[300px] truncate">
              {info.command}
            </code>
          </div>
          {info.startedAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span className="text-xs">
                {formatDistanceToNow(info.startedAt, { addSuffix: true })}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Restarts</span>
            <span className="text-xs">{info.restartCount}</span>
          </div>
          {info.error && (
            <div className="mt-2 p-2 bg-destructive/10 rounded-md">
              <span className="text-destructive text-xs font-medium">
                Last Error:
              </span>
              <p className="text-destructive text-xs mt-1 font-mono">
                {info.error}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Not started message */}
      {!info && !isLoading && (
        <div className="p-4 border-b border-border">
          <div className="text-sm text-muted-foreground text-center py-4">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Process will start on first request</p>
            <p className="text-xs mt-1">
              Or click "Start" to initialize now
            </p>
          </div>
        </div>
      )}

      {/* Logs Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium">Logs</span>
          <span className="text-xs text-muted-foreground">
            {logs.length} entries
          </span>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 font-mono text-xs bg-slate-950 min-h-[200px]">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No logs yet
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="flex gap-2 py-0.5 hover:bg-slate-900">
                  <span className="text-gray-600 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`${getLogLevelClass(log.level)} shrink-0 uppercase w-12`}>
                    [{log.level}]
                  </span>
                  <span className="text-gray-300 break-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

