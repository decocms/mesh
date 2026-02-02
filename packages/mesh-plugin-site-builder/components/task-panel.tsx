/**
 * Task Panel Component
 *
 * Collapsible task panel that shows tasks and agent sessions
 * alongside the site preview. Reuses TaskCard from task-runner.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Loading02 } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  useTasks,
  useCreateTask,
  useAgentSessions,
  useSkills,
  useWorkspace,
  type Task,
} from "mesh-plugin-task-runner/hooks/use-tasks";
import { TaskCard } from "mesh-plugin-task-runner/components/task-card";
import { toast } from "sonner";
import { useSiteDetection } from "../hooks/use-site-detection";
import { usePages } from "../hooks/use-pages";
import { useDevServer } from "../hooks/use-dev-server";

interface TaskPanelProps {
  className?: string;
}

interface AgentSession {
  sessionId: string;
  taskId: string;
  taskTitle: string;
  status: "running" | "completed" | "failed" | "stopped";
  startedAt: string;
  completedAt?: string;
  toolCallCount?: number;
}

interface Skill {
  id: string;
  name: string;
  description?: string;
}

/** Event to open the chat panel */
const CHAT_OPEN_EVENT = "deco:open-chat";
/** Event to send a message to the chat */
const CHAT_SEND_MESSAGE_EVENT = "deco:send-chat-message";

/**
 * Send a message to the chat panel
 */
function sendChatMessage(text: string): void {
  // Open the chat panel
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT));

  // Send the message after a brief delay to allow panel to open
  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent(CHAT_SEND_MESSAGE_EVENT, {
        detail: { text },
      }),
    );
  }, 100);
}

export function TaskPanel({ className }: TaskPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<string>("");

  const { data: tasks = [], isLoading: tasksLoading, refetch } = useTasks();
  const { data: sessionData } = useAgentSessions();
  const { data: skills = [] } = useSkills();
  const { data: workspaceData } = useWorkspace();
  const createTask = useCreateTask();

  // Site context for agent prompts
  const { data: detection } = useSiteDetection();
  const { pages } = usePages();
  const { isRunning, serverUrl } = useDevServer();

  const sessions = sessionData?.sessions ?? [];
  const runningCount = sessionData?.runningCount ?? 0;
  const workspacePath = workspaceData?.workspace ?? undefined;

  // Get running task IDs
  const runningTaskIds = new Set(
    sessions
      .filter((s: AgentSession) => s.status === "running")
      .map((s: AgentSession) => s.taskId),
  );

  const openTasks = tasks.filter(
    (t: Task) => t.status === "open" || t.status === "in_progress",
  );
  const completedTasks = tasks
    .filter((t: Task) => t.status === "closed")
    .slice(0, 3);

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;

    try {
      await createTask.mutateAsync({
        title: newTaskTitle,
        description: selectedSkill
          ? `Using skill: ${skills.find((s: Skill) => s.id === selectedSkill)?.name}`
          : undefined,
      });
      setNewTaskTitle("");
      setSelectedSkill("");
      setShowNewTask(false);
      toast.success("Task created");
    } catch {
      toast.error("Failed to create task");
    }
  };

  const handleStartWithAgent = (task: Task) => {
    // Build site context for the agent
    const siteContext = detection?.isDeco
      ? {
          isDeco: true,
          serverUrl: isRunning ? serverUrl : undefined,
          pages: pages.map((p) => p.path),
          decoImports: detection.decoImports,
          siteType: "deco",
        }
      : undefined;

    // Build AGENT_SPAWN command with site context
    const params = JSON.stringify({
      taskId: task.id,
      taskTitle: task.title,
      taskDescription: task.description || task.title,
      workspace: workspacePath,
      siteContext,
    });

    sendChatMessage(`AGENT_SPAWN ${params}`);
  };

  return (
    <div
      className={cn(
        "border-l border-border bg-card flex flex-col",
        isExpanded ? "w-80" : "w-12",
        className,
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-2 border-b border-border hover:bg-muted/50 transition-colors"
      >
        {isExpanded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        {isExpanded && (
          <>
            <span className="font-medium text-sm">Tasks</span>
            {runningCount > 0 && (
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-blue-500 text-white">
                {runningCount} running
              </span>
            )}
          </>
        )}
      </button>

      {isExpanded && (
        <div className="flex-1 overflow-y-auto">
          {/* Running Sessions */}
          {sessions.filter((s: AgentSession) => s.status === "running").length >
            0 && (
            <div className="p-3 border-b border-border">
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                Running
              </h3>
              <div className="space-y-2">
                {sessions
                  .filter((s: AgentSession) => s.status === "running")
                  .map((session: AgentSession) => (
                    <div
                      key={session.sessionId}
                      className="p-2 rounded-md bg-blue-500/10 border border-blue-500/30"
                    >
                      <div className="flex items-center gap-2">
                        <Loading02
                          size={12}
                          className="text-blue-500 animate-spin"
                        />
                        <span className="text-sm font-medium truncate">
                          {session.taskTitle}
                        </span>
                      </div>
                      {session.toolCallCount !== undefined && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {session.toolCallCount} tool calls
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Open Tasks */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                Open Tasks ({openTasks.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowNewTask(true)}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="New task"
              >
                <Plus size={14} />
              </button>
            </div>

            {showNewTask && (
              <div className="mb-3 p-2 rounded-md border border-border bg-muted/30">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Task title..."
                  className="w-full px-2 py-1 text-sm rounded border border-border bg-background"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTask()}
                />
                {skills.length > 0 && (
                  <select
                    value={selectedSkill}
                    onChange={(e) => setSelectedSkill(e.target.value)}
                    className="w-full mt-2 px-2 py-1 text-sm rounded border border-border bg-background"
                  >
                    <option value="">No skill template</option>
                    {skills.map((skill: Skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleCreateTask}
                    disabled={!newTaskTitle.trim() || createTask.isPending}
                    className="flex-1 px-2 py-1 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewTask(false);
                      setNewTaskTitle("");
                      setSelectedSkill("");
                    }}
                    className="px-2 py-1 text-xs rounded hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {tasksLoading ? (
              <div className="text-xs text-muted-foreground">Loading...</div>
            ) : openTasks.length === 0 ? (
              <div className="text-xs text-muted-foreground">No open tasks</div>
            ) : (
              <div className="space-y-2">
                {openTasks.map((task: Task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStartWithAgent={handleStartWithAgent}
                    hasRunningAgent={runningTaskIds.has(task.id)}
                    workspacePath={workspacePath}
                    refetchTasks={refetch}
                    sendChatMessage={sendChatMessage}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <div className="p-3">
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                Recently Completed
              </h3>
              <div className="space-y-2">
                {completedTasks.map((task: Task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStartWithAgent={handleStartWithAgent}
                    hasRunningAgent={false}
                    workspacePath={workspacePath}
                    refetchTasks={refetch}
                    sendChatMessage={sendChatMessage}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
