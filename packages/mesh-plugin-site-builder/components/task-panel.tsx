/**
 * Task Panel Component
 *
 * Collapsible task panel that shows tasks and agent sessions
 * alongside the site preview. Reuses task-runner hooks.
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Play,
  Check,
  AlertCircle,
  Clock,
  Loading02,
} from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  useTasks,
  useCreateTask,
  useAgentSessions,
  useSkills,
} from "mesh-plugin-task-runner/hooks/use-tasks";
import { toast } from "sonner";
import { useSiteDetection } from "../hooks/use-site-detection";
import { usePages } from "../hooks/use-pages";
import { useDevServer } from "../hooks/use-dev-server";

interface TaskPanelProps {
  className?: string;
}

type TaskStatus = "open" | "in_progress" | "blocked" | "closed";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: number;
  createdAt?: string;
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

const statusIcons: Record<TaskStatus, React.ReactNode> = {
  open: <Clock size={14} className="text-muted-foreground" />,
  in_progress: <Loading02 size={14} className="text-blue-500 animate-spin" />,
  blocked: <AlertCircle size={14} className="text-yellow-500" />,
  closed: <Check size={14} className="text-green-500" />,
};

export function TaskPanel({ className }: TaskPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<string>("");

  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: sessionData } = useAgentSessions();
  const { data: skills = [] } = useSkills();
  const createTask = useCreateTask();

  // Site context for agent prompts
  const { data: detection } = useSiteDetection();
  const { pages } = usePages();
  const { isRunning, serverUrl } = useDevServer();

  const sessions = sessionData?.sessions ?? [];
  const runningCount = sessionData?.runningCount ?? 0;

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

  const handleRunTask = (task: Task) => {
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
      siteContext,
    });

    const message = `AGENT_SPAWN ${params}`;
    window.dispatchEvent(
      new CustomEvent("deco:open-chat", { detail: { message } }),
    );
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
              <div className="space-y-1">
                {openTasks.map((task: Task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors group"
                  >
                    {statusIcons[task.status]}
                    <span className="flex-1 text-sm truncate">
                      {task.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRunTask(task)}
                      className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Run task"
                    >
                      <Play size={12} />
                    </button>
                  </div>
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
              <div className="space-y-1">
                {completedTasks.map((task: Task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 p-2 rounded-md text-muted-foreground"
                  >
                    {statusIcons[task.status]}
                    <span className="flex-1 text-sm truncate line-through">
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
