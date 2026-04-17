/**
 * Automation Hooks
 *
 * React hooks for fetching and mutating automations via MCP tools.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useMCPClient,
  useProjectContext,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { KEYS } from "../lib/query-keys";

// ============================================================================
// Trigger List Hook
// ============================================================================

export interface TriggerParamSchema {
  type: string;
  enum?: string[];
  description?: string;
}

export interface TriggerDefinition {
  type: string;
  description: string;
  paramsSchema: Record<string, TriggerParamSchema>;
}

/**
 * Raw trigger format from MCP servers (e.g. GitHub MCP uses `params` array)
 */
interface RawTriggerDefinition {
  type: string;
  description: string;
  paramsSchema?: Record<string, TriggerParamSchema>;
  params?:
    | Array<{
        name: string;
        type: string;
        description?: string;
        enum?: string[];
        required?: boolean;
      }>
    | Record<string, TriggerParamSchema>;
}

/**
 * Normalize trigger definitions from different MCP server formats.
 * Some servers return `paramsSchema` as a Record (per binding spec),
 * others return `params` as an array (e.g. GitHub MCP).
 */
function normalizeTrigger(raw: RawTriggerDefinition): TriggerDefinition {
  if (raw.paramsSchema && typeof raw.paramsSchema === "object") {
    return raw as TriggerDefinition;
  }

  const paramsSchema: Record<string, TriggerParamSchema> = {};

  if (Array.isArray(raw.params)) {
    for (const p of raw.params) {
      paramsSchema[p.name] = {
        type: p.type,
        description: p.description,
        enum: p.enum,
      };
    }
  } else if (raw.params && typeof raw.params === "object") {
    Object.assign(paramsSchema, raw.params);
  }

  return {
    type: raw.type,
    description: raw.description,
    paramsSchema,
  };
}

export function useTriggerList(connectionId: string | undefined) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: connectionId ?? SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useQuery({
    queryKey: KEYS.toolCall(connectionId ?? "", "TRIGGER_LIST", ""),
    queryFn: async () => {
      const result = (await client.callTool({
        name: "TRIGGER_LIST",
        arguments: {},
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ?? result) as {
        triggers: RawTriggerDefinition[];
      };
      return payload.triggers.map(normalizeTrigger);
    },
    enabled: !!connectionId,
    staleTime: 30_000,
  });
}

// ============================================================================
// Types
// ============================================================================

export interface AutomationListItem {
  id: string;
  name: string;
  active: boolean;
  created_by: string;
  created_at: string;
  trigger_count: number;
  agent: { id: string } | null;
  nearest_next_run_at: string | null;
}

export interface AutomationTrigger {
  id: string;
  type: "cron" | "event";
  cron_expression: string | null;
  connection_id: string | null;
  event_type: string | null;
  params: Record<string, string> | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface AutomationDetail {
  id: string;
  name: string;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  agent: { id: string };
  messages: unknown[];
  models: {
    credentialId: string;
    thinking: { id: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  temperature: number;
  triggers: AutomationTrigger[];
}

// ============================================================================
// List Hook
// ============================================================================

type AutomationListOutput = { automations: AutomationListItem[] };

export function useAutomationsList(virtualMcpId?: string | null) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useQuery({
    queryKey: KEYS.automations(org.id, virtualMcpId),
    queryFn: async () => {
      const args: Record<string, unknown> =
        virtualMcpId !== undefined ? { virtual_mcp_id: virtualMcpId } : {};
      const result = (await client.callTool({
        name: "AUTOMATION_LIST",
        arguments: args,
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ??
        result) as AutomationListOutput;
      return payload.automations;
    },
    staleTime: 10_000,
  });
}

// ============================================================================
// Detail Hook
// ============================================================================

type AutomationGetOutput = { automation: AutomationDetail | null };

export function useAutomationDetail(id: string) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useQuery({
    queryKey: KEYS.automation(org.id, id),
    queryFn: async () => {
      const result = (await client.callTool({
        name: "AUTOMATION_GET",
        arguments: { id },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ??
        result) as AutomationGetOutput;
      return payload.automation;
    },
    enabled: !!id,
    staleTime: 10_000,
  });
}

// ============================================================================
// Helpers
// ============================================================================

export function buildDefaultAutomationInput(virtualMcpId?: string) {
  return {
    name: "New Automation",
    agent: virtualMcpId ? { id: virtualMcpId } : undefined,
    messages: [],
    models: { credentialId: "", thinking: { id: "" } },
    temperature: 0.5,
    active: true,
    virtual_mcp_id: virtualMcpId,
  };
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useAutomationCreate() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const result = (await client.callTool({
        name: "AUTOMATION_CREATE",
        arguments: input,
      })) as { structuredContent?: unknown };
      return (result.structuredContent ?? result) as {
        id: string;
        name: string;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.automationsAll(org.id),
      });
    },
  });
}

export function useAutomationUpdate() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const result = (await client.callTool({
        name: "AUTOMATION_UPDATE",
        arguments: input,
      })) as { structuredContent?: unknown };
      const parsed = (result.structuredContent ?? result) as { id: string };
      return parsed;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.automationsAll(org.id),
      });
      if (typeof variables.id === "string") {
        queryClient.invalidateQueries({
          queryKey: KEYS.automation(org.id, variables.id),
        });
      }
    },
  });
}

export function useAutomationDelete() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = (await client.callTool({
        name: "AUTOMATION_DELETE",
        arguments: { id },
      })) as { structuredContent?: unknown };
      return (result.structuredContent ?? result) as { success: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.automationsAll(org.id),
      });
    },
  });
}

export function useAutomationTriggerAdd() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const result = (await client.callTool({
        name: "AUTOMATION_TRIGGER_ADD",
        arguments: input,
      })) as {
        structuredContent?: unknown;
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
      if (result.isError) {
        const message = result.content?.[0]?.text ?? "Failed to add trigger";
        throw new Error(message);
      }
      const data = (result.structuredContent ?? result) as {
        id: string;
        automation_id: string;
      };
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.automationsAll(org.id),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.automation(org.id, data.automation_id),
      });
    },
  });
}

export function useAutomationTriggerRemove() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      trigger_id: string;
      automation_id: string;
    }) => {
      const result = (await client.callTool({
        name: "AUTOMATION_TRIGGER_REMOVE",
        arguments: { trigger_id: input.trigger_id },
      })) as { structuredContent?: unknown };
      return (result.structuredContent ?? result) as { success: boolean };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.automationsAll(org.id),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.automation(org.id, variables.automation_id),
      });
    },
  });
}
