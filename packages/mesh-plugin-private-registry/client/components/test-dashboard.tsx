import { useState } from "react";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { BrokenMCPList } from "./broken-mcp-list";
import { TestConfiguration } from "./test-configuration";
import { TestConnectionsPanel } from "./test-connections-panel";
import {
  useRegistryTestConfig,
  useTestResults,
  useTestRun,
  useTestRunCancel,
  useTestRunStart,
  useTestRuns,
} from "../hooks/use-test-runs";
import type { TestMode, TestResult, TestToolResult } from "../lib/types";
import { cn } from "@deco/ui/lib/utils.ts";

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
          className={cn(
            "shrink-0",
            r.status === "passed"
              ? "text-emerald-600"
              : r.status === "needs_auth"
                ? "text-amber-600"
                : "text-red-600",
          )}
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
          className={cn(
            "text-[9px] capitalize shrink-0",
            r.status === "passed"
              ? "text-emerald-600 border-emerald-500/20"
              : r.status === "needs_auth"
                ? "text-amber-600 border-amber-500/20"
                : "text-red-600 border-red-500/20",
          )}
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
                <span className={cn(failedTools > 0 ? "text-red-600" : "")}>
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
          {r.error_message && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold text-red-600">Error</p>
              <pre className="text-[11px] bg-red-500/5 border border-red-500/10 rounded px-2 py-1.5 whitespace-pre-wrap break-all text-red-700 max-h-20 overflow-auto">
                {r.error_message}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-3 text-[10px] flex-wrap">
            <span>
              Connection:{" "}
              <span
                className={cn(
                  r.connection_ok ? "text-emerald-600" : "text-red-600",
                )}
              >
                {r.connection_ok ? "OK" : "Failed"}
              </span>
            </span>
            <span>
              Tools listed:{" "}
              <span
                className={cn(
                  r.tools_listed ? "text-emerald-600" : "text-red-600",
                )}
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
                Tools discovered ({r.tool_results.length}) - not individually
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
          className={cn(
            "font-bold",
            tool.success ? "text-emerald-600" : "text-red-600",
          )}
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
  const [modeOverride, setModeOverride] = useState<TestMode | null>(null);
  const runStartMutation = useTestRunStart();
  const runCancelMutation = useTestRunCancel();
  const runQuery = useTestRun(activeRunId);
  const runsQuery = useTestRuns();
  const run = runQuery.data?.run ?? null;
  const runStatus = run?.status;
  const brokenQuery = useTestResults(activeRunId, "failed", runStatus);
  const allResults = useTestResults(activeRunId, undefined, runStatus);

  const onStart = async () => {
    const effectiveMode = modeOverride ?? settings.testMode;
    const created = await runStartMutation.mutateAsync({
      ...settings,
      testMode: effectiveMode,
    });
    onRunChange(created.run.id);
  };

  const onCancel = async () => {
    if (!activeRunId) return;
    await runCancelMutation.mutateAsync(activeRunId);
  };

  const isRunning = run?.status === "running";
  const duration = run ? formatDuration(run.started_at, run.finished_at) : null;
  const resultItems = allResults.data?.items ?? [];
  const selectedMode = modeOverride ?? settings.testMode;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      <div className="xl:col-span-8 space-y-4 min-w-0">
        <Card className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">Current Run</h3>
              <p className="text-xs text-muted-foreground">
                Start a full validation run and track results in real time.
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">
                Test mode
              </span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedMode}
                onChange={(e) => setModeOverride(e.target.value as TestMode)}
                disabled={isRunning}
              >
                <option value="health_check">Health check</option>
                <option value="tool_call">Tool call</option>
                <option value="full_agent">Full agent (LLM-assisted)</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">
                Run history
              </span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={activeRunId ?? ""}
                onChange={(e) => onRunChange(e.target.value || undefined)}
              >
                <option value="">Current / none selected</option>
                {(runsQuery.data?.items ?? []).map((runItem) => (
                  <option key={runItem.id} value={runItem.id}>
                    {new Date(runItem.created_at).toLocaleString()} -{" "}
                    {runItem.status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="text-[11px] text-muted-foreground rounded-md bg-muted/30 px-2.5 py-2">
            {selectedMode === "health_check"
              ? "Checks connectivity and tool listing only — no tool calls are made."
              : selectedMode === "tool_call"
                ? "Calls each tool with empty inputs to verify it responds without errors."
                : "Uses an LLM to generate realistic inputs for each tool and validates the outputs."}
          </p>

          {run ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  className={cn("capitalize", statusBadgeClass(run.status))}
                >
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
                  <span className="text-xs text-muted-foreground truncate max-w-64">
                    Testing:{" "}
                    <span className="font-mono">{run.current_item_id}</span>
                  </span>
                )}
              </div>

              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    run.failed_items > 0 ? "bg-orange-500" : "bg-emerald-500",
                    isRunning ? "animate-pulse" : "",
                  )}
                  style={{ width: `${pct(run)}%` }}
                />
              </div>

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
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No run selected yet. Start a new run to begin.
            </p>
          )}
        </Card>

        <Card className="p-4 space-y-2 min-h-[360px]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Results Log ({resultItems.length})
            </h3>
            <div className="flex items-center gap-2">
              {isRunning && (
                <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 animate-pulse">
                  testing in progress
                </Badge>
              )}
              {run?.config_snapshot?.testMode && (
                <Badge variant="outline" className="text-[10px]">
                  mode: {run.config_snapshot.testMode.replace("_", " ")}
                </Badge>
              )}
            </div>
          </div>

          {resultItems.length === 0 ? (
            <div className="h-[280px] rounded border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
              No results yet. Start a run to see live logs here.
            </div>
          ) : (
            <div
              ref={(node) => {
                if (node && isRunning) {
                  // Only auto-scroll when the user is near the bottom (within 120px)
                  const distanceFromBottom =
                    node.scrollHeight - node.scrollTop - node.clientHeight;
                  if (distanceFromBottom < 120) {
                    requestAnimationFrame(() => {
                      node.scrollTop = node.scrollHeight;
                    });
                  }
                }
              }}
              className="space-y-1 max-h-[60vh] overflow-auto pr-1"
            >
              {resultItems.map((r, idx) => (
                <ResultLogEntry key={r.id} result={r} index={idx} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="xl:col-span-4 space-y-4 min-w-0">
        <TestConnectionsPanel />

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

        <details className="group rounded-lg border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold flex items-center justify-between">
            Advanced configuration
            <span className="text-muted-foreground text-xs transition-transform group-open:rotate-180">
              ▼
            </span>
          </summary>
          <div className="px-4 pb-4">
            <TestConfiguration hideTestMode borderless />
          </div>
        </details>
      </div>
    </div>
  );
}
