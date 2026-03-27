/**
 * Remote Organization Routes
 *
 * Allows a local studio instance to connect to a remote studio's organization,
 * syncing MCP connections so local Claude Code can access remote org tools.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { MeshContext } from "../../core/mesh-context";
import { auth } from "../../auth";
import { getDb } from "../../database";
import { CredentialVault } from "../../encryption/credential-vault";
import { ConnectionStorage } from "../../storage/connection";
import { getSettings } from "../../settings";
import { seedOrgDb } from "../../auth/org";
import { generatePrefixedId } from "@/shared/utils/generate-id";

type Variables = {
  meshContext: MeshContext;
};

const app = new Hono<{ Variables: Variables }>();

// ── Schemas ─────────────────────────────────────────────────────────────

const ConnectSchema = z.object({
  remoteUrl: z.string().url(),
  apiKey: z.string().min(1),
});

// ── Helpers ─────────────────────────────────────────────────────────────

interface RemoteConnectionInfo {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  app_name: string | null;
  connection_type: string;
  bindings: string[] | null;
  status: string;
}

interface RemoteVirtualMCPInfo {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  status: string;
  connections: Array<{
    connection_id: string;
    selected_tools: string[] | null;
    selected_resources: string[] | null;
    selected_prompts: string[] | null;
  }>;
}

/**
 * Send a raw MCP JSON-RPC request to a remote endpoint via plain fetch.
 * This avoids the MCP SDK's StreamableHTTPClientTransport which has issues
 * with some server configurations (sessions, CORS, etc).
 */
async function mcpCall(
  url: string,
  apiKey: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params: params ?? {},
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(
      `[remote-org] ${method} to ${url} failed: ${response.status} ${text.slice(0, 500)}`,
    );
    throw new Error(
      `Remote studio returned ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  // Handle SSE response (some MCP servers respond with text/event-stream)
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    // Parse SSE events, find the last JSON-RPC response
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.result) return parsed.result;
        } catch {
          // Not JSON, skip
        }
      }
    }
    throw new Error("No valid response in SSE stream");
  }

  // Handle JSON response
  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message ?? "MCP call failed");
  }
  return json.result;
}

/**
 * Fetch connections from remote studio via MCP self endpoint.
 * The ORGANIZATION_GET call validates the API key and gets org info.
 * The COLLECTION_CONNECTIONS_LIST call gets the connection list.
 * Both go through /mcp/self which accepts API key Bearer auth.
 */
async function fetchRemoteConnections(
  remoteUrl: string,
  apiKey: string,
): Promise<{
  connections: RemoteConnectionInfo[];
  virtualMcps: RemoteVirtualMCPInfo[];
  orgName: string;
  orgSlug: string;
  orgId: string;
}> {
  const selfUrl = `${remoteUrl}/mcp/self`;

  // Fetch connections — this also validates the API key
  const connectionsResult = (await mcpCall(selfUrl, apiKey, "tools/call", {
    name: "COLLECTION_CONNECTIONS_LIST",
    arguments: {},
  })) as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };

  if (connectionsResult.isError) {
    const errText = connectionsResult.content?.find(
      (c) => c.type === "text",
    )?.text;
    throw new Error(errText ?? "Failed to list connections");
  }

  const textContent = connectionsResult.content?.find((c) => c.type === "text");
  if (!textContent?.text) {
    throw new Error("Empty response from remote studio");
  }

  const data = JSON.parse(textContent.text);
  const items = (data.items ?? []) as Array<Record<string, unknown>>;

  // Extract org info: get org ID from connections, then look up name via ORGANIZATION_LIST
  let orgName = "Remote Org";
  let orgSlug = "remote-org";
  let orgId = "";
  if (items.length > 0) {
    orgId = (items[0]!.organization_id as string) ?? "";
  }

  // Get org name/slug via ORGANIZATION_LIST (works without active org context)
  try {
    const orgListResult = (await mcpCall(selfUrl, apiKey, "tools/call", {
      name: "ORGANIZATION_LIST",
      arguments: {},
    })) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    if (!orgListResult.isError) {
      const orgListText = orgListResult.content?.find((c) => c.type === "text");
      if (orgListText?.text) {
        const orgListData = JSON.parse(orgListText.text);
        const orgs = orgListData.organizations ?? [];
        // Match by org ID from connections, or use first org
        const matchedOrg = orgId
          ? orgs.find((o: { id?: string }) => o.id === orgId)
          : orgs[0];
        if (matchedOrg) {
          orgName = matchedOrg.name ?? orgName;
          orgSlug = matchedOrg.slug ?? orgSlug;
          orgId = matchedOrg.id ?? orgId;
        }
      }
    }
  } catch {
    // Non-fatal — fall back to defaults
  }

  // Fetch virtual MCPs (agents)
  let virtualMcps: RemoteVirtualMCPInfo[] = [];
  try {
    const vmcpResult = (await mcpCall(selfUrl, apiKey, "tools/call", {
      name: "COLLECTION_VIRTUAL_MCP_LIST",
      arguments: {},
    })) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    if (!vmcpResult.isError) {
      const vmcpText = vmcpResult.content?.find((c) => c.type === "text");
      if (vmcpText?.text) {
        const vmcpData = JSON.parse(vmcpText.text);
        virtualMcps = (vmcpData.items ?? []).map(
          (v: Record<string, unknown>): RemoteVirtualMCPInfo => ({
            id: v.id as string,
            title: v.title as string,
            description: (v.description as string | null) ?? null,
            icon: (v.icon as string | null) ?? null,
            status: (v.status as string) ?? "active",
            connections: (v.connections as Array<Record<string, unknown>>).map(
              (c) => ({
                connection_id: c.connection_id as string,
                selected_tools: (c.selected_tools as string[] | null) ?? null,
                selected_resources:
                  (c.selected_resources as string[] | null) ?? null,
                selected_prompts:
                  (c.selected_prompts as string[] | null) ?? null,
              }),
            ),
          }),
        );
      }
    }
  } catch {
    // Non-fatal
  }

  return {
    virtualMcps,
    connections: items.map(
      (item): RemoteConnectionInfo => ({
        id: item.id as string,
        title: item.title as string,
        description: (item.description as string | null) ?? null,
        icon: (item.icon as string | null) ?? null,
        app_name: (item.app_name as string | null) ?? null,
        connection_type: (item.connection_type as string) ?? "HTTP",
        bindings: (item.bindings as string[] | null) ?? null,
        status: (item.status as string) ?? "active",
      }),
    ),
    orgName,
    orgSlug,
    orgId,
  };
}

// ── Routes ──────────────────────────────────────────────────────────────

/**
 * POST /api/remote-org/connect
 *
 * Validates the remote API key, creates a local shadow org,
 * and syncs remote connections as local HTTP proxy connections.
 */
app.post("/connect", async (c) => {
  const ctx = c.get("meshContext");
  if (!ctx.auth.user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const body = ConnectSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.message }, 400);
  }

  const { remoteUrl, apiKey } = body.data;
  const normalizedUrl = remoteUrl.replace(/\/+$/, "");

  // 1. Validate API key and fetch remote connections
  let remote;
  try {
    remote = await fetchRemoteConnections(normalizedUrl, apiKey);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to connect to remote studio";
    return c.json({ error: `Connection failed: ${message}` }, 400);
  }

  // 2. Create local shadow organization
  const localSlug = `remote-${remote.orgSlug}`;
  let orgResult;
  try {
    orgResult = await auth.api.createOrganization({
      body: {
        name: `${remote.orgName} (Remote)`,
        slug: localSlug,
        userId: ctx.auth.user.id,
        metadata: {
          remote: true,
          remoteUrl: normalizedUrl,
          remoteOrgId: remote.orgId,
          remoteOrgSlug: remote.orgSlug,
          remoteOrgName: remote.orgName,
        },
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create organization";
    return c.json({ error: message }, 400);
  }

  if (!orgResult) {
    return c.json({ error: "Failed to create organization" }, 500);
  }

  const localOrgId = orgResult.id;

  // 3. Seed default connections (self MCP, registries)
  await seedOrgDb(localOrgId, ctx.auth.user.id);

  // 4. Sync remote connections as local HTTP connections
  const database = getDb();
  const vault = new CredentialVault(getSettings().encryptionKey);
  const connectionStorage = new ConnectionStorage(database.db, vault);

  // Filter out self-MCP and registry connections — we only want user connections
  const userConnections = remote.connections.filter(
    (conn) =>
      !conn.id.endsWith("_self") &&
      !conn.id.includes("_registry") &&
      !conn.id.includes("_community") &&
      conn.status === "active",
  );

  // Map remote connection ID → local connection ID (needed for virtual MCP aggregations)
  const remoteToLocalConnId = new Map<string, string>();

  let syncedCount = 0;
  for (const remoteConn of userConnections) {
    try {
      const localConnId = generatePrefixedId("conn");
      remoteToLocalConnId.set(remoteConn.id, localConnId);
      await connectionStorage.create({
        id: localConnId,
        organization_id: localOrgId,
        created_by: ctx.auth.user.id,
        title: remoteConn.title,
        description: remoteConn.description,
        icon: remoteConn.icon,
        app_name: remoteConn.app_name,
        connection_type: "HTTP",
        connection_url: `${normalizedUrl}/mcp/${remoteConn.id}`,
        connection_token: apiKey,
        bindings: remoteConn.bindings,
        status: "active",
        metadata: {
          remote: true,
          remoteConnectionId: remoteConn.id,
          remoteUrl: normalizedUrl,
          syncedAt: new Date().toISOString(),
        },
      });
      syncedCount++;
    } catch (err) {
      console.error(`Failed to sync remote connection ${remoteConn.id}:`, err);
    }
  }

  // 5. Sync virtual MCPs (agents) from remote
  const { VirtualMCPStorage } = await import("../../storage/virtual");
  const virtualMcpStorage = new VirtualMCPStorage(database.db);

  for (const remoteVmcp of remote.virtualMcps) {
    if (remoteVmcp.status !== "active") continue;

    // Map remote connection IDs to local ones
    const localConnections = remoteVmcp.connections
      .map((c) => {
        const localId = remoteToLocalConnId.get(c.connection_id);
        if (!localId) return null;
        return {
          connection_id: localId,
          selected_tools: c.selected_tools,
          selected_resources: c.selected_resources,
          selected_prompts: c.selected_prompts,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    try {
      await virtualMcpStorage.create(localOrgId, ctx.auth.user.id, {
        title: remoteVmcp.title,
        description: remoteVmcp.description,
        icon: remoteVmcp.icon,
        status: "active",
        pinned: false,
        connections: localConnections,
        metadata: {
          remote: true,
          remoteVirtualMcpId: remoteVmcp.id,
        },
      });
    } catch (err) {
      console.error(`Failed to sync virtual MCP ${remoteVmcp.id}:`, err);
    }
  }

  // 6. Set as active org
  try {
    await auth.api.setActiveOrganization({
      body: { organizationId: localOrgId },
      headers: c.req.raw.headers,
    });
  } catch {
    // Non-critical if this fails
  }

  return c.json({
    orgSlug: orgResult!.slug ?? localSlug,
    orgId: localOrgId,
    orgName: remote.orgName,
    connectionCount: syncedCount,
  });
});

/**
 * POST /api/remote-org/:orgId/sync
 *
 * Re-syncs connections from the remote studio for an existing remote org.
 */
app.post("/:orgId/sync", async (c) => {
  const ctx = c.get("meshContext");
  if (!ctx.auth.user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const orgId = c.req.param("orgId");

  // Get org metadata to find remote URL and API key
  const database = getDb();
  const vault = new CredentialVault(getSettings().encryptionKey);
  const connectionStorage = new ConnectionStorage(database.db, vault);

  // Find an existing remote connection to get the API key
  const { items: existingConnections } = await connectionStorage.list(orgId);
  const remoteConnection = existingConnections.find(
    (conn) =>
      conn.metadata &&
      typeof conn.metadata === "object" &&
      "remote" in conn.metadata &&
      conn.metadata.remote === true,
  );

  if (!remoteConnection) {
    return c.json({ error: "Not a remote organization" }, 400);
  }

  const metadata = remoteConnection.metadata as {
    remoteUrl: string;
    remoteConnectionId: string;
  };
  const remoteUrl = metadata.remoteUrl;

  // We need the decrypted API key from any remote connection's token
  const apiKey = remoteConnection.connection_token;
  if (!apiKey || !remoteUrl) {
    return c.json({ error: "Missing remote connection credentials" }, 400);
  }

  // Fetch current remote connections
  let remote;
  try {
    remote = await fetchRemoteConnections(remoteUrl, apiKey);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to connect to remote studio";
    return c.json({ error: `Sync failed: ${message}` }, 400);
  }

  // Build map of existing remote connections by remoteConnectionId
  const existingByRemoteId = new Map<string, (typeof existingConnections)[0]>();
  for (const conn of existingConnections) {
    const meta = conn.metadata as { remoteConnectionId?: string } | null;
    if (meta?.remoteConnectionId) {
      existingByRemoteId.set(meta.remoteConnectionId, conn);
    }
  }

  const userConnections = remote.connections.filter(
    (conn) =>
      !conn.id.endsWith("_self") &&
      !conn.id.includes("_registry") &&
      !conn.id.includes("_community") &&
      conn.status === "active",
  );

  let added = 0;
  let updated = 0;

  for (const remoteConn of userConnections) {
    const existing = existingByRemoteId.get(remoteConn.id);
    if (existing) {
      // Update title, description, icon, bindings
      await connectionStorage.update(existing.id, {
        title: remoteConn.title,
        description: remoteConn.description,
        icon: remoteConn.icon,
        app_name: remoteConn.app_name,
        bindings: remoteConn.bindings,
        metadata: {
          remote: true,
          remoteConnectionId: remoteConn.id,
          remoteUrl,
          syncedAt: new Date().toISOString(),
        },
      });
      existingByRemoteId.delete(remoteConn.id);
      updated++;
    } else {
      await connectionStorage.create({
        id: generatePrefixedId("conn"),
        organization_id: orgId,
        created_by: ctx.auth.user.id,
        title: remoteConn.title,
        description: remoteConn.description,
        icon: remoteConn.icon,
        app_name: remoteConn.app_name,
        connection_type: "HTTP",
        connection_url: `${remoteUrl}/mcp/${remoteConn.id}`,
        connection_token: apiKey,
        bindings: remoteConn.bindings,
        status: "active",
        metadata: {
          remote: true,
          remoteConnectionId: remoteConn.id,
          remoteUrl,
          syncedAt: new Date().toISOString(),
        },
      });
      added++;
    }
  }

  // Remove connections that no longer exist on remote
  let removed = 0;
  for (const [, orphan] of existingByRemoteId) {
    await connectionStorage.delete(orphan.id);
    removed++;
  }

  return c.json({ added, updated, removed });
});

/**
 * DELETE /api/remote-org/:orgId
 *
 * Disconnects a remote org by deleting the local shadow org.
 */
app.delete("/:orgId", async (c) => {
  const ctx = c.get("meshContext");
  if (!ctx.auth.user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const orgId = c.req.param("orgId");

  try {
    await auth.api.deleteOrganization({
      body: { organizationId: orgId },
      headers: c.req.raw.headers,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete organization";
    return c.json({ error: message }, 400);
  }

  return c.json({ success: true });
});

export default app;
