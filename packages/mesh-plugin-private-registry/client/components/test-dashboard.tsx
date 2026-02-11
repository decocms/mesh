import { useState } from "react";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { BrokenMCPList } from "./broken-mcp-list";
import { TestConnectionsPanel } from "./test-connections-panel";
import {
  useRegistryTestConfig,
  useTestResults,
  useTestRun,
  useTestRunCancel,
  useTestRunStart,
} from "../hooks/use-test-runs";
import type { TestResult, TestToolResult } from "../lib/types";

function pct(run: { total_items: number; tested_items: number }): number {
  if (!run.total_items) return 0;
  return Math.min(100, Math.round((run.tested_items / run.total_items) * 100));
}

function formatDuration(
  startedAt: string | null,
  finishedAt: string | null,
): string | null {
  if (!startedAt) return null;
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const start = new Date(startedAt).getTime();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "running":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20 animate-pulse";
    case "completed":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "failed":
      return "bg-red-500/10 text-red-600 border-red-500/20";
    case "cancelled":
      return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
    default:
      return "";
  }
}

function ResultLogEntry({
  result: r,
  index: idx,
}: {
  result: TestResult;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isHealthCheck = r.tool_results.every(
    (t) => t.outputPreview === "health_check: not called",
  );
  const realToolTests = r.tool_results.filter(
    (t) => t.outputPreview !== "health_check: not called",
  );
  const passedTools = realToolTests.filter((t) => t.success).length;
  const failedTools = realToolTests.filter((t) => !t.success).length;
  const hasToolTests = realToolTests.length > 0;

  return (
    <div className="rounded border border-border overflow-hidden">
      <button
        type="button"
        className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-muted-foreground w-5 text-right shrink-0">
          {idx + 1}
        </span>
        <span
          className={`shrink-0 ${
            r.status === "passed"
              ? "text-emerald-600"
              : r.status === "needs_auth"
                ? "text-amber-600"
                : "text-red-600"
          }`}
        >
          {r.status === "passed" ? "✓" : r.status === "needs_auth" ? "🔑" : "✗"}
        </span>
        <span className="font-medium truncate flex-1 min-w-0">
          {r.item_title}
        </span>
        <span className="text-muted-foreground shrink-0">
          {r.duration_ms}ms
        </span>
        <Badge
          variant="outline"
          className={`text-[9px] capitalize shrink-0 ${
            r.status === "passed"
              ? "text-emerald-600 border-emerald-500/20"
              : r.status === "needs_auth"
                ? "text-amber-600 border-amber-500/20"
                : "text-red-600 border-red-500/20"
          }`}
        >
          {r.status.replace("_", " ")}
        </Badge>
        {r.connection_ok ? (
          <span className="text-[10px] text-emerald-600 shrink-0">conn✓</span>
        ) : (
          <span className="text-[10px] text-red-600 shrink-0">conn✗</span>
        )}
        {r.tools_listed && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {hasToolTests ? (
              <>
                <span className="text-emerald-600">{passedTools}✓</span>{" "}
                <span className={failedTools > 0 ? "text-red-600" : ""}>
                  {failedTools}✗
                </span>
              </>
            ) : isHealthCheck && r.tool_results.length > 0 ? (
              <span>{r.tool_results.length} tools found</span>
            ) : (
              "no tools"
            )}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground shrink-0">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2 bg-muted/10">
          {/* Error message */}
          {r.error_message && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold text-red-600">Error</p>
              <pre className="text-[11px] bg-red-500/5 border border-red-500/10 rounded px-2 py-1.5 whitespace-pre-wrap break-all text-red-700 max-h-20 overflow-auto">
                {r.error_message}
              </pre>
            </div>
          )}

          {/* Connection & listing info */}
          <div className="flex items-center gap-3 text-[10px] flex-wrap">
            <span>
              Connection:{" "}
              <span
                className={
                  r.connection_ok ? "text-emerald-600" : "text-red-600"
                }
              >
                {r.connection_ok ? "OK" : "Failed"}
              </span>
            </span>
            <span>
              Tools listed:{" "}
              <span
                className={r.tools_listed ? "text-emerald-600" : "text-red-600"}
              >
                {r.tools_listed ? "Yes" : "No"}
              </span>
            </span>
            {r.action_taken !== "none" && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                action: {r.action_taken}
              </Badge>
            )}
          </div>

          {/* Tool results */}
          {hasToolTests ? (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground">
                Tools tested: {passedTools} passed, {failedTools} failed
              </p>
              <div className="space-y-0.5">
                {realToolTests.map((tool) => (
                  <ToolMiniRow key={`${r.id}-${tool.toolName}`} tool={tool} />
                ))}
              </div>
            </div>
          ) : isHealthCheck && r.tool_results.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground">
                Tools discovered ({r.tool_results.length}) — not individually
                tested (health-check mode)
              </p>
              <div className="flex flex-wrap gap-1">
                {r.tool_results.map((tool) => (
                  <Badge
                    key={`${r.id}-${tool.toolName}`}
                    variant="outline"
                    className="text-[10px] font-mono"
                  >
                    {tool.toolName}
                  </Badge>
                ))}
              </div>
            </div>
          ) : r.tools_listed ? (
            <p className="text-[10px] text-muted-foreground italic">
              No tools found on this server.
            </p>
          ) : null}

          {/* Agent summary */}
          {r.agent_summary && (
            <p className="text-[11px] bg-muted/50 rounded px-2 py-1.5">
              {r.agent_summary}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ToolMiniRow({ tool }: { tool: TestToolResult }) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div className="rounded border border-border overflow-hidden">
      <button
        type="button"
        className="w-full text-left flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-muted/30 transition-colors"
        onClick={() => setShowDetails(!showDetails)}
      >
        <span
          className={`font-bold ${tool.success ? "text-emerald-600" : "text-red-600"}`}
        >
          {tool.success ? "✓" : "✗"}
        </span>
        <span className="font-mono truncate flex-1">{tool.toolName}</span>
        <span className="text-muted-foreground shrink-0">
          {tool.durationMs}ms
        </span>
        {tool.error && (
          <span className="text-red-500 truncate max-w-28" title={tool.error}>
            {tool.error}
          </span>
        )}
        <span className="text-muted-foreground">{showDetails ? "▲" : "▼"}</span>
      </button>
      {showDetails && (
        <div className="border-t border-border px-2 py-1.5 space-y-1 bg-muted/10 text-[11px]">
          {tool.error && (
            <pre className="bg-red-500/5 border border-red-500/10 rounded px-2 py-1 whitespace-pre-wrap break-all text-red-700 max-h-20 overflow-auto">
              {tool.error}
            </pre>
          )}
          {tool.input && Object.keys(tool.input).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">
                Input
              </p>
              <pre className="bg-muted/50 rounded px-2 py-1 whitespace-pre-wrap break-all max-h-16 overflow-auto">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.outputPreview && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">
                Output
              </p>
              <pre className="bg-muted/50 rounded px-2 py-1 whitespace-pre-wrap break-all max-h-16 overflow-auto">
                {tool.outputPreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TestDashboard({
  activeRunId,
  onRunChange,
}: {
  activeRunId?: string;
  onRunChange: (runId: string | undefined) => void;
}) {
  const { settings } = useRegistryTestConfig();
  const runStartMutation = useTestRunStart();
  const runCancelMutation = useTestRunCancel();
  const runQuery = useTestRun(activeRunId);
  const run = runQuery.data?.run ?? null;
  const brokenQuery = useTestResults(activeRunId, "failed");
  const allResults = useTestResults(activeRunId);

  const onStart = async () => {
    const created = await runStartMutation.mutateAsync(settings);
    onRunChange(created.run.id);
  };

  const onCancel = async () => {
    if (!activeRunId) return;
    await runCancelMutation.mutateAsync(activeRunId);
  };

  const isRunning = run?.status === "running";
  const duration = run ? formatDuration(run.started_at, run.finished_at) : null;

  // Get recently completed results for live log
  const recentResults = allResults.data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Current run card */}
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Current Run</h3>
            <p className="text-xs text-muted-foreground">
              Start a full validation run over your MCP registry.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={onStart}
              disabled={runStartMutation.isPending || isRunning}
            >
              {runStartMutation.isPending ? "Starting..." : "Start tests"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              disabled={!activeRunId || !isRunning}
            >
              Cancel
            </Button>
          </div>
        </div>

        {/* Current saved config preview */}
        {!isRunning && !run && (
          <div className="flex items-center gap-2 text-[11px] flex-wrap bg-muted/30 rounded-lg px-3 py-2">
            <span className="text-muted-foreground">Will run as:</span>
            <Badge variant="outline" className="text-[10px]">
              {settings.testMode === "full_agent"
                ? "Full Agent (LLM)"
                : settings.testMode === "tool_call"
                  ? "Tool Call"
                  : "Health Check"}
            </Badge>
            {settings.testMode !== "health_check" && (
              <span className="text-[10px] text-muted-foreground">
                (will test each tool individually)
              </span>
            )}
            {settings.testMode === "health_check" && (
              <span className="text-[10px] text-muted-foreground">
                (connect + list tools only)
              </span>
            )}
            {settings.onFailure !== "none" && (
              <Badge
                variant="outline"
                className="text-[10px] text-red-600 border-red-500/20"
              >
                on fail: {settings.onFailure.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        )}

        {run ? (
          <>
            {/* Status + progress */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className={`capitalize ${statusBadgeClass(run.status)}`}>
                {run.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {run.tested_items}/{run.total_items} tested
              </span>
              {duration && (
                <span className="text-xs text-muted-foreground">
                  {duration}
                </span>
              )}
              {isRunning && run.current_item_id && (
                <span className="text-xs text-muted-foreground truncate max-w-48">
                  Testing:{" "}
                  <span className="font-mono">{run.current_item_id}</span>
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  run.failed_items > 0 ? "bg-orange-500" : "bg-emerald-500"
                } ${isRunning ? "animate-pulse" : ""}`}
                style={{ width: `${pct(run)}%` }}
              />
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Card className="p-2.5 space-y-0.5">
                <p className="text-[10px] text-emerald-600">Passed</p>
                <p className="text-lg font-bold text-emerald-600">
                  {run.passed_items}
                </p>
              </Card>
              <Card className="p-2.5 space-y-0.5">
                <p className="text-[10px] text-red-600">Failed</p>
                <p className="text-lg font-bold text-red-600">
                  {run.failed_items}
                </p>
              </Card>
              <Card className="p-2.5 space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Skipped</p>
                <p className="text-lg font-bold">{run.skipped_items}</p>
              </Card>
              <Card className="p-2.5 space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Total</p>
                <p className="text-lg font-bold">{run.total_items}</p>
              </Card>
            </div>

            {/* Config snapshot */}
            {run.config_snapshot && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                <Badge variant="outline" className="text-[10px]">
                  {run.config_snapshot.testMode.replace("_", " ")}
                </Badge>
                <span>
                  timeout: {run.config_snapshot.perMcpTimeoutMs / 1000}s per MCP
                </span>
                {run.config_snapshot.onFailure !== "none" && (
                  <Badge variant="outline" className="text-[10px] text-red-600">
                    on fail: {run.config_snapshot.onFailure.replace(/_/g, " ")}
                  </Badge>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            No run selected yet. Start a new run to begin.
          </p>
        )}
      </Card>

      {/* Live results log */}
      {recentResults.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Results Log ({recentResults.length})
            </h3>
            {run?.config_snapshot?.testMode && (
              <Badge variant="outline" className="text-[10px]">
                mode: {run.config_snapshot.testMode.replace("_", " ")}
              </Badge>
            )}
          </div>
          <div className="space-y-1 max-h-96 overflow-auto">
            {recentResults.map((r, idx) => (
              <ResultLogEntry key={r.id} result={r} index={idx} />
            ))}
          </div>
        </Card>
      )}

      {/* Broken + Connections */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">
            Broken MCPs{" "}
            {(brokenQuery.data?.items?.length ?? 0) > 0 && (
              <Badge variant="destructive" className="text-[10px] ml-1">
                {brokenQuery.data?.items?.length}
              </Badge>
            )}
          </h3>
          <BrokenMCPList results={brokenQuery.data?.items ?? []} />
        </div>
        <TestConnectionsPanel />
      </div>
    </div>
  );
}
