/**
 * Task Board Component
 *
 * Main UI for the Task Runner plugin. Shows:
 * - Workspace selector
 * - Task/Skills tabs
 * - Loop controls
 */

import {
  Folder,
  AlertCircle,
  Check,
  File02,
  MessageChatSquare,
  BookOpen01,
  Edit02,
  Trash01,
} from "@untitledui/icons";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@deco/ui/lib/utils.ts";
import { useParams } from "@decocms/bindings/plugins";
import {
  useTasks,
  useAgentSessions,
  useAgentSessionDetail,
  useSkills,
  useWorkspace,
  useBeadsStatus,
  useInitBeads,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useQualityGates,
  useDetectQualityGates,
  useApprovePlan,
  type Task,
  type Skill,
  type AgentSession,
  type QualityGate,
} from "../hooks/use-tasks";
import { KEYS } from "../lib/query-keys";

// ============================================================================
// Icons
// ============================================================================

const PlusIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path d="M12 5v14m-7-7h14" />
  </svg>
);

const CircleIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const ClockIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

const LoadingIcon = ({
  size = 14,
  className = "",
}: {
  size?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={cn("animate-spin", className)}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const RefreshIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path d="M1 4v6h6M23 20v-6h-6" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
  </svg>
);

// ============================================================================
// Chat Integration
// ============================================================================

/** Event to open the chat panel */
const CHAT_OPEN_EVENT = "deco:open-chat";
/** Event to send a message to the chat */
const CHAT_SEND_MESSAGE_EVENT = "deco:send-chat-message";

interface ChatSendMessageEventDetail {
  text: string;
  virtualMcpId?: string;
}

/**
 * Build a prompt message for the agent to work on a task
 */
function buildTaskPrompt(
  task: {
    id: string;
    title: string;
    description?: string;
  },
  workspace: string,
): string {
  // Use JSON to be unambiguous about tool parameters
  const params = JSON.stringify({
    taskId: task.id,
    taskTitle: task.title,
    taskDescription: task.description || task.title,
    workspace,
  });
  return `AGENT_SPAWN ${params}`;
}

/**
 * Open the chat panel and send a message to the agent
 */
function sendChatMessage(
  text: string,
  options?: { virtualMcpId?: string },
): void {
  // Open the chat panel
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT));

  // Send the message after a brief delay to allow panel to open
  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent<ChatSendMessageEventDetail>(CHAT_SEND_MESSAGE_EVENT, {
        detail: { text, virtualMcpId: options?.virtualMcpId },
      }),
    );
  }, 100);
}

// ============================================================================
// Workspace Display
// ============================================================================

function WorkspaceDisplay() {
  const { data: workspaceData, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <div className="bg-muted/30 rounded-lg px-4 py-3">
        <div className="text-sm text-muted-foreground">
          Loading workspace...
        </div>
      </div>
    );
  }

  if (!workspaceData?.workspace) {
    return (
      <div className="bg-muted/50 border border-dashed border-border rounded-lg p-6 text-center">
        <Folder size={32} className="mx-auto mb-3 text-muted-foreground" />
        <h3 className="font-medium mb-1">No Workspace Available</h3>
        <p className="text-sm text-muted-foreground">
          This storage connection doesn't expose a GET_ROOT tool.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Use a local-fs MCP with object storage tools to enable task
          management.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1 text-muted-foreground">
        <Folder size={11} />
        <span className="font-mono text-[11px] truncate max-w-[280px]">
          {workspaceData.workspace}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground/50">
        From storage connection
      </span>
    </div>
  );
}

// ============================================================================
// Beads Init Banner
// ============================================================================

function BeadsInitBanner() {
  const initBeads = useInitBeads();

  return (
    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className="text-yellow-600 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-yellow-900">Beads Not Initialized</h3>
          <p className="text-sm text-yellow-700 mt-1">
            This workspace doesn't have Beads set up yet. Initialize Beads to
            start tracking tasks.
          </p>
          <button
            type="button"
            onClick={() => initBeads.mutate()}
            disabled={initBeads.isPending}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {initBeads.isPending ? "Initializing..." : "Initialize Beads"}
          </button>
          {initBeads.isError && (
            <p className="text-sm text-red-600 mt-2">
              Error: {String(initBeads.error)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Agent Status - Shows when the Task Runner Agent is actively working
// ============================================================================

/**
 * Format relative time (e.g., "2s ago", "1m ago")
 */
function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/**
 * Single agent session card with detailed status
 */
function AgentSessionCard({ session }: { session: AgentSession }) {
  const sessionId = session.sessionId || session.id || "";
  const { data: detail } = useAgentSessionDetail(sessionId);
  const [isStopping, setIsStopping] = useState(false);

  const isRunning = session.status === "running";
  const isCompleted = session.status === "completed";

  const handleStop = () => {
    if (isStopping) return;
    if (!confirm(`Stop agent working on "${session.taskTitle}"?`)) return;

    setIsStopping(true);
    // Send a message to the Task Runner Agent to stop the session
    const stopMessage = `Please stop agent session ${sessionId} immediately. Call AGENT_STOP with sessionId="${sessionId}".`;
    sendChatMessage(stopMessage);
    toast.info("Sent stop request to agent");
  };

  // Use detailed data if available, otherwise fall back to summary
  const toolCalls = detail?.toolCalls || session.toolCalls || [];
  const messages = detail?.messages || session.messages || [];
  const toolCallCount =
    detail?.toolCallCount ?? session.toolCallCount ?? toolCalls.length;

  // Get last few tool calls for display
  const recentTools = toolCalls.slice(-5).reverse();

  // Get last assistant message
  const lastAssistant = messages
    .filter((m) => m.role === "assistant" && m.content)
    .slice(-1)[0];

  // Calculate duration - parent component's polling triggers re-render
  const startTime = new Date(session.startedAt).getTime();
  const endTime = session.completedAt
    ? new Date(session.completedAt).getTime()
    : Date.now();
  const durationSec = Math.floor((endTime - startTime) / 1000);
  const durationStr =
    durationSec < 60
      ? `${durationSec}s`
      : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

  return (
    <div
      className={cn(
        "rounded-lg p-4 border",
        isRunning && "bg-green-50 border-green-200",
        isCompleted && "bg-blue-50 border-blue-200",
        !isRunning && !isCompleted && "bg-red-50 border-red-200",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        {isRunning ? (
          <LoadingIcon size={18} className="text-green-600" />
        ) : isCompleted ? (
          <Check size={18} className="text-blue-600" />
        ) : (
          <AlertCircle size={18} className="text-red-600" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm font-semibold",
                isRunning && "text-green-700",
                isCompleted && "text-blue-700",
                !isRunning && !isCompleted && "text-red-700",
              )}
            >
              {isRunning
                ? "Agent Working"
                : isCompleted
                  ? "Completed"
                  : "Failed"}
            </span>
            <span className="text-xs text-muted-foreground">
              • {durationStr}
            </span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            Task: <strong>{session.taskTitle}</strong>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {toolCallCount > 0 && (
            <div className="text-xs bg-white/50 px-2 py-1 rounded">
              {toolCallCount} tool calls
            </div>
          )}
          {isRunning && (
            <button
              type="button"
              onClick={handleStop}
              disabled={isStopping}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded disabled:opacity-50"
              title="Stop this agent"
            >
              {isStopping ? (
                <LoadingIcon size={12} />
              ) : (
                <AlertCircle size={12} />
              )}
              {isStopping ? "Stopping..." : "Stop"}
            </button>
          )}
        </div>
      </div>

      {/* Last thinking/message - show for running */}
      {lastAssistant && isRunning && (
        <div className="mb-3 p-2 bg-white/50 rounded text-xs text-muted-foreground italic">
          "{lastAssistant.content.slice(0, 150)}
          {lastAssistant.content.length > 150 ? "..." : ""}"
        </div>
      )}

      {/* Error output - show for failed sessions */}
      {session.status === "failed" && session.output && (
        <div className="mb-3 p-2 bg-red-100 rounded border border-red-200">
          <div className="text-xs font-medium text-red-700 mb-1">Error:</div>
          <code className="text-xs text-red-600 font-mono whitespace-pre-wrap break-all">
            {session.output.slice(0, 300)}
            {session.output.length > 300 ? "..." : ""}
          </code>
        </div>
      )}

      {/* Completion message - show for completed */}
      {session.status === "completed" && lastAssistant && (
        <div className="mb-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
          {lastAssistant.content.slice(0, 150)}
          {lastAssistant.content.length > 150 ? "..." : ""}
        </div>
      )}

      {/* Recent tool calls */}
      {recentTools.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Recent activity:
          </div>
          {recentTools.map((tool, i) => (
            <div
              key={`${tool.name}-${tool.timestamp}-${i}`}
              className="flex items-center gap-2 text-xs"
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  i === 0 && isRunning
                    ? "bg-green-500 animate-pulse"
                    : "bg-muted-foreground/30",
                )}
              />
              <code className="font-mono text-muted-foreground">
                {tool.name}
              </code>
              <span className="text-muted-foreground/50">
                {formatRelativeTime(tool.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* No activity yet */}
      {recentTools.length === 0 && isRunning && (
        <div className="text-xs text-muted-foreground italic">
          Starting up...
        </div>
      )}
    </div>
  );
}

function AgentStatus() {
  const { data, isLoading, dataUpdatedAt } = useAgentSessions();
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const sessions = data?.sessions ?? [];

  // Running sessions for "Current" tab
  const runningSessions = sessions.filter((s) => s.status === "running");

  // Recently finished sessions (within last 60 seconds) - show in Current tab
  const recentlyFinished = sessions.filter((s) => {
    if (s.status === "running") return false;
    if (!s.completedAt) return false;
    const completedTime = new Date(s.completedAt).getTime();
    const now = Date.now();
    const sixtySeconds = 60 * 1000;
    return now - completedTime < sixtySeconds;
  });

  // Current tab shows running + recently finished
  const currentSessions = [...runningSessions, ...recentlyFinished];

  // Completed/failed sessions for "History" tab (all non-running)
  const historySessions = sessions
    .filter((s) => s.status !== "running")
    .slice(0, 10);

  const hasRunning = runningSessions.length > 0;
  const hasRecentActivity = currentSessions.length > 0;

  // Determine status indicator
  const mostRecentSession = currentSessions[0];
  const statusIndicator = hasRunning ? (
    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
  ) : mostRecentSession?.status === "failed" ? (
    <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">
      Failed
    </span>
  ) : mostRecentSession?.status === "completed" ? (
    <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
      Done
    </span>
  ) : (
    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
      Idle
    </span>
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <span>Agent Status</span>
          {statusIndicator}
        </h3>
        {isLoading ? (
          <span className="text-xs text-muted-foreground">Loading...</span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {new Date(dataUpdatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("current")}
          className={cn(
            "px-3 py-1.5 text-xs font-medium transition-colors relative",
            activeTab === "current"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Current
          {hasRecentActivity && (
            <span
              className={cn(
                "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]",
                hasRunning && "bg-green-500/20 text-green-600",
                !hasRunning &&
                  mostRecentSession?.status === "failed" &&
                  "bg-red-500/20 text-red-600",
                !hasRunning &&
                  mostRecentSession?.status !== "failed" &&
                  "bg-blue-500/20 text-blue-600",
              )}
            >
              {currentSessions.length}
            </span>
          )}
          {activeTab === "current" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={cn(
            "px-3 py-1.5 text-xs font-medium transition-colors relative",
            activeTab === "history"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          History
          {historySessions.length > 0 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              ({historySessions.length})
            </span>
          )}
          {activeTab === "history" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="max-h-64 overflow-y-auto space-y-2">
        {activeTab === "current" && (
          <>
            {currentSessions.length > 0 ? (
              currentSessions.map((session) => (
                <AgentSessionCard
                  key={session.sessionId || session.id}
                  session={session}
                />
              ))
            ) : (
              <div className="text-xs text-muted-foreground text-center py-4">
                No agents running. Click Execute on a task to start.
              </div>
            )}
          </>
        )}

        {activeTab === "history" && (
          <>
            {historySessions.length > 0 ? (
              historySessions.map((session) => (
                <AgentSessionCard
                  key={session.sessionId || session.id}
                  session={session}
                />
              ))
            ) : (
              <div className="text-xs text-muted-foreground text-center py-4">
                No completed sessions yet.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Task Card
// ============================================================================

// Plan icon component
const ListIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

function TaskCard({
  task,
  onStartWithAgent,
  hasRunningAgent,
  workspacePath,
  refetchTasks,
}: {
  task: Task;
  onStartWithAgent: (task: Task) => void;
  hasRunningAgent: boolean;
  workspacePath?: string;
  refetchTasks?: () => void;
}) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const approvePlan = useApprovePlan();
  const [showPlan, setShowPlan] = useState(false);
  const [isPlanningRequested, setIsPlanningRequested] = useState(false);
  const [isSpawning, setIsSpawning] = useState(false);

  // Poll for task updates while planning is in progress
  const hasPlan = !!task.plan;

  // Reset spawning state when agent starts running
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (hasRunningAgent && isSpawning) {
      setIsSpawning(false);
    }
  }, [hasRunningAgent, isSpawning]);
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (!isPlanningRequested || hasPlan) return;

    // Poll every 2 seconds while waiting for the plan
    const interval = setInterval(() => {
      refetchTasks?.();
    }, 2000);

    return () => clearInterval(interval);
  }, [isPlanningRequested, hasPlan, refetchTasks]);

  // Reset planning state when plan arrives
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (hasPlan && isPlanningRequested) {
      setIsPlanningRequested(false);
      setShowPlan(true); // Auto-expand plan when it arrives
      toast.success("Plan ready! Review and approve to continue.");
    }
  }, [hasPlan, isPlanningRequested]);

  const statusIcon = {
    open: <CircleIcon size={14} />,
    in_progress: <ClockIcon size={14} />,
    blocked: <AlertCircle size={14} className="text-red-500" />,
    closed: <Check size={14} className="text-green-500" />,
  };

  // If task is in_progress but no agent running, show as open
  const displayStatus =
    task.status === "in_progress" && !hasRunningAgent ? "open" : task.status;

  const handleDelete = () => {
    if (confirm(`Delete task "${task.title}"?`)) {
      deleteTask.mutate(
        { taskId: task.id },
        {
          onSuccess: () => toast.success("Task deleted"),
          onError: (err) => toast.error(`Failed to delete: ${err.message}`),
        },
      );
    }
  };

  const handlePlan = () => {
    if (!workspacePath) {
      toast.error("Workspace not available yet - please wait and try again");
      return;
    }

    // Send message to Task Runner Agent to analyze and plan the task
    const planningPrompt = `Please analyze and create a detailed plan for task ${task.id}: "${task.title}"

${task.description ? `Description: ${task.description}` : ""}
Workspace: ${workspacePath}

Instructions:
1. Read the task requirements carefully
2. Explore the codebase to understand relevant files and patterns
3. Create a plan with:
   - Clear, specific acceptance criteria (not generic ones)
   - Subtasks broken down by complexity  
   - Files that will likely need modification
   - Any risks or considerations

When done, call TASK_SET_PLAN with workspace="${workspacePath}", taskId="${task.id}", and your plan.`;

    sendChatMessage(planningPrompt);
    setIsPlanningRequested(true);
    toast.success("Sent to agent for planning - check the chat");
  };

  const handleApprovePlan = () => {
    approvePlan.mutate(
      { taskId: task.id, action: "approve" },
      {
        onSuccess: () => {
          toast.success("Plan approved - ready to execute");
          setShowPlan(false);
        },
        onError: (err) => toast.error(`Failed to approve: ${err.message}`),
      },
    );
  };

  const handleApproveAndExecute = () => {
    if (isSpawning || hasRunningAgent) return;
    setIsSpawning(true);
    approvePlan.mutate(
      { taskId: task.id, action: "approve" },
      {
        onSuccess: () => {
          toast.success("Plan approved - starting execution...");
          setShowPlan(false);
          onStartWithAgent(task);
        },
        onError: (err) => {
          setIsSpawning(false);
          toast.error(`Failed to approve: ${err.message}`);
        },
      },
    );
  };

  const handleExecute = () => {
    if (isSpawning || hasRunningAgent) return;
    setIsSpawning(true);
    onStartWithAgent(task);
  };

  const planApproved = task.planStatus === "approved";

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">
          {statusIcon[displayStatus]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-muted-foreground">
              {task.id}
            </span>
            {task.priority !== undefined && task.priority <= 1 && (
              <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                P{task.priority}
              </span>
            )}
            {hasPlan && (
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded",
                  planApproved
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700",
                )}
              >
                {planApproved ? "Plan Approved" : "Plan Draft"}
              </span>
            )}
          </div>
          <h4 className="font-medium text-sm mb-1">{task.title}</h4>
          {task.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Show acceptance criteria if approved */}
          {planApproved &&
            task.acceptanceCriteria &&
            task.acceptanceCriteria.length > 0 && (
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">Criteria: </span>
                <span className="text-foreground">
                  {task.acceptanceCriteria.length} items
                </span>
              </div>
            )}
        </div>
        <div className="flex items-center gap-1">
          {displayStatus !== "closed" && (
            <>
              {displayStatus !== "in_progress" && (
                <>
                  {/* Plan button - show if no plan or plan is draft */}
                  {!planApproved && (
                    <button
                      type="button"
                      onClick={
                        hasPlan ? () => setShowPlan(!showPlan) : handlePlan
                      }
                      disabled={isPlanningRequested && !hasPlan}
                      className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-md disabled:opacity-50 transition-colors"
                      title={
                        hasPlan
                          ? "View/Edit Plan"
                          : "Ask agent to plan this task"
                      }
                    >
                      {isPlanningRequested && !hasPlan ? (
                        <LoadingIcon size={12} />
                      ) : (
                        <ListIcon size={12} />
                      )}
                      <span>
                        {hasPlan
                          ? "View Plan"
                          : isPlanningRequested
                            ? "Planning..."
                            : "Plan"}
                      </span>
                    </button>
                  )}
                  {/* Execute button - only show if plan is approved and no agent running */}
                  {planApproved && !hasRunningAgent && (
                    <button
                      type="button"
                      onClick={handleExecute}
                      disabled={
                        updateTask.isPending ||
                        deleteTask.isPending ||
                        isSpawning
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md disabled:opacity-50 transition-colors"
                      title="Execute task with AI agent"
                    >
                      {isSpawning ? (
                        <LoadingIcon size={14} />
                      ) : (
                        <MessageChatSquare size={14} />
                      )}
                      <span>{isSpawning ? "Starting..." : "Execute"}</span>
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  // TODO: Open edit modal
                  toast.info("Edit feature coming soon");
                }}
                disabled={updateTask.isPending || deleteTask.isPending}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-50"
                title="Edit task"
              >
                <Edit02 size={14} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteTask.isPending || hasRunningAgent}
            className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
            title={hasRunningAgent ? "Stop agent first" : "Delete task"}
          >
            {deleteTask.isPending ? (
              <LoadingIcon size={14} />
            ) : (
              <Trash01 size={14} />
            )}
          </button>
        </div>
      </div>

      {/* Plan Details Section */}
      {showPlan && task.plan && (
        <div className="mt-4 pt-4 border-t border-border">
          {/* Scrollable content area */}
          <div className="max-h-64 overflow-y-auto space-y-3 pr-2">
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-1">
                Summary
              </h5>
              <p className="text-sm">{task.plan.summary}</p>
            </div>

            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-2">
                Acceptance Criteria ({task.plan.acceptanceCriteria.length})
              </h5>
              <ul className="space-y-1">
                {task.plan.acceptanceCriteria.map((ac) => (
                  <li key={ac.id} className="flex items-start gap-2 text-sm">
                    <span className="text-muted-foreground">•</span>
                    <span>{ac.description}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-2">
                Subtasks ({task.plan.subtasks.length})
              </h5>
              <ul className="space-y-1">
                {task.plan.subtasks.map((st) => (
                  <li key={st.id} className="flex items-start gap-2 text-sm">
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        st.estimatedComplexity === "trivial" &&
                          "bg-green-100 text-green-700",
                        st.estimatedComplexity === "simple" &&
                          "bg-blue-100 text-blue-700",
                        st.estimatedComplexity === "moderate" &&
                          "bg-yellow-100 text-yellow-700",
                        st.estimatedComplexity === "complex" &&
                          "bg-red-100 text-red-700",
                      )}
                    >
                      {st.estimatedComplexity}
                    </span>
                    <span>{st.title}</span>
                  </li>
                ))}
              </ul>
            </div>

            {task.plan.estimatedComplexity && (
              <div className="text-xs text-muted-foreground">
                Overall complexity:{" "}
                <span className="font-medium">
                  {task.plan.estimatedComplexity}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons - always visible */}
          <div className="flex items-center gap-2 pt-3 mt-3 border-t border-border/50">
            {hasRunningAgent ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <LoadingIcon size={14} />
                Agent already running...
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleApproveAndExecute}
                  disabled={approvePlan.isPending || isSpawning}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
                >
                  {approvePlan.isPending || isSpawning ? (
                    <LoadingIcon size={14} />
                  ) : (
                    <Check size={14} />
                  )}
                  {isSpawning ? "Starting..." : "Approve & Execute"}
                </button>
                <button
                  type="button"
                  onClick={handleApprovePlan}
                  disabled={approvePlan.isPending || isSpawning}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-md disabled:opacity-50"
                >
                  <Check size={14} />
                  Approve Only
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowPlan(false)}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tasks Tab Content
// ============================================================================

function TasksTabContent({
  onStartWithAgent,
  workspacePath,
}: {
  onStartWithAgent: (task: Task) => void;
  workspacePath?: string;
}) {
  const { data: tasks, isLoading, error, refetch, isFetching } = useTasks();
  const { data: skills } = useSkills();
  const { data: agentData } = useAgentSessions();
  const createTask = useCreateTask();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const selectedSkill = skills?.find((s) => s.id === selectedSkillId);

  // Get task IDs that have running agents
  const runningTaskIds = new Set(
    agentData?.sessions
      ?.filter((s) => s.status === "running")
      ?.map((s) => s.taskId) || [],
  );

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskTitle.trim()) {
      const description = selectedSkill
        ? `Follow the instructions in skills/${selectedSkill.id}/SKILL.md`
        : undefined;

      createTask.mutate(
        { title: newTaskTitle.trim(), description },
        {
          onSuccess: () => {
            toast.success("Task created");
            setNewTaskTitle("");
            setSelectedSkillId(null);
            setIsAdding(false);
          },
          onError: (err) => {
            toast.error(`Failed to create task: ${String(err)}`);
          },
        },
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <LoadingIcon size={14} />
        Loading tasks...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 p-4">
        Error loading tasks: {String(error)}
      </div>
    );
  }

  // Group tasks by status
  const grouped = {
    open: tasks?.filter((t) => t.status === "open") ?? [],
    in_progress: tasks?.filter((t) => t.status === "in_progress") ?? [],
    blocked: tasks?.filter((t) => t.status === "blocked") ?? [],
    closed: tasks?.filter((t) => t.status === "closed") ?? [],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <LoadingIcon size={14} className="text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-50"
            title="Refresh tasks"
          >
            <RefreshIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border hover:bg-accent"
          >
            <PlusIcon size={14} />
            Add Task
          </button>
        </div>
      </div>

      {isAdding && (
        <form
          onSubmit={handleAddTask}
          className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border"
        >
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Task title..."
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
            autoFocus
          />

          {skills && skills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground py-1">Skill:</span>
              <button
                type="button"
                onClick={() => setSelectedSkillId(null)}
                className={cn(
                  "px-2 py-1 text-xs rounded-md border transition-colors",
                  selectedSkillId === null
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-accent",
                )}
              >
                None
              </button>
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => setSelectedSkillId(skill.id)}
                  className={cn(
                    "px-2 py-1 text-xs rounded-md border transition-colors",
                    selectedSkillId === skill.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent",
                  )}
                  title={skill.description}
                >
                  {skill.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!newTaskTitle.trim() || createTask.isPending}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createTask.isPending ? <LoadingIcon size={14} /> : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewTaskTitle("");
                setSelectedSkillId(null);
              }}
              className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* In Progress */}
      {grouped.in_progress.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-green-600 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            In Progress ({grouped.in_progress.length})
          </h4>
          <div className="space-y-2">
            {grouped.in_progress.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStartWithAgent={onStartWithAgent}
                hasRunningAgent={runningTaskIds.has(task.id)}
                workspacePath={workspacePath}
                refetchTasks={refetch}
              />
            ))}
          </div>
        </div>
      )}

      {/* Open */}
      {grouped.open.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Open ({grouped.open.length})
          </h4>
          <div className="space-y-2">
            {grouped.open.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStartWithAgent={onStartWithAgent}
                hasRunningAgent={runningTaskIds.has(task.id)}
                workspacePath={workspacePath}
                refetchTasks={refetch}
              />
            ))}
          </div>
        </div>
      )}

      {/* Blocked */}
      {grouped.blocked.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-2">
            <AlertCircle size={14} />
            Blocked ({grouped.blocked.length})
          </h4>
          <div className="space-y-2">
            {grouped.blocked.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStartWithAgent={onStartWithAgent}
                hasRunningAgent={runningTaskIds.has(task.id)}
                workspacePath={workspacePath}
                refetchTasks={refetch}
              />
            ))}
          </div>
        </div>
      )}

      {/* Closed */}
      {grouped.closed.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-green-600 mb-2 flex items-center gap-2">
            <Check size={14} />
            Completed ({grouped.closed.length})
          </h4>
          <div className="space-y-2">
            {grouped.closed.slice(0, 5).map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStartWithAgent={onStartWithAgent}
                hasRunningAgent={false}
                workspacePath={workspacePath}
                refetchTasks={refetch}
              />
            ))}
            {grouped.closed.length > 5 && (
              <div className="text-xs text-muted-foreground text-center py-2">
                +{grouped.closed.length - 5} more completed
              </div>
            )}
          </div>
        </div>
      )}

      {tasks?.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <File02 size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No tasks yet</p>
          <p className="text-xs">Create a task to get started</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Skills Tab Content
// ============================================================================

function SkillsTabContent() {
  const { data: skills, isLoading } = useSkills();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <LoadingIcon size={14} />
        Loading skills...
      </div>
    );
  }

  if (!skills || skills.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <BookOpen01 size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No skills found</p>
        <p className="text-xs">
          Add a skills/ directory with SKILL.md files to define agent skills.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Skills are templates that provide context for tasks. Select a skill when
        creating a task.
      </p>
      {skills.map((skill: Skill) => (
        <div
          key={skill.id}
          className="p-4 bg-card border border-border rounded-lg"
        >
          <div className="flex items-start gap-3">
            <BookOpen01 size={16} className="text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-sm">{skill.name}</h4>
              <p className="text-xs text-muted-foreground mt-1">
                {skill.description}
              </p>
              <code className="text-xs text-muted-foreground mt-2 block">
                skills/{skill.id}/SKILL.md
              </code>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Quality Gates Tab Content
// ============================================================================

const ShieldIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

function QualityGatesTabContent() {
  const { data: gates, isLoading } = useQualityGates();
  const detectGates = useDetectQualityGates();

  const handleDetect = () => {
    detectGates.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(`Detected ${result.gates.length} quality gates`);
      },
      onError: (err) => {
        toast.error(`Failed to detect: ${err.message}`);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <LoadingIcon size={14} />
        Loading quality gates...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Quality gates are commands that must pass before a task is considered
          complete.
        </p>
        <button
          type="button"
          onClick={handleDetect}
          disabled={detectGates.isPending}
          className="flex items-center gap-1.5 px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded disabled:opacity-50"
        >
          {detectGates.isPending ? (
            <LoadingIcon size={12} />
          ) : (
            <RefreshIcon size={12} />
          )}
          Auto-detect
        </button>
      </div>

      {!gates || gates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <ShieldIcon size={32} />
          <p className="text-sm mt-2">No quality gates configured</p>
          <p className="text-xs">
            Click "Auto-detect" to find gates from package.json scripts.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {gates.map((gate: QualityGate) => (
            <div
              key={gate.id}
              className="p-3 bg-card border border-border rounded-lg flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-1.5 rounded",
                    gate.required
                      ? "bg-green-100 text-green-700"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <ShieldIcon size={14} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{gate.name}</span>
                    {gate.required && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                        Required
                      </span>
                    )}
                    {gate.source === "auto" && (
                      <span className="text-xs text-muted-foreground">
                        (auto-detected)
                      </span>
                    )}
                  </div>
                  <code className="text-xs text-muted-foreground font-mono">
                    {gate.command}
                  </code>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground border-t border-border pt-3 mt-4">
        <p className="font-medium mb-1">How it works:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Agents run quality gates before marking a task complete</li>
          <li>If any required gate fails, the agent fixes issues first</li>
          <li>
            Agents output{" "}
            <code className="bg-muted px-1 rounded">
              &lt;promise&gt;COMPLETE&lt;/promise&gt;
            </code>{" "}
            only when all gates pass
          </li>
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// Main Task Board
// ============================================================================

export default function TaskBoard() {
  const { data: workspaceData } = useWorkspace();
  const { data: beadsStatus } = useBeadsStatus();
  const { org: _org } = useParams({ strict: false }) as { org: string };
  const [activeTab, setActiveTab] = useState<"tasks" | "skills" | "gates">(
    "tasks",
  );
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();

  const workspace = workspaceData?.workspace;
  const hasBeads = beadsStatus?.initialized ?? false;

  /**
   * Start task with agent - opens chat and sends the task to the agent
   */
  const handleStartWithAgent = (task: Task) => {
    if (!workspace) {
      toast.error("No workspace set");
      return;
    }

    // Mark task as in progress
    updateTask.mutate(
      { taskId: task.id, status: "in_progress" },
      {
        onSuccess: () => {
          // Build the prompt and send to chat
          const prompt = buildTaskPrompt(task, workspace);
          sendChatMessage(prompt);
          toast.success(`Started task: ${task.title}`);

          // Start polling for agent session updates after a short delay
          // (the agent takes a moment to start)
          setTimeout(() => {
            queryClient.invalidateQueries({
              queryKey: KEYS.agentSessionsBase,
            });
          }, 1000);

          // Poll a few more times to catch the agent starting
          setTimeout(() => {
            queryClient.invalidateQueries({
              queryKey: KEYS.agentSessionsBase,
            });
          }, 3000);
        },
      },
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Workspace Display */}
      <WorkspaceDisplay />

      {workspace && (
        <>
          {/* Show init banner if beads not initialized */}
          {!hasBeads && <BeadsInitBanner />}

          {/* Loop Controls */}
          <AgentStatus />

          {/* Tabs */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {/* Tab Headers */}
            <div className="flex border-b border-border">
              <button
                type="button"
                onClick={() => setActiveTab("tasks")}
                className={cn(
                  "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                  activeTab === "tasks"
                    ? "bg-background text-foreground border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <span className="flex items-center justify-center gap-2">
                  <File02 size={16} />
                  Tasks
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("skills")}
                className={cn(
                  "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                  activeTab === "skills"
                    ? "bg-background text-foreground border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <span className="flex items-center justify-center gap-2">
                  <BookOpen01 size={16} />
                  Skills
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("gates")}
                className={cn(
                  "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                  activeTab === "gates"
                    ? "bg-background text-foreground border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <span className="flex items-center justify-center gap-2">
                  <ShieldIcon size={16} />
                  Quality Gates
                </span>
              </button>
            </div>

            {/* Tab Content - scrollable */}
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {activeTab === "tasks" && (
                <TasksTabContent
                  onStartWithAgent={handleStartWithAgent}
                  workspacePath={workspaceData?.workspace}
                />
              )}
              {activeTab === "skills" && <SkillsTabContent />}
              {activeTab === "gates" && <QualityGatesTabContent />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
