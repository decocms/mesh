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
} from "@untitledui/icons";
import { useState } from "react";
import { toast } from "sonner";
import { useParams } from "@decocms/bindings/plugins";
import {
  useTasks,
  useLoopStatus,
  useSkills,
  useWorkspace,
  useBeadsStatus,
  useInitBeads,
  useCreateTask,
  useUpdateTask,
  type Task,
  type Skill,
} from "../hooks/use-tasks";

// ============================================================================
// Icons
// ============================================================================

const PauseIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
  </svg>
);

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
    className={`animate-spin ${className}`}
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
    <div className="flex items-center justify-between bg-muted/30 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2">
        <Folder size={16} className="text-muted-foreground" />
        <span className="font-mono text-sm">{workspaceData.workspace}</span>
      </div>
      <span className="text-xs text-muted-foreground">
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

function AgentStatus() {
  const { data: status } = useLoopStatus();

  const isRunning = status?.status === "running";
  const isPaused = status?.status === "paused";
  const isActive = isRunning || isPaused;

  // Don't show anything when idle - the agent controls happen in chat
  if (!isActive) {
    return null;
  }

  return (
    <div
      className={`rounded-lg p-3 ${
        isRunning
          ? "bg-green-50 border border-green-200"
          : "bg-yellow-50 border border-yellow-200"
      }`}
    >
      <div className="flex items-center gap-3">
        {isRunning ? (
          <>
            <LoadingIcon size={16} className="text-green-600" />
            <div className="flex-1">
              <span className="text-sm font-medium text-green-700">
                Agent is working
              </span>
              {status?.currentTask && (
                <span className="text-xs text-green-600 ml-2">
                  on{" "}
                  <code className="bg-green-100 px-1 rounded">
                    {status.currentTask}
                  </code>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-green-600">
              <span>
                Iteration {status?.iteration}/{status?.maxIterations}
              </span>
              <span>✓ {status?.tasksCompleted.length ?? 0}</span>
              <span>✗ {status?.tasksFailed.length ?? 0}</span>
            </div>
          </>
        ) : (
          <>
            <PauseIcon size={16} />
            <span className="text-sm font-medium text-yellow-700">
              Agent paused
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Task Card
// ============================================================================

function TaskCard({
  task,
  onStartWithAgent,
}: {
  task: Task;
  onStartWithAgent: (task: Task) => void;
}) {
  const updateTask = useUpdateTask();

  const statusIcon = {
    open: <CircleIcon size={14} />,
    in_progress: <ClockIcon size={14} />,
    blocked: <AlertCircle size={14} className="text-red-500" />,
    closed: <Check size={14} className="text-green-500" />,
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">
          {statusIcon[task.status]}
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
          </div>
          <h4 className="font-medium text-sm mb-1">{task.title}</h4>
          {task.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {task.status !== "closed" && (
            <>
              {task.status !== "in_progress" && (
                <button
                  type="button"
                  onClick={() => onStartWithAgent(task)}
                  disabled={updateTask.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md disabled:opacity-50 transition-colors"
                  title="Execute task with AI agent"
                >
                  {updateTask.isPending ? (
                    <LoadingIcon size={14} />
                  ) : (
                    <MessageChatSquare size={14} />
                  )}
                  <span>Execute</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  // TODO: Open edit modal
                  toast.info("Edit feature coming soon");
                }}
                disabled={updateTask.isPending}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-50"
                title="Edit task"
              >
                <Edit02 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tasks Tab Content
// ============================================================================

function TasksTabContent({
  onStartWithAgent,
}: {
  onStartWithAgent: (task: Task) => void;
}) {
  const { data: tasks, isLoading, error, refetch, isFetching } = useTasks();
  const { data: skills } = useSkills();
  const createTask = useCreateTask();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const selectedSkill = skills?.find((s) => s.id === selectedSkillId);

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
                className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                  selectedSkillId === null
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                None
              </button>
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => setSelectedSkillId(skill.id)}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                    selectedSkillId === skill.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
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

      {/* Open & In Progress */}
      {(grouped.open.length > 0 || grouped.in_progress.length > 0) && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Open ({grouped.open.length + grouped.in_progress.length})
          </h4>
          <div className="space-y-2">
            {grouped.in_progress.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStartWithAgent={onStartWithAgent}
              />
            ))}
            {grouped.open.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStartWithAgent={onStartWithAgent}
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
// Main Task Board
// ============================================================================

export default function TaskBoard() {
  const { data: workspaceData } = useWorkspace();
  const { data: beadsStatus } = useBeadsStatus();
  const { org } = useParams({ strict: false }) as { org: string };
  const [activeTab, setActiveTab] = useState<"tasks" | "skills">("tasks");
  const updateTask = useUpdateTask();

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
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === "tasks"
                    ? "bg-background text-foreground border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <File02 size={16} />
                  Tasks
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("skills")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === "skills"
                    ? "bg-background text-foreground border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <BookOpen01 size={16} />
                  Skills
                </span>
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-4">
              {activeTab === "tasks" && (
                <TasksTabContent onStartWithAgent={handleStartWithAgent} />
              )}
              {activeTab === "skills" && <SkillsTabContent />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
