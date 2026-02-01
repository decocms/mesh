/**
 * Task Runner Hooks
 *
 * React Query hooks for the Task Runner plugin.
 * Uses OBJECT_STORAGE_BINDING to share connections with File Storage.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePluginContext } from "@decocms/bindings/plugins";
import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import { QUERY_KEYS } from "../lib/query-keys";

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
}

/**
 * Hook to get current workspace (root path from the storage connection)
 * GET_ROOT is an optional tool not in OBJECT_STORAGE_BINDING, so we check for it dynamically
 */
export function useWorkspace() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  return useQuery({
    queryKey: QUERY_KEYS.workspace,
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
        const untypedToolCaller = toolCaller as (
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
    queryKey: QUERY_KEYS.beadsStatus,
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
 * Reads the beads tasks.json file to get task list
 */
export function useTasks() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  return useQuery({
    queryKey: QUERY_KEYS.tasks(connectionId ?? ""),
    queryFn: async (): Promise<Task[]> => {
      // Check if TASK_LIST tool is available
      const hasTaskList = connection?.tools?.some(
        (t) => t.name === "TASK_LIST",
      );

      if (!hasTaskList) {
        console.log("[Task Runner] Connection does not have TASK_LIST tool");
        return [];
      }

      try {
        const untypedToolCaller = toolCaller as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ tasks: Task[] }>;

        const result = await untypedToolCaller("TASK_LIST", { status: "all" });
        console.log("[Task Runner] TASK_LIST result:", result);

        // Handle different response formats
        if (Array.isArray(result)) {
          return result;
        }
        if (result && typeof result === "object" && "tasks" in result) {
          return result.tasks;
        }
        return [];
      } catch (error) {
        console.error("[Task Runner] TASK_LIST failed:", error);
        return [];
      }
    },
    enabled: !!connectionId,
    staleTime: 0, // Always consider data stale
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

// Placeholder exports for components that still reference these
export function useLoopStatus() {
  return useQuery({
    queryKey: ["task-runner", "loop-status"],
    queryFn: async () => ({
      status: "idle",
      currentTask: null,
      iteration: 0,
      maxIterations: 10,
      totalTokens: 0,
      maxTokens: 100000,
      tasksCompleted: [],
      tasksFailed: [],
      startedAt: null,
      lastActivity: null,
      error: null,
    }),
    enabled: false,
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
    queryKey: QUERY_KEYS.skills(connectionId ?? ""),
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
        const untypedToolCaller = toolCaller as (
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

      const untypedToolCaller = toolCaller as (
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

      const createToolCaller = toolCaller as (
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
        queryKey: QUERY_KEYS.tasks(connectionId ?? ""),
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
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Check if BEADS_INIT tool is available
      const hasBeadsInit = connection?.tools?.some(
        (t) => t.name === "BEADS_INIT",
      );

      if (!hasBeadsInit) {
        throw new Error(
          "This storage connection doesn't support BEADS_INIT. Use a local-fs MCP.",
        );
      }

      // Call BEADS_INIT to create .beads directory
      const untypedToolCaller = toolCaller as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ success: boolean; path: string; message: string }>;

      const result = await untypedToolCaller("BEADS_INIT", {});

      if (!result.success) {
        throw new Error("Failed to initialize Beads");
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.beadsStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.workspace });
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
      // Check if TASK_CREATE tool is available
      const hasTaskCreate = connection?.tools?.some(
        (t) => t.name === "TASK_CREATE",
      );

      if (!hasTaskCreate) {
        throw new Error(
          "This storage connection doesn't support TASK_CREATE. Use a local-fs MCP.",
        );
      }

      const untypedToolCaller = toolCaller as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ task: Task }>;

      const result = await untypedToolCaller("TASK_CREATE", params);
      return result.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.tasks(connectionId ?? ""),
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
      // Check if TASK_UPDATE tool is available
      const hasTaskUpdate = connection?.tools?.some(
        (t) => t.name === "TASK_UPDATE",
      );

      if (!hasTaskUpdate) {
        throw new Error(
          "This storage connection doesn't support TASK_UPDATE. Use a local-fs MCP.",
        );
      }

      const untypedToolCaller = toolCaller as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ task: Task }>;

      const result = await untypedToolCaller("TASK_UPDATE", {
        id: params.taskId,
        title: params.title,
        description: params.description,
        status: params.status,
        priority: params.priority,
        threadId: params.threadId,
      });
      return result.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.tasks(connectionId ?? ""),
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
      // Check if TASK_UPDATE tool is available
      const hasTaskUpdate = connection?.tools?.some(
        (t) => t.name === "TASK_UPDATE",
      );

      if (!hasTaskUpdate) {
        throw new Error(
          "This storage connection doesn't support TASK_UPDATE. Use a local-fs MCP.",
        );
      }

      const untypedToolCaller = toolCaller as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ task: Task }>;

      // Close each task
      const results = await Promise.all(
        params.taskIds.map((id) =>
          untypedToolCaller("TASK_UPDATE", { id, status: "closed" }),
        ),
      );
      return results.map((r) => r.task);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.tasks(connectionId ?? ""),
      });
    },
  });
}
