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
  File02,
  BookOpen01,
  AlertCircle,
  Check,
} from "@untitledui/icons";
import { TaskCard } from "./task-card";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@deco/ui/lib/utils.ts";
import { useParams } from "@decocms/bindings/plugins";
import { useSearch } from "@tanstack/react-router";
import type { TaskBoardSearch } from "../lib/router";
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
  useQualityGates,
  useDetectQualityGates,
  useQualityGatesBaseline,
  useVerifyQualityGates,
  useAcknowledgeQualityGates,
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
// Tasks Tab Content
// ============================================================================

function TasksTabContent({
  onStartWithAgent,
  workspacePath,
  searchParams,
  onGoToQualityGates,
}: {
  onStartWithAgent: (task: Task) => void;
  workspacePath?: string;
  searchParams?: TaskBoardSearch;
  onGoToQualityGates?: () => void;
}) {
  const { data: tasks, isLoading, error, refetch, isFetching } = useTasks();
  const { data: skills } = useSkills();
  const { data: agentData } = useAgentSessions();
  const { data: baselineData } = useQualityGatesBaseline();
  const createTask = useCreateTask();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [hasAppliedParams, setHasAppliedParams] = useState(false);

  const selectedSkill = skills?.find((s) => s.id === selectedSkillId);
  const canCreateTasks = baselineData?.canCreateTasks ?? false;

  // Handle site context params from navigation
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (hasAppliedParams || !searchParams || !skills) return;

    const { skill, template, edit } = searchParams;

    if (skill || template || edit) {
      // Pre-select skill if provided
      if (skill) {
        const matchedSkill = skills.find((s) => s.id === skill);
        if (matchedSkill) {
          setSelectedSkillId(matchedSkill.id);
        }
      }

      // Pre-fill title based on context
      if (template) {
        setNewTaskTitle(`Create new page based on ${template}`);
      } else if (edit) {
        setNewTaskTitle(`Edit page: ${edit}`);
      } else if (skill) {
        setNewTaskTitle("Create new landing page");
      }

      // Open the add task form
      setIsAdding(true);
      setHasAppliedParams(true);
    }
  }, [searchParams, skills, hasAppliedParams]);

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
            disabled={!canCreateTasks}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border",
              canCreateTasks
                ? "border-border hover:bg-accent"
                : "border-border opacity-50 cursor-not-allowed",
            )}
            title={
              canCreateTasks
                ? "Add a new task"
                : "Verify quality gates first (see Quality Gates tab)"
            }
          >
            <PlusIcon size={14} />
            Add Task
          </button>
        </div>
      </div>

      {/* Warning if baseline not ready */}
      {!canCreateTasks && (
        <div className="flex items-center justify-between gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-yellow-600 flex-shrink-0" />
            <span className="font-medium text-yellow-800">
              Quality gates not verified.
            </span>
          </div>
          <button
            type="button"
            onClick={onGoToQualityGates}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition-colors"
          >
            Verify Quality Gates
          </button>
        </div>
      )}

      {isAdding && canCreateTasks && (
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
                sendChatMessage={sendChatMessage}
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
                sendChatMessage={sendChatMessage}
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
                sendChatMessage={sendChatMessage}
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
                sendChatMessage={sendChatMessage}
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
  const { data: baselineData, isLoading: baselineLoading } =
    useQualityGatesBaseline();
  const detectGates = useDetectQualityGates();
  const verifyGates = useVerifyQualityGates();
  const acknowledgeGates = useAcknowledgeQualityGates();
  const [showResults, setShowResults] = useState(false);
  const [lastResults, setLastResults] = useState<
    Array<{ gate: string; passed: boolean; output: string }>
  >([]);

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

  const handleVerify = () => {
    verifyGates.mutate(undefined, {
      onSuccess: (result) => {
        setLastResults(result.results);
        setShowResults(true);
        if (result.allPassed) {
          toast.success("All quality gates pass! Ready for tasks.");
        } else {
          toast.warning(
            `${result.results.filter((r) => !r.passed).length} gate(s) failing. Acknowledge to continue.`,
          );
        }
      },
      onError: (err) => {
        toast.error(`Verification failed: ${err.message}`);
      },
    });
  };

  const handleAcknowledge = () => {
    acknowledgeGates.mutate(true, {
      onSuccess: () => {
        toast.success(
          "Failures acknowledged. Agents will not try to fix pre-existing issues.",
        );
        setShowResults(false);
      },
      onError: (err) => {
        toast.error(`Failed to acknowledge: ${err.message}`);
      },
    });
  };

  if (isLoading || baselineLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <LoadingIcon size={14} />
        Loading quality gates...
      </div>
    );
  }

  const baseline = baselineData?.baseline;
  const hasBaseline = baselineData?.hasBaseline ?? false;
  const canCreateTasks = baselineData?.canCreateTasks ?? false;

  return (
    <div className="space-y-4">
      {/* Baseline Verification Section */}
      <div
        className={cn(
          "p-4 rounded-lg border",
          !hasBaseline
            ? "bg-yellow-50 border-yellow-200"
            : canCreateTasks
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200",
        )}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-sm flex items-center gap-2">
              {!hasBaseline ? (
                <>
                  <AlertCircle size={16} className="text-yellow-600" />
                  Quality Gates Not Verified
                </>
              ) : baseline?.allPassed ? (
                <>
                  <Check size={16} className="text-green-600" />
                  All Gates Passing
                </>
              ) : baseline?.acknowledged ? (
                <>
                  <AlertCircle size={16} className="text-orange-600" />
                  Failures Acknowledged
                </>
              ) : (
                <>
                  <AlertCircle size={16} className="text-red-600" />
                  Gates Failing - Action Required
                </>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {!hasBaseline ? (
                "Run verification to establish a baseline before creating tasks."
              ) : baseline?.allPassed ? (
                "Ready to create tasks. Agents will maintain this passing state."
              ) : baseline?.acknowledged ? (
                <>
                  Agents will NOT try to fix:{" "}
                  <span className="font-medium">
                    {baseline.failingGates.join(", ")}
                  </span>
                </>
              ) : (
                "Some gates are failing. Acknowledge to continue without fixing, or fix first."
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {!hasBaseline || !baseline?.allPassed ? (
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifyGates.isPending || !gates || gates.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded disabled:opacity-50"
              >
                {verifyGates.isPending ? (
                  <LoadingIcon size={12} />
                ) : (
                  <ShieldIcon size={12} />
                )}
                {hasBaseline ? "Re-verify" : "Verify Gates"}
              </button>
            ) : null}
            {hasBaseline && !baseline?.allPassed && !baseline?.acknowledged && (
              <button
                type="button"
                onClick={handleAcknowledge}
                disabled={acknowledgeGates.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 rounded disabled:opacity-50"
              >
                {acknowledgeGates.isPending ? (
                  <LoadingIcon size={12} />
                ) : (
                  <Check size={12} />
                )}
                Acknowledge Failures
              </button>
            )}
          </div>
        </div>

        {/* Show verification results */}
        {showResults && lastResults.length > 0 && (
          <div className="mt-3 pt-3 border-t border-current/10">
            <p className="text-xs font-medium mb-2">Verification Results:</p>
            <div className="space-y-1">
              {lastResults.map((result, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 text-xs px-2 py-1 rounded",
                    result.passed ? "bg-green-100" : "bg-red-100",
                  )}
                >
                  {result.passed ? (
                    <Check size={12} className="text-green-600" />
                  ) : (
                    <AlertCircle size={12} className="text-red-600" />
                  )}
                  <span className="font-medium">{result.gate}</span>
                  <span className="text-muted-foreground">
                    {result.passed ? "passed" : "failed"}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowResults(false)}
              className="text-xs text-muted-foreground hover:text-foreground mt-2"
            >
              Hide results
            </button>
          </div>
        )}
      </div>

      {/* Gates Configuration */}
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
          {gates.map((gate: QualityGate) => {
            const isFailing = baseline?.failingGates?.includes(gate.name);
            return (
              <div
                key={gate.id}
                className={cn(
                  "p-3 bg-card border rounded-lg flex items-center justify-between",
                  isFailing && baseline?.acknowledged
                    ? "border-orange-300 bg-orange-50/50"
                    : "border-border",
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "p-1.5 rounded",
                      isFailing
                        ? "bg-red-100 text-red-700"
                        : gate.required
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
                      {isFailing && baseline?.acknowledged && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                          Pre-existing failure
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
            );
          })}
        </div>
      )}

      <div className="text-xs text-muted-foreground border-t border-border pt-3 mt-4">
        <p className="font-medium mb-1">How it works:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            <strong>Verify first:</strong> Run gates to establish a baseline
            before creating tasks
          </li>
          <li>
            <strong>All passing:</strong> Agents maintain this state - any new
            failures must be fixed
          </li>
          <li>
            <strong>Acknowledged failures:</strong> Agents ignore pre-existing
            issues and focus on their task
          </li>
          <li>
            Agents output{" "}
            <code className="bg-muted px-1 rounded">
              &lt;promise&gt;COMPLETE&lt;/promise&gt;
            </code>{" "}
            when done
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
  const searchParams = useSearch({ strict: false }) as TaskBoardSearch;
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
                  searchParams={searchParams}
                  onGoToQualityGates={() => setActiveTab("gates")}
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
