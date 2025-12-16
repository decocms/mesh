import { getDb } from "@/database";
import { CredentialVault } from "@/encryption/credential-vault";
import { ConnectionStorage } from "@/storage/connection";
import { Permission } from "@/storage/types";
import {
  ConnectionCreateData,
  ToolDefinition,
} from "@/tools/connection/schema";
import zodToJsonSchema from "zod-to-json-schema";
import { auth } from "./index";
import { fetchToolsFromMCP } from "@/tools/connection/fetch-tools";

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
    // Deco Store
    {
      data: {
        title: "Deco Store",
        description: "Official deco MCP registry with curated integrations",
        connection_type: "HTTP",
        connection_url: "https://api.decocms.com/mcp/registry",
        icon: "https://assets.decocache.com/decocms/00ccf6c3-9e13-4517-83b0-75ab84554bb9/596364c63320075ca58483660156b6d9de9b526e.png",
        app_name: "deco-registry",
        app_id: null,
        connection_token: null,
        connection_headers: null,
        oauth_config: null,
        configuration_state: null,
        configuration_scopes: null,
        metadata: {
          isDefault: true,
          type: "registry",
        },
      },
    },
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
              inputSchema: zodToJsonSchema(
                tool.inputSchema as Parameters<typeof zodToJsonSchema>[0],
              ),
              outputSchema: tool.outputSchema
                ? zodToJsonSchema(
                    tool.outputSchema as Parameters<typeof zodToJsonSchema>[0],
                  )
                : undefined,
              description: tool.description,
            };
          },
        );
      },
      data: {
        title: "Management MCP",
        description: "Management MCP for the organization",
        connection_type: "HTTP",
        connection_url: `${process.env.BASE_URL || "http://localhost:3000"}/mcp`,
        icon: "https://assets.decocache.com/mcp/09e44283-f47d-4046-955f-816d227c626f/app.png",
        app_name: "@deco/management-mcp",
        connection_token: null,
        connection_headers: null,
        oauth_config: null,
        configuration_state: null,
        configuration_scopes: null,
        metadata: {
          isDefault: true,
          type: "self",
        },
      },
    },
  ];
}

/**
 * Create default MCP connections for a new organization
 * This is deferred to run after the Better Auth request completes
 * to avoid deadlocks when issuing tokens
 */
export async function createDefaultOrgConnections(
  organizationId: string,
  createdBy: string,
) {
  try {
    const db = getDb();
    const vault = new CredentialVault(process.env.ENCRYPTION_KEY || "");
    const connectionStorage = new ConnectionStorage(db, vault);
    const defaultOrgMcps = getDefaultOrgMcps();
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
            connection_url: mcpConfig.data.connection_url,
            connection_token: mcpConfig.data.connection_token,
            connection_headers: mcpConfig.data.connection_headers,
          }).catch(() => null));
        await connectionStorage.create({
          ...mcpConfig.data,
          tools,
          organization_id: organizationId,
          created_by: createdBy,
          connection_token: mcpConfig.data.connection_token ?? connectionToken,
        });
      }),
    );
  } catch (err) {
    console.error("Error creating default MCP connections:", err);
  }
}
