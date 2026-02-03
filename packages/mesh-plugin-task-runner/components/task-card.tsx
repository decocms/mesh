/**
 * Task Card Component
 *
 * Displays a single task with planning, approval, and execution controls.
 * Can be reused across plugins (task-runner, site-builder, etc.)
 */

import { useState, useEffect } from "react";
import {
  AlertCircle,
  Check,
  MessageChatSquare,
  Edit02,
  Trash01,
} from "@untitledui/icons";
import { toast } from "sonner";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  useUpdateTask,
  useDeleteTask,
  useApprovePlan,
  type Task,
} from "../hooks/use-tasks";

// ============================================================================
// Icons
// ============================================================================

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

const LoadingIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className="animate-spin"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const ListIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

// ============================================================================
// Types
// ============================================================================

export interface TaskCardProps {
  task: Task;
  /** Called when user wants to execute the task with an agent */
  onStartWithAgent: (task: Task) => void;
  /** Whether an agent is currently running on any task */
  hasRunningAgent: boolean;
  /** Workspace path for the task */
  workspacePath?: string;
  /** Function to refetch tasks (for polling during planning) */
  refetchTasks?: () => void;
  /** Function to send a message to the chat */
  sendChatMessage: (text: string) => void;
  /** Whether planning was requested for this task (from external action) */
  initialPlanningRequested?: boolean;
  /** Callback when planning state changes */
  onPlanningStateChange?: (taskId: string, isPending: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

export function TaskCard({
  task,
  onStartWithAgent,
  hasRunningAgent,
  workspacePath,
  refetchTasks,
  sendChatMessage,
  initialPlanningRequested = false,
  onPlanningStateChange,
}: TaskCardProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const approvePlan = useApprovePlan();
  const [showPlan, setShowPlan] = useState(false);
  const [isPlanningRequested, setIsPlanningRequested] = useState(
    initialPlanningRequested,
  );
  const [isSpawning, setIsSpawning] = useState(false);

  // Sync with external planning state
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (initialPlanningRequested && !isPlanningRequested) {
      setIsPlanningRequested(true);
    }
  }, [initialPlanningRequested, isPlanningRequested]);

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
