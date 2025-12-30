import {
  getWellKnownCommunityRegistryConnection,
  getWellKnownSelfConnection,
} from "@/core/well-known-mcp";
import { getDb } from "@/database";
import { CredentialVault } from "@/encryption/credential-vault";
import { ConnectionStorage } from "@/storage/connection";
import { GatewayStorage } from "@/storage/gateway";
import { Permission } from "@/storage/types";
import { fetchToolsFromMCP } from "@/tools/connection/fetch-tools";
import {
  ConnectionCreateData,
  ToolDefinition,
} from "@/tools/connection/schema";
import { z } from "zod";
import { auth } from "./index";

interface MCPCreationSpec {
  data: ConnectionCreateData;
  permissions?: Permission;
  /** Lazy getter for tools to avoid circular dependency issues at module load time */
  getTools?: () => Promise<ToolDefinition[]> | ToolDefinition[];
}

/**
 * Get default MCP connections to create for new organizations.
 * This is a function (not a constant) to defer evaluation of ALL_TOOLS
 * until after all modules have finished initializing.
 */
function getDefaultOrgMcps(): MCPCreationSpec[] {
  return [
    {
      permissions: {
        self: ["*"],
      },
      // FIXME (@mcandeia) Tools are not being updated when new tools are added to the system
      // so once installed tools remains static, should have a way to update them.
      getTools: async () => {
        // Dynamically import ALL_TOOLS at call time to avoid circular dependency
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ALL_TOOLS } = await import("@/tools");
        return ALL_TOOLS.map(
          (tool: {
            name: string;
            inputSchema: unknown;
            outputSchema?: unknown;
            description?: string;
          }) => {
            return {
              name: tool.name,
              inputSchema: z.toJSONSchema(
                tool.inputSchema as Parameters<typeof z.toJSONSchema>[0],
              ),
              outputSchema: tool.outputSchema
                ? z.toJSONSchema(
                    tool.outputSchema as Parameters<typeof z.toJSONSchema>[0],
                  )
                : undefined,
              description: tool.description,
            };
          },
        );
      },
      data: getWellKnownSelfConnection(
        process.env.BASE_URL || "http://localhost:3000",
      ),
    },
    // MCP Registry (Community Registry) - public registry, no permissions required
    {
      data: getWellKnownCommunityRegistryConnection(),
    },
  ];
}

/**
 * Create default MCP connections for a new organization
 * This is deferred to run after the Better Auth request completes
 * to avoid deadlocks when issuing tokens
 */
export async function seedOrgDb(organizationId: string, createdBy: string) {
  try {
    const database = getDb();
    const vault = new CredentialVault(process.env.ENCRYPTION_KEY || "");
    const connectionStorage = new ConnectionStorage(database.db, vault);
    const gatewayStorage = new GatewayStorage(database.db);
    const defaultOrgMcps = getDefaultOrgMcps();

    // Create default connections and collect their IDs
    const createdConnectionIds: string[] = [];

    await Promise.all(
      defaultOrgMcps.map(async (mcpConfig) => {
        let connectionToken: string | null = null;
        if (mcpConfig.permissions) {
          const key = await auth.api.createApiKey({
            body: {
              name: `${mcpConfig.data.app_name ?? crypto.randomUUID()}-mcp`,
              userId: createdBy,
              permissions: mcpConfig.permissions,
              rateLimitEnabled: false,
              metadata: {
                organization: { id: organizationId },
                purpose: "default-org-connections",
              },
            },
          });
          connectionToken = key?.key;
        }
        // Get tools either from the lazy getter or by fetching from MCP
        const tools =
          (await mcpConfig.getTools?.()) ??
          (await fetchToolsFromMCP({
            id: "pending",
            title: mcpConfig.data.title,
            connection_type: mcpConfig.data.connection_type,
            connection_url: mcpConfig.data.connection_url,
            connection_token: mcpConfig.data.connection_token,
            connection_headers: mcpConfig.data.connection_headers,
          }).catch(() => null));

        const connectionId = mcpConfig.data.id
          ? `${organizationId}_${mcpConfig.data.id}`
          : undefined;

        const connection = await connectionStorage.create({
          ...mcpConfig.data,
          id: connectionId,
          tools,
          organization_id: organizationId,
          created_by: createdBy,
          connection_token: mcpConfig.data.connection_token ?? connectionToken,
        });

        createdConnectionIds.push(connection.id);
      }),
    );

    // Create default gateway with exclusion mode
    // This gateway excludes nothing by default (empty connections list with exclusion = include all)
    await gatewayStorage.create(organizationId, createdBy, {
      title: "Default Gateway",
      description: "Auto-created gateway for organization",
      toolSelectionStrategy: "passthrough",
      toolSelectionMode: "exclusion",
      status: "active",
      isDefault: true,
      connections: createdConnectionIds.map((c) => ({ connectionId: c })),
    });
  } catch (err) {
    console.error("Error creating default MCP connections:", err);
  }
}
