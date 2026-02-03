/**
 * Task Runner Hooks
 *
 * React Query hooks for the Task Runner plugin.
 * Uses OBJECT_STORAGE_BINDING to share connections with File Storage.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePluginContext } from "@decocms/bindings/plugins";
import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import { KEYS } from "../lib/query-keys";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract text content from various MCP tool response formats
 * Handles: string, { content: string }, { content: [{ text: string }] }, { text: string }
 */
function extractTextContent(result: unknown): string | null {
  if (typeof result === "string") {
    return result;
  }

  if (typeof result !== "object" || result === null) {
    return null;
  }

  const obj = result as Record<string, unknown>;

  // Handle { content: string }
  if (typeof obj.content === "string") {
    return obj.content;
  }

  // Handle { content: [{ type: 'text', text: string }] } (MCP format)
  if (Array.isArray(obj.content)) {
    const textParts = obj.content
      .filter(
        (item): item is { type: string; text: string } =>
          typeof item === "object" &&
          item !== null &&
          "text" in item &&
          typeof (item as { text: unknown }).text === "string",
      )
      .map((item) => item.text);
    if (textParts.length > 0) {
      return textParts.join("");
    }
  }

  // Handle { text: string }
  if (typeof obj.text === "string") {
    return obj.text;
  }

  return null;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Acceptance criterion for a task
 */
export interface AcceptanceCriterion {
  id: string;
  description: string;
  completed?: boolean;
}

/**
 * Quality gate definition
 */
export interface QualityGate {
  id: string;
  name: string;
  command: string;
  description?: string;
  required: boolean;
  source: "auto" | "manual";
}

/**
 * Result from running a quality gate
 */
export interface QualityGateResult {
  gate: string;
  command: string;
  passed: boolean;
  output: string;
  duration: number;
}

/**
 * Quality gates baseline - tracks verification state and acknowledged failures
 */
export interface QualityGatesBaseline {
  verified: boolean;
  verifiedAt: string;
  allPassed: boolean;
  acknowledged: boolean;
  failingGates: string[];
}

/**
 * Task Plan type
 */
export interface TaskPlan {
  summary: string;
  acceptanceCriteria: Array<{
    id: string;
    description: string;
    verifiable?: boolean;
  }>;
  subtasks: Array<{
    id: string;
    title: string;
    description: string;
    estimatedComplexity?: "trivial" | "simple" | "moderate" | "complex";
    filesToModify?: string[];
  }>;
  risks?: string[];
  estimatedComplexity?: "trivial" | "simple" | "moderate" | "complex";
}

/**
 * Task type for Beads
 */
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: "open" | "in_progress" | "blocked" | "closed";
  priority?: number;
  createdAt?: string;
  updatedAt?: string;
  threadId?: string; // Chat thread ID for this task
  acceptanceCriteria?: AcceptanceCriterion[]; // Verifiable success criteria
  plan?: TaskPlan; // Generated plan before execution
  planStatus?: "draft" | "approved" | "rejected"; // Plan approval status
}

/**
 * Hook to get current workspace (root path from the storage connection)
 * GET_ROOT is an optional tool not in OBJECT_STORAGE_BINDING, so we check for it dynamically
 */
export function useWorkspace() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  return useQuery({
    queryKey: KEYS.workspace,
    queryFn: async () => {
      // Check if GET_ROOT tool is available on this connection
      const hasGetRoot = connection?.tools?.some((t) => t.name === "GET_ROOT");

      if (!hasGetRoot) {
        console.log("[Task Runner] Connection does not have GET_ROOT tool");
        return { workspace: null, hasBeads: false };
      }

      try {
        // Call GET_ROOT to get the storage root path
        // Cast to any since GET_ROOT is not part of the typed binding
        const untypedToolCaller = toolCaller as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ root: string }>;
        const result = await untypedToolCaller("GET_ROOT", {});
        console.log("[Task Runner] GET_ROOT result:", result);
        return {
          workspace: result.root,
          hasBeads: false, // Will be checked separately
        };
      } catch (error) {
        console.error("[Task Runner] GET_ROOT failed:", error);
        return { workspace: null, hasBeads: false };
      }
    },
    enabled: !!connectionId,
  });
}

/**
 * Hook to check if beads is initialized in the workspace
 * This calls LIST_OBJECTS to check for .beads directory
 */
export function useBeadsStatus() {
  const { connectionId, toolCaller } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  return useQuery({
    queryKey: KEYS.beadsStatus,
    queryFn: async () => {
      try {
        // Try to list .beads directory
        const result = await toolCaller("LIST_OBJECTS", {
          prefix: ".beads/",
          maxKeys: 1,
        });
        return {
          initialized:
            result.objects.length > 0 ||
            (result.commonPrefixes?.length ?? 0) > 0,
        };
      } catch {
        return { initialized: false };
      }
    },
    enabled: !!connectionId,
  });
}

/**
 * Hook to list tasks from .beads directory
 * Reads .beads/tasks.json directly using read_file
 */
export function useTasks() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  const hasReadFile = connection?.tools?.some((t) => t.name === "read_file");

  return useQuery({
    queryKey: KEYS.tasks(connectionId ?? ""),
    queryFn: async (): Promise<Task[]> => {
      if (!hasReadFile) {
        console.log("[Task Runner] Connection does not have read_file tool");
        return [];
      }

      try {
        const untypedToolCaller = toolCaller as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ content?: string } | string>;

        const result = await untypedToolCaller("read_file", {
          path: ".beads/tasks.json",
        });

        const content =
          typeof result === "string"
            ? result
            : typeof result === "object" && result.content
              ? result.content
              : null;

        if (!content) {
          console.log("[Task Runner] No tasks file or empty content");
          return [];
        }

        const data = JSON.parse(content) as { tasks: Task[] };
        return data.tasks || [];
      } catch (error) {
        console.error("[Task Runner] Failed to read tasks:", error);
        return [];
      }
    },
    enabled: !!connectionId && hasReadFile,
    staleTime: 0, // Always consider data stale
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

/**
 * Tool call from agent
 */
export interface ToolCall {
  name: string;
  input?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Agent message
 */
export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: string;
}

/**
 * Agent session from AGENT_STATUS
 */
export interface AgentSession {
  sessionId: string;
  id?: string; // Alias
  taskId: string;
  taskTitle: string;
  status: "running" | "completed" | "failed" | "stopped";
  pid?: number;
  startedAt: string;
  completedAt?: string;
  exitCode?: number;
  toolCalls?: ToolCall[];
  toolCallCount?: number;
  messages?: AgentMessage[];
  output?: string; // Raw output from the agent (for error messages)
}

/**
 * Hook to get agent sessions by reading .beads/sessions.json directly
 * (AGENT_STATUS tool is on task-runner MCP, not the storage connection)
 */
export function useAgentSessions() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  // Check if read_file tool is available (from local-fs MCP)
  const hasReadFile = connection?.tools?.some((t) => t.name === "read_file");

  return useQuery({
    queryKey: KEYS.agentSessions(connectionId ?? ""),
    queryFn: async () => {
      if (!toolCaller || !hasReadFile) {
        return { sessions: [], runningCount: 0 };
      }

      try {
        // Read sessions.json file directly using read_file tool
        // Cast to work around typed tool caller
        const untypedToolCaller = toolCaller as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ content?: string }>;
        const result = await untypedToolCaller("read_file", {
          path: ".beads/sessions.json",
        });

        // Parse the result
        const content =
          typeof result === "string"
            ? result
            : (result as { content?: string })?.content;

        if (!content) {
          return { sessions: [], runningCount: 0 };
        }

        // Parse the sessions file - it has { sessions: [...], lastUpdated: ... } structure
        const parsed = JSON.parse(content) as {
          sessions?: Array<AgentSession & { id?: string }>;
          lastUpdated?: string;
        };

        const rawSessions = parsed.sessions || [];
        const sessions = rawSessions.map((s) => ({
          ...s,
          sessionId: s.sessionId || s.id || "",
        }));

        // Sort by startedAt descending (most recent first)
        sessions.sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        );

        const runningSessions = sessions.filter(
          (s) => s.status === "running",
        ).length;

        return {
          sessions,
          runningCount: runningSessions,
        };
      } catch {
        // File might not exist yet
        return { sessions: [], runningCount: 0 };
      }
    },
    enabled: !!connectionId && !!toolCaller && hasReadFile,
    refetchInterval: 5000, // Poll every 5 seconds
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 4000, // Consider data fresh for 4 seconds
  });
}

/**
 * Hook to get detailed session info - uses cached data from useAgentSessions
 * No additional network requests - just filters the parent data
 */
export function useAgentSessionDetail(sessionId: string | null) {
  const { data } = useAgentSessions();

  const session = data?.sessions?.find(
    (s) => s.sessionId === sessionId || s.id === sessionId,
  );

  return {
    data: session || null,
    isLoading: false,
  };
}

// Legacy placeholder for components that still reference useLoopStatus
export function useLoopStatus() {
  const { data } = useAgentSessions();
  const hasRunning = (data?.runningCount ?? 0) > 0;
  const firstRunning = data?.sessions?.find((s) => s.status === "running");

  return useQuery({
    queryKey: KEYS.loopStatusLegacy,
    queryFn: async () => ({
      status: hasRunning ? "running" : "idle",
      currentTask: firstRunning?.taskTitle || null,
      iteration: 0,
      maxIterations: 10,
      totalTokens: 0,
      maxTokens: 100000,
      tasksCompleted:
        data?.sessions
          ?.filter((s) => s.status === "completed")
          .map((s) => s.taskId) || [],
      tasksFailed:
        data?.sessions
          ?.filter((s) => s.status === "failed")
          .map((s) => s.taskId) || [],
      startedAt: firstRunning?.startedAt || null,
      lastActivity: null,
      error: null,
    }),
    enabled: true,
  });
}

export function useStartLoop() {
  return useMutation({
    mutationFn: async (_params?: unknown) => {
      throw new Error("Loop not implemented yet");
    },
  });
}

export function usePauseLoop() {
  return useMutation({
    mutationFn: async () => {
      throw new Error("Loop not implemented yet");
    },
  });
}

export function useStopLoop() {
  return useMutation({
    mutationFn: async () => {
      throw new Error("Loop not implemented yet");
    },
  });
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  path: string;
}

export function useSkills() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  return useQuery({
    queryKey: KEYS.skills(connectionId ?? ""),
    queryFn: async (): Promise<Skill[]> => {
      // Check if SKILLS_LIST tool is available
      const hasSkillsList = connection?.tools?.some(
        (t) => t.name === "SKILLS_LIST",
      );

      if (!hasSkillsList) {
        console.log("[Task Runner] Connection does not have SKILLS_LIST tool");
        return [];
      }

      try {
        const untypedToolCaller = toolCaller as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ skills: Skill[] }>;

        const result = await untypedToolCaller("SKILLS_LIST", {});
        return result.skills;
      } catch (error) {
        console.error("[Task Runner] SKILLS_LIST failed:", error);
        return [];
      }
    },
    enabled: !!connectionId,
  });
}

export function useApplySkill() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (skillId: string) => {
      // Read the skill file to get its content
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );

      if (!hasReadFile) {
        throw new Error("Connection doesn't support read_file");
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content: string } | string>;

      // Read the skill file
      const skillPath = `skills/${skillId}/SKILL.md`;
      const result = await untypedToolCaller("read_file", { path: skillPath });

      // Handle both structured and text responses
      const content =
        typeof result === "string"
          ? result
          : typeof result === "object" && "content" in result
            ? result.content
            : String(result);

      // Create a task based on the skill
      const hasTaskCreate = connection?.tools?.some(
        (t) => t.name === "TASK_CREATE",
      );

      if (!hasTaskCreate) {
        throw new Error("Connection doesn't support TASK_CREATE");
      }

      const createToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ task: Task }>;

      // Extract skill name from content (first heading after frontmatter)
      const nameMatch = content.match(/^#\s+(.+)$/m);
      const skillName = nameMatch?.[1] || skillId;

      const taskResult = await createToolCaller("TASK_CREATE", {
        title: `Apply skill: ${skillName}`,
        description: `Follow the instructions in skills/${skillId}/SKILL.md`,
        priority: 1,
      });

      return taskResult.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.tasks(connectionId ?? ""),
      });
    },
  });
}

export function useSetWorkspace() {
  // No-op for now - workspace is determined by the connection
  return useMutation({
    mutationFn: async (_directory: string) => {
      // Workspace is now determined by the storage connection
      return { success: true };
    },
  });
}

export function useInitBeads() {
  const { toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const hasCreateDir = connection?.tools?.some(
        (t) => t.name === "create_directory",
      );
      const hasWriteFile = connection?.tools?.some(
        (t) => t.name === "write_file",
      );

      if (!hasWriteFile) {
        throw new Error("This storage connection doesn't support write_file.");
      }

      const writeToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;

      // Create .beads directory if we have create_directory
      if (hasCreateDir) {
        try {
          await writeToolCaller("create_directory", { path: ".beads" });
        } catch {
          // Directory might already exist, ignore
        }
      }

      // Create config.json
      const config = {
        version: "1.0.0",
        created: new Date().toISOString(),
      };
      await writeToolCaller("write_file", {
        path: ".beads/config.json",
        content: JSON.stringify(config, null, 2),
      });

      // Create tasks.json if it doesn't exist
      try {
        await writeToolCaller("write_file", {
          path: ".beads/tasks.json",
          content: JSON.stringify({ tasks: [] }, null, 2),
        });
      } catch {
        // File might already exist
      }

      return {
        success: true,
        path: ".beads",
        message: "Beads initialized successfully",
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.beadsStatus });
      queryClient.invalidateQueries({ queryKey: KEYS.workspace });
    },
  });
}

export function useCreateTask() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      title: string;
      description?: string;
      priority?: number;
    }) => {
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );
      const hasWriteFile = connection?.tools?.some(
        (t) => t.name === "write_file",
      );

      if (!hasReadFile || !hasWriteFile) {
        throw new Error(
          "This storage connection doesn't support read_file/write_file.",
        );
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content?: string } | string>;

      const writeToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;

      // Read existing tasks
      let tasksData: { tasks: Task[] } = { tasks: [] };
      try {
        const result = await untypedToolCaller("read_file", {
          path: ".beads/tasks.json",
        });
        const content =
          typeof result === "string"
            ? result
            : typeof result === "object" && result.content
              ? result.content
              : null;
        if (content) {
          tasksData = JSON.parse(content);
        }
      } catch {
        // File doesn't exist yet, will create
      }

      // Create new task
      const newTask: Task = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: params.title,
        description: params.description,
        status: "open",
        priority: params.priority,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      tasksData.tasks.push(newTask);

      // Write back
      await writeToolCaller("write_file", {
        path: ".beads/tasks.json",
        content: JSON.stringify(tasksData, null, 2),
      });

      return newTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.tasks(connectionId ?? ""),
      });
    },
  });
}

export function useUpdateTask() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      title?: string;
      description?: string;
      status?: "open" | "in_progress" | "blocked" | "closed";
      priority?: number;
      threadId?: string;
    }) => {
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );
      const hasWriteFile = connection?.tools?.some(
        (t) => t.name === "write_file",
      );

      if (!hasReadFile || !hasWriteFile) {
        throw new Error(
          "This storage connection doesn't support read_file/write_file.",
        );
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content?: string } | string>;

      const writeToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;

      // Read existing tasks
      const result = await untypedToolCaller("read_file", {
        path: ".beads/tasks.json",
      });
      const content =
        typeof result === "string"
          ? result
          : typeof result === "object" && result.content
            ? result.content
            : null;

      if (!content) {
        throw new Error("Tasks file not found");
      }

      const tasksData = JSON.parse(content) as { tasks: Task[] };
      const taskIndex = tasksData.tasks.findIndex(
        (t) => t.id === params.taskId,
      );

      if (taskIndex === -1) {
        throw new Error(`Task ${params.taskId} not found`);
      }

      const task = tasksData.tasks[taskIndex];
      if (!task) {
        throw new Error(`Task ${params.taskId} not found`);
      }
      if (params.title !== undefined) task.title = params.title;
      if (params.description !== undefined)
        task.description = params.description;
      if (params.status !== undefined) task.status = params.status;
      if (params.priority !== undefined) task.priority = params.priority;
      if (params.threadId !== undefined) task.threadId = params.threadId;
      task.updatedAt = new Date().toISOString();

      tasksData.tasks[taskIndex] = task;

      // Write back
      await writeToolCaller("write_file", {
        path: ".beads/tasks.json",
        content: JSON.stringify(tasksData, null, 2),
      });

      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.tasks(connectionId ?? ""),
      });
    },
  });
}

export function useCloseTasks() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { taskIds: string[] }) => {
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );
      const hasWriteFile = connection?.tools?.some(
        (t) => t.name === "write_file",
      );

      if (!hasReadFile || !hasWriteFile) {
        throw new Error(
          "This storage connection doesn't support read_file/write_file.",
        );
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content?: string } | string>;

      const writeToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;

      // Read existing tasks
      const result = await untypedToolCaller("read_file", {
        path: ".beads/tasks.json",
      });
      const content =
        typeof result === "string"
          ? result
          : typeof result === "object" && result.content
            ? result.content
            : null;

      if (!content) {
        throw new Error("Tasks file not found");
      }

      const tasksData = JSON.parse(content) as { tasks: Task[] };

      // Close matching tasks
      const closedTasks: Task[] = [];
      for (const taskId of params.taskIds) {
        const taskIndex = tasksData.tasks.findIndex((t) => t.id === taskId);
        const task = tasksData.tasks[taskIndex];
        if (taskIndex !== -1 && task) {
          task.status = "closed";
          task.updatedAt = new Date().toISOString();
          closedTasks.push(task);
        }
      }

      // Write back
      await writeToolCaller("write_file", {
        path: ".beads/tasks.json",
        content: JSON.stringify(tasksData, null, 2),
      });

      return closedTasks;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.tasks(connectionId ?? ""),
      });
    },
  });
}

export function useDeleteTask() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { taskId: string }) => {
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );
      const hasWriteFile = connection?.tools?.some(
        (t) => t.name === "write_file",
      );

      if (!hasReadFile || !hasWriteFile) {
        throw new Error(
          "This storage connection doesn't support read_file/write_file.",
        );
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content?: string } | string>;

      const writeToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;

      // Read existing tasks
      const result = await untypedToolCaller("read_file", {
        path: ".beads/tasks.json",
      });
      const content =
        typeof result === "string"
          ? result
          : typeof result === "object" && result.content
            ? result.content
            : null;

      if (!content) {
        throw new Error("Tasks file not found");
      }

      const tasksData = JSON.parse(content) as { tasks: Task[] };
      const initialLength = tasksData.tasks.length;
      tasksData.tasks = tasksData.tasks.filter((t) => t.id !== params.taskId);

      if (tasksData.tasks.length === initialLength) {
        throw new Error(`Task ${params.taskId} not found`);
      }

      // Write back
      await writeToolCaller("write_file", {
        path: ".beads/tasks.json",
        content: JSON.stringify(tasksData, null, 2),
      });

      return { success: true, deletedId: params.taskId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.tasks(connectionId ?? ""),
      });
    },
  });
}

// ============================================================================
// Quality Gates Hooks
// ============================================================================

/**
 * Hook to get quality gates from project config
 */
export function useQualityGates() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const workspaceQuery = useWorkspace();

  return useQuery({
    queryKey: KEYS.qualityGates(connectionId ?? ""),
    queryFn: async (): Promise<QualityGate[]> => {
      // Check if read_file tool is available
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );

      if (!hasReadFile || !workspaceQuery.data?.workspace) {
        return [];
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content?: string } | string>;

      try {
        // Read project config
        const configPath = ".beads/project-config.json";
        const result = await untypedToolCaller("read_file", {
          path: configPath,
        });

        const content =
          typeof result === "string"
            ? result
            : typeof result === "object" && result.content
              ? result.content
              : null;

        if (!content) return [];

        const config = JSON.parse(content) as {
          qualityGates?: QualityGate[];
        };
        return config.qualityGates ?? [];
      } catch {
        // No config file yet
        return [];
      }
    },
    enabled: !!connectionId && !!workspaceQuery.data?.workspace,
  });
}

// Quality gate patterns to detect from package.json scripts
const QUALITY_GATE_PATTERNS: Array<{
  scripts: string[];
  name: string;
  description: string;
}> = [
  {
    scripts: ["check", "typecheck", "type-check", "tsc"],
    name: "Type Check",
    description: "TypeScript type checking",
  },
  {
    scripts: ["lint", "eslint", "oxlint"],
    name: "Lint",
    description: "Code linting",
  },
  {
    scripts: ["test", "test:unit", "vitest", "jest"],
    name: "Test",
    description: "Run tests",
  },
  {
    scripts: ["fmt", "fmt:check", "format", "prettier"],
    name: "Format",
    description: "Code formatting",
  },
];

/**
 * Hook to detect quality gates from package.json
 * Reads package.json directly and finds common scripts
 */
export function useDetectQualityGates() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Check if read_file tool is available
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );

      if (!hasReadFile) {
        throw new Error("This storage connection doesn't support read_file.");
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content?: string } | string>;

      // Try to read package.json first, then deno.json
      let scriptNames: string[] = [];
      let runner = "npm run";
      let configType: "package" | "deno" | null = null;

      // Try package.json
      try {
        const pkgResult = await untypedToolCaller("read_file", {
          path: "package.json",
        });
        const pkgContent = extractTextContent(pkgResult);

        if (pkgContent && !pkgContent.startsWith("Error:")) {
          const pkg = JSON.parse(pkgContent) as {
            scripts?: Record<string, string>;
          };
          if (pkg.scripts) {
            scriptNames = Object.keys(pkg.scripts);
            configType = "package";

            // Detect package manager from lockfiles
            try {
              const bunLock = await untypedToolCaller("read_file", {
                path: "bun.lock",
              });
              const bunContent = extractTextContent(bunLock);
              if (bunContent && !bunContent.startsWith("Error:")) {
                runner = "bun run";
              }
            } catch {
              try {
                const pnpmLock = await untypedToolCaller("read_file", {
                  path: "pnpm-lock.yaml",
                });
                const pnpmContent = extractTextContent(pnpmLock);
                if (pnpmContent && !pnpmContent.startsWith("Error:")) {
                  runner = "pnpm run";
                }
              } catch {
                // Default to npm
              }
            }
          }
        }
      } catch {
        // package.json not found or invalid
      }

      // Try deno.json if package.json didn't work
      if (configType === null) {
        try {
          const denoResult = await untypedToolCaller("read_file", {
            path: "deno.json",
          });
          const denoContent = extractTextContent(denoResult);

          if (denoContent && !denoContent.startsWith("Error:")) {
            const deno = JSON.parse(denoContent) as {
              tasks?: Record<string, string>;
            };
            if (deno.tasks) {
              scriptNames = Object.keys(deno.tasks);
              configType = "deno";
              runner = "deno task";
            }
          }
        } catch {
          // deno.json not found or invalid
        }
      }

      if (scriptNames.length === 0) {
        return { gates: [], saved: false };
      }

      const gates: QualityGate[] = [];

      // Find matching scripts/tasks
      for (const pattern of QUALITY_GATE_PATTERNS) {
        for (const scriptName of pattern.scripts) {
          if (scriptNames.includes(scriptName)) {
            gates.push({
              id: `gate-${scriptName}`,
              name: pattern.name,
              command: `${runner} ${scriptName}`,
              description: pattern.description,
              required: true,
              source: "auto",
            });
            break; // Only add one gate per pattern
          }
        }
      }

      // Save to .beads/project-config.json
      if (gates.length > 0) {
        const hasWriteFile = connection?.tools?.some(
          (t) => t.name === "write_file",
        );

        if (hasWriteFile) {
          const writeToolCaller = toolCaller as unknown as (
            name: string,
            args: Record<string, unknown>,
          ) => Promise<unknown>;

          // Try to read existing config first
          let existingConfig: {
            qualityGates?: QualityGate[];
            completionToken?: string;
            memoryDir?: string;
          } = {};
          try {
            const configResult = await untypedToolCaller("read_file", {
              path: ".beads/project-config.json",
            });
            const configContent = extractTextContent(configResult);
            if (configContent) {
              existingConfig = JSON.parse(configContent);
            }
          } catch {
            // No existing config
          }

          // Merge with existing manual gates
          const manualGates = (existingConfig.qualityGates ?? []).filter(
            (g) => g.source === "manual",
          );

          const config = {
            ...existingConfig,
            qualityGates: [...gates, ...manualGates],
            completionToken:
              existingConfig.completionToken ?? "<promise>COMPLETE</promise>",
            memoryDir: existingConfig.memoryDir ?? "memory",
            lastUpdated: new Date().toISOString(),
          };

          await writeToolCaller("write_file", {
            path: ".beads/project-config.json",
            content: JSON.stringify(config, null, 2),
          });
        }
      }

      return { gates, saved: gates.length > 0 };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.qualityGates(connectionId ?? ""),
      });
    },
  });
}

// ============================================================================
// Quality Gates Baseline Hooks
// ============================================================================

/**
 * Hook to get the quality gates baseline status
 */
export function useQualityGatesBaseline() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const workspaceQuery = useWorkspace();

  return useQuery({
    queryKey: KEYS.qualityGatesBaseline(connectionId ?? ""),
    queryFn: async (): Promise<{
      hasBaseline: boolean;
      baseline?: QualityGatesBaseline;
      canCreateTasks: boolean;
    }> => {
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );

      if (!hasReadFile || !workspaceQuery.data?.workspace) {
        return { hasBaseline: false, canCreateTasks: false };
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content?: string } | string>;

      try {
        const result = await untypedToolCaller("read_file", {
          path: ".beads/project-config.json",
        });

        const content =
          typeof result === "string"
            ? result
            : typeof result === "object" && result.content
              ? result.content
              : null;

        if (!content) {
          return { hasBaseline: false, canCreateTasks: false };
        }

        const config = JSON.parse(content) as {
          qualityGatesBaseline?: QualityGatesBaseline;
        };

        const baseline = config.qualityGatesBaseline;
        const hasBaseline = !!baseline?.verified;
        const canCreateTasks =
          hasBaseline && (baseline.allPassed || baseline.acknowledged);

        return { hasBaseline, baseline, canCreateTasks };
      } catch {
        return { hasBaseline: false, canCreateTasks: false };
      }
    },
    enabled: !!connectionId && !!workspaceQuery.data?.workspace,
  });
}

/**
 * Hook to verify quality gates and establish baseline
 * Uses EXEC tool from local-fs MCP to run gate commands
 */
export function useVerifyQualityGates() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{
      allPassed: boolean;
      results: QualityGateResult[];
      baseline: QualityGatesBaseline;
    }> => {
      const hasExec = connection?.tools?.some((t) => t.name === "EXEC");
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );
      const hasWriteFile = connection?.tools?.some(
        (t) => t.name === "write_file",
      );

      if (!hasExec || !hasReadFile || !hasWriteFile) {
        throw new Error("Quality gates verification not available");
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;

      // Read project config to get quality gates
      let config: { qualityGates?: QualityGate[] } = { qualityGates: [] };
      try {
        const configResult = await untypedToolCaller("read_file", {
          path: ".beads/project-config.json",
        });
        const content = extractTextContent(configResult);
        if (content) {
          config = JSON.parse(content);
        }
      } catch {
        // Config doesn't exist yet, use empty gates
      }

      const gates = config.qualityGates || [];
      const requiredGates = gates.filter((g) => g.required);

      // Run each gate command using EXEC
      const results: QualityGateResult[] = [];
      for (const gate of requiredGates) {
        const start = Date.now();
        try {
          const execResult = (await untypedToolCaller("EXEC", {
            command: gate.command,
            timeout: 120000, // 2 minutes for type checks
          })) as {
            success?: boolean;
            exitCode?: number;
            stdout?: string;
            stderr?: string;
            error?: string;
          };

          // Check success property first, then exitCode
          const passed =
            execResult.success === true ||
            (execResult.success === undefined && execResult.exitCode === 0);

          results.push({
            gate: gate.name,
            command: gate.command,
            passed,
            output: (
              (execResult.stdout || "") +
              (execResult.stderr || "") +
              (execResult.error || "")
            ).slice(-500),
            duration: Date.now() - start,
          });
        } catch (error) {
          results.push({
            gate: gate.name,
            command: gate.command,
            passed: false,
            output: error instanceof Error ? error.message : "Command failed",
            duration: Date.now() - start,
          });
        }
      }

      const allPassed = results.every((r) => r.passed);
      const failingGates = results.filter((r) => !r.passed).map((r) => r.gate);

      // Create baseline
      const baseline: QualityGatesBaseline = {
        verified: true,
        verifiedAt: new Date().toISOString(),
        allPassed,
        acknowledged: false,
        failingGates,
      };

      // Save baseline to config
      const updatedConfig = {
        ...config,
        qualityGatesBaseline: baseline,
      };

      await untypedToolCaller("write_file", {
        path: ".beads/project-config.json",
        content: JSON.stringify(updatedConfig, null, 2),
      });

      return { allPassed, results, baseline };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.qualityGatesBaseline(connectionId ?? ""),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.qualityGates(connectionId ?? ""),
      });
    },
  });
}

/**
 * Hook to acknowledge pre-existing quality gate failures
 * Updates the baseline in project-config.json
 */
export function useAcknowledgeQualityGates() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      acknowledge: boolean,
    ): Promise<{
      success: boolean;
      baseline?: QualityGatesBaseline;
      error?: string;
    }> => {
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );
      const hasWriteFile = connection?.tools?.some(
        (t) => t.name === "write_file",
      );

      if (!hasReadFile || !hasWriteFile) {
        throw new Error("Quality gates acknowledge not available");
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;

      // Read current config
      let config: {
        qualityGates?: QualityGate[];
        qualityGatesBaseline?: QualityGatesBaseline;
      } = {};
      try {
        const configResult = await untypedToolCaller("read_file", {
          path: ".beads/project-config.json",
        });
        const content = extractTextContent(configResult);
        if (content) {
          config = JSON.parse(content);
        }
      } catch {
        return {
          success: false,
          error: "No baseline exists. Run verification first.",
        };
      }

      if (!config.qualityGatesBaseline?.verified) {
        return {
          success: false,
          error: "No baseline exists. Run verification first.",
        };
      }

      // Update baseline with acknowledged flag
      const baseline: QualityGatesBaseline = {
        ...config.qualityGatesBaseline,
        acknowledged: acknowledge,
      };

      const updatedConfig = {
        ...config,
        qualityGatesBaseline: baseline,
      };

      await untypedToolCaller("write_file", {
        path: ".beads/project-config.json",
        content: JSON.stringify(updatedConfig, null, 2),
      });

      return { success: true, baseline };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.qualityGatesBaseline(connectionId ?? ""),
      });
    },
  });
}

// ============================================================================
// Task Planning Hooks
// ============================================================================

/**
 * Hook to generate a plan for a task
 */
export function useTaskPlan() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { taskId: string }) => {
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );
      const hasWriteFile = connection?.tools?.some(
        (t) => t.name === "write_file",
      );

      if (!hasReadFile || !hasWriteFile) {
        throw new Error(
          "This storage connection doesn't support read_file/write_file.",
        );
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content?: string } | string>;

      const writeToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;

      // Read the task
      const tasksResult = await untypedToolCaller("read_file", {
        path: ".beads/tasks.json",
      });

      const tasksContent =
        typeof tasksResult === "string"
          ? tasksResult
          : typeof tasksResult === "object" && tasksResult.content
            ? tasksResult.content
            : null;

      if (!tasksContent) {
        throw new Error("Could not read tasks file");
      }

      const tasksData = JSON.parse(tasksContent) as { tasks: Task[] };
      const task = tasksData.tasks.find((t) => t.id === params.taskId);

      if (!task) {
        throw new Error(`Task not found: ${params.taskId}`);
      }

      // Generate a simple plan
      const plan: TaskPlan = {
        summary: `Implement: ${task.title}`,
        acceptanceCriteria: [
          {
            id: "ac-1",
            description: `The feature "${task.title.slice(0, 50)}" is fully implemented`,
            verifiable: true,
          },
          {
            id: "ac-2",
            description: "All quality gates pass (check, lint, test)",
            verifiable: true,
          },
          {
            id: "ac-3",
            description: "Changes are committed with descriptive message",
            verifiable: true,
          },
        ],
        subtasks: [
          {
            id: "st-1",
            title: "Understand requirements",
            description: "Read task description and relevant code",
            estimatedComplexity: "trivial",
          },
          {
            id: "st-2",
            title: "Implement the change",
            description: task.title,
            estimatedComplexity: "moderate",
          },
          {
            id: "st-3",
            title: "Test and verify",
            description: "Run quality gates and verify acceptance criteria",
            estimatedComplexity: "simple",
          },
        ],
        estimatedComplexity: "moderate",
      };

      // Update task with plan
      const taskIndex = tasksData.tasks.findIndex(
        (t) => t.id === params.taskId,
      );
      tasksData.tasks[taskIndex] = {
        ...task,
        plan,
        planStatus: "draft",
        updatedAt: new Date().toISOString(),
      } as Task;

      await writeToolCaller("write_file", {
        path: ".beads/tasks.json",
        content: JSON.stringify(tasksData, null, 2),
      });

      return { taskId: params.taskId, plan, status: "draft" };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.tasks(connectionId ?? ""),
      });
    },
  });
}

/**
 * Hook to approve/reject a task plan
 */
export function useApprovePlan() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      action: "approve" | "reject";
      modifiedCriteria?: AcceptanceCriterion[];
    }) => {
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );
      const hasWriteFile = connection?.tools?.some(
        (t) => t.name === "write_file",
      );

      if (!hasReadFile || !hasWriteFile) {
        throw new Error(
          "This storage connection doesn't support read_file/write_file.",
        );
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content?: string } | string>;

      const writeToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;

      // Read tasks
      const tasksResult = await untypedToolCaller("read_file", {
        path: ".beads/tasks.json",
      });

      const tasksContent =
        typeof tasksResult === "string"
          ? tasksResult
          : typeof tasksResult === "object" && tasksResult.content
            ? tasksResult.content
            : null;

      if (!tasksContent) {
        throw new Error("Could not read tasks file");
      }

      const tasksData = JSON.parse(tasksContent) as {
        tasks: Array<Task & { plan?: TaskPlan; planStatus?: string }>;
      };
      const taskIndex = tasksData.tasks.findIndex(
        (t) => t.id === params.taskId,
      );

      if (taskIndex === -1) {
        throw new Error(`Task not found: ${params.taskId}`);
      }

      const task = tasksData.tasks[taskIndex];
      if (!task) {
        throw new Error(`Task not found: ${params.taskId}`);
      }

      if (params.action === "approve") {
        task.planStatus = "approved";
        // Copy acceptance criteria from plan to task
        if (task.plan?.acceptanceCriteria) {
          task.acceptanceCriteria =
            params.modifiedCriteria ||
            task.plan.acceptanceCriteria.map((ac) => ({
              id: ac.id,
              description: ac.description,
              completed: false,
            }));
        }
      } else {
        task.planStatus = "rejected";
      }

      task.updatedAt = new Date().toISOString();
      tasksData.tasks[taskIndex] = task;

      await writeToolCaller("write_file", {
        path: ".beads/tasks.json",
        content: JSON.stringify(tasksData, null, 2),
      });

      return {
        success: true,
        taskId: params.taskId,
        planStatus: task.planStatus,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.tasks(connectionId ?? ""),
      });
    },
  });
}

/**
 * Hook to add a custom quality gate
 * Writes directly to .beads/project-config.json
 */
export function useAddQualityGate() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      command: string;
      description?: string;
      required?: boolean;
    }) => {
      const hasReadFile = connection?.tools?.some(
        (t) => t.name === "read_file",
      );
      const hasWriteFile = connection?.tools?.some(
        (t) => t.name === "write_file",
      );

      if (!hasReadFile || !hasWriteFile) {
        throw new Error(
          "This storage connection doesn't support read_file/write_file.",
        );
      }

      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content?: string } | string>;

      const writeToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;

      // Read existing config
      let config: {
        qualityGates?: QualityGate[];
        completionToken?: string;
        memoryDir?: string;
        lastUpdated?: string;
      } = {
        qualityGates: [],
        completionToken: "<promise>COMPLETE</promise>",
        memoryDir: "memory",
      };

      try {
        const configResult = await untypedToolCaller("read_file", {
          path: ".beads/project-config.json",
        });
        const configContent =
          typeof configResult === "string"
            ? configResult
            : typeof configResult === "object" && configResult.content
              ? configResult.content
              : null;
        if (configContent) {
          config = JSON.parse(configContent);
        }
      } catch {
        // No existing config, use defaults
      }

      // Create new gate
      const gate: QualityGate = {
        id: `gate-${Date.now()}`,
        name: params.name,
        command: params.command,
        description: params.description,
        required: params.required ?? true,
        source: "manual",
      };

      config.qualityGates = [...(config.qualityGates ?? []), gate];
      config.lastUpdated = new Date().toISOString();

      await writeToolCaller("write_file", {
        path: ".beads/project-config.json",
        content: JSON.stringify(config, null, 2),
      });

      return { success: true, gate };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.qualityGates(connectionId ?? ""),
      });
    },
  });
}
