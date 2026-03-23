/**
 * Shared utility for creating a workspace (project) with an auto-attached agent.
 *
 * Extracts the agent+project creation logic previously inline in agents-list.tsx
 * so it can be reused by CreateWorkspaceDialog and other creation flows.
 */

import type { DefaultAgentSpec } from "@/constants/default-agents";
import { writeSelectedVirtualMcpId } from "@/web/components/chat/store/local-storage";
import { generateSlug } from "@/web/lib/slug";
import { unwrapToolResult } from "@/web/lib/unwrap-tool-result";
import type { ProjectLocator } from "@decocms/mesh-sdk";
import type { ProjectUI } from "@/storage/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectionEntry {
  connection_id: string;
  selected_tools: null;
  selected_resources: null;
  selected_prompts: null;
}

export interface OAuthConnection {
  id: string;
  title: string;
  icon?: string;
}

interface CreateWorkspaceOpts {
  spec: DefaultAgentSpec;
  workspaceType: string | null;
  workspaceName?: string;
  org: { id: string; slug: string };
  /** MCP client bound to SELF_MCP_ALIAS_ID */
  client: {
    callTool: (args: {
      name: string;
      arguments: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  connectionActions: {
    create: {
      mutateAsync: (data: Record<string, unknown>) => Promise<unknown>;
    };
  };
  virtualMCPActions: {
    create: {
      mutateAsync: (data: Record<string, unknown>) => Promise<unknown>;
    };
    update: {
      mutateAsync: (data: {
        id: string;
        data: Record<string, unknown>;
      }) => Promise<unknown>;
    };
  };
  installByAppName: (
    appName: string,
  ) => Promise<
    | { id: string; connection: { title?: string; icon?: string | null } }
    | undefined
  >;
  /** Existing virtual MCPs to check for duplicates */
  existingVirtualMcps?: Array<{
    id: string;
    title: string;
    metadata?: Record<string, unknown> | null;
    connections?: unknown[];
  }>;
}

interface CreateWorkspaceResult {
  projectSlug: string;
  agentId: string;
  oauthConnections: OAuthConnection[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConnectionEntry(connectionId: string): ConnectionEntry {
  return {
    connection_id: connectionId,
    selected_tools: null,
    selected_resources: null,
    selected_prompts: null,
  };
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function createWorkspaceWithAgent(
  opts: CreateWorkspaceOpts,
): Promise<CreateWorkspaceResult> {
  const {
    spec,
    workspaceType,
    workspaceName,
    org,
    client,
    connectionActions,
    virtualMCPActions,
    installByAppName,
    existingVirtualMcps = [],
  } = opts;

  const name = workspaceName ?? spec.title;
  const entries: ConnectionEntry[] = [];
  const oauthConnections: OAuthConnection[] = [];

  // 1. Install connections (mcpUrl + requiredApps)
  if (spec.mcpUrl) {
    const created = await connectionActions.create.mutateAsync({
      title: spec.connectionTitle ?? spec.title,
      connection_type: "HTTP",
      connection_url: spec.mcpUrl,
    });
    const conn = created as {
      id?: string;
      title?: string;
      icon?: string | null;
    } | null;
    if (conn?.id) {
      entries.push(makeConnectionEntry(conn.id));
      if (spec.needsOAuth) {
        oauthConnections.push({
          id: conn.id,
          title: conn.title ?? spec.title,
          icon: conn.icon ?? undefined,
        });
      }
    }
  }

  for (const appName of spec.requiredApps) {
    const result = await installByAppName(appName);
    if (result) {
      entries.push(makeConnectionEntry(result.id));
      oauthConnections.push({
        id: result.id,
        title: result.connection.title ?? appName,
        icon: result.connection.icon ?? undefined,
      });
    }
  }

  // 2. Create or find the agent (Virtual MCP)
  let agentId: string;
  const existing = existingVirtualMcps.find((a) => a.title === spec.title);

  if (existing) {
    agentId = existing.id;
    // Wire connections if agent has none
    if (
      entries.length > 0 &&
      (!existing.connections || existing.connections.length === 0)
    ) {
      await virtualMCPActions.update.mutateAsync({
        id: existing.id,
        data: { connections: entries },
      });
    }
  } else {
    const created = (await virtualMCPActions.create.mutateAsync({
      title: spec.title,
      description: spec.description,
      icon: spec.icon,
      status: "active",
      metadata: {
        instructions: spec.instructions,
        ice_breakers: spec.iceBreakers,
        required_apps: spec.requiredApps,
      },
      connections: entries,
    })) as { id: string } | null;

    if (!created?.id) {
      throw new Error("Failed to create agent");
    }
    agentId = created.id;
  }

  // 3. Create the project with workspaceType
  const slug = generateSlug(name);
  const ui: ProjectUI = {
    banner: null,
    bannerColor: null,
    icon: null,
    themeColor: null,
    workspaceType,
  };

  const projectResult = await client.callTool({
    name: "PROJECT_CREATE",
    arguments: {
      organizationId: org.id,
      slug,
      name,
      description: spec.description || null,
      enabledPlugins: [],
      ui,
    },
  });
  const payload = unwrapToolResult<{ project: { id: string } }>(projectResult);
  const projectId = payload.project.id;

  // 4. Add connections to the project
  for (const conn of entries) {
    await client.callTool({
      name: "PROJECT_CONNECTION_ADD",
      arguments: { projectId, connectionId: conn.connection_id },
    });
  }

  // 5. Store projectSlug in agent metadata
  await virtualMCPActions.update.mutateAsync({
    id: agentId,
    data: {
      metadata: {
        ...(existing?.metadata ?? {}),
        projectSlug: slug,
      },
    },
  });

  // 6. Write selected agent to localStorage for the new workspace
  const targetLocator: ProjectLocator = `${org.slug}/${slug}`;
  writeSelectedVirtualMcpId(targetLocator, agentId);

  return { projectSlug: slug, agentId, oauthConnections };
}
