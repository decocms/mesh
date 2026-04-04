/**
 * PassthroughClient
 *
 * Thin wrapper around GatewayClient that aggregates tools, resources, and prompts
 * from multiple connections. Extends the MCP SDK Client class for backward compatibility.
 */

import type { StreamableMCPProxyClient } from "@/api/routes/proxy";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  CallToolRequest,
  CallToolResult,
  GetPromptRequest,
  GetPromptResult,
  ListPromptsResult,
  ListResourcesResult,
  ListToolsResult,
  ReadResourceRequest,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { GatewayClient, type ClientEntry } from "@decocms/mcp-utils/aggregate";
import type { MeshContext } from "../../core/mesh-context";
import type { ConnectionEntity } from "../../tools/connection/schema";
import { createLazyClient } from "../lazy-client";
import type { VirtualClientOptions } from "./types";

/**
 * Aggregates MCP resources from multiple connections via GatewayClient.
 * Tool/prompt names are namespaced with slugified connection IDs.
 */
export class PassthroughClient extends Client {
  private _gateway: GatewayClient;
  private _connections: Map<string, ConnectionEntity>;

  constructor(
    protected options: VirtualClientOptions,
    protected ctx: MeshContext,
  ) {
    super(
      { name: "virtual-mcp-passthrough", version: "1.0.0" },
      {
        capabilities: {
          tasks: {
            list: {},
            cancel: {},
            requests: {
              tool: {
                call: {},
              },
            },
          },
        },
      },
    );

    this._connections = new Map();
    for (const connection of options.connections) {
      this._connections.set(connection.id, connection);
    }

    // Build VirtualMCP connection lookup for per-client selection
    const vmcpConnMap = new Map(
      options.virtualMcp.connections.map((c) => [c.connection_id, c]),
    );

    // Build ClientEntry record
    const clients: Record<string, ClientEntry> = {};

    for (const connection of options.connections) {
      const vmcpConn = vmcpConnMap.get(connection.id);

      clients[connection.id] = {
        client: () =>
          createLazyClient(
            connection,
            ctx,
            options.superUser ?? false,
            options.mcpListCache,
          ),
        ...(vmcpConn?.selected_tools != null
          ? { tools: vmcpConn.selected_tools }
          : {}),
        ...(vmcpConn?.selected_resources != null
          ? { resources: vmcpConn.selected_resources }
          : {}),
        ...(vmcpConn?.selected_prompts != null
          ? { prompts: vmcpConn.selected_prompts }
          : {}),
      };
    }

    this._gateway = new GatewayClient(clients);
  }

  override async listTools(): Promise<ListToolsResult> {
    const result = await this._gateway.listTools();
    return {
      tools: result.tools.map((tool) => {
        const meta = tool._meta as Record<string, unknown> | undefined;
        const connId = meta?.gatewayClientId as string | undefined;
        const conn = connId ? this._connections.get(connId) : undefined;
        return {
          ...tool,
          _meta: {
            ...meta,
            connectionId: connId ?? "",
            connectionTitle: conn?.title ?? "",
          },
        };
      }),
    };
  }

  override async callTool(
    params: CallToolRequest["params"],
  ): Promise<CallToolResult> {
    return (await this._gateway.callTool(params)) as CallToolResult;
  }

  override async listResources(): Promise<ListResourcesResult> {
    return this._gateway.listResources();
  }

  override async readResource(
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> {
    return this._gateway.readResource(params);
  }

  override async listResourceTemplates() {
    return this._gateway.listResourceTemplates();
  }

  override async listPrompts(): Promise<ListPromptsResult> {
    return this._gateway.listPrompts();
  }

  override async getPrompt(
    params: GetPromptRequest["params"],
  ): Promise<GetPromptResult> {
    return this._gateway.getPrompt(params);
  }

  async callStreamableTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Response> {
    const tools = await this._gateway.listTools();
    const tool = tools.tools.find((t) => t.name === name);
    const clientKey = (tool?._meta as Record<string, unknown> | undefined)
      ?.gatewayClientId as string | undefined;

    if (clientKey) {
      try {
        const client = await this._gateway.getResolvedClient(clientKey);
        if (
          "callStreamableTool" in client &&
          typeof (client as any).callStreamableTool === "function"
        ) {
          return (client as StreamableMCPProxyClient).callStreamableTool(
            name,
            args,
          );
        }
      } catch {
        /* fall through */
      }
    }

    // Fallback: non-streaming
    const result = await this._gateway.callTool({ name, arguments: args });
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this._gateway.close();
  }

  override async close(): Promise<void> {
    await this._gateway.close();
    await super.close();
  }

  override getInstructions(): string | undefined {
    return this.options.virtualMcp.metadata?.instructions ?? undefined;
  }
}
