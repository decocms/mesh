/**
 * PassthroughClient
 *
 * Extends GatewayClient with mesh-specific concerns: connection metadata
 * enrichment on tools, streaming tool calls, and VirtualMCP instructions.
 */

import type { StreamableMCPProxyClient } from "@/api/routes/proxy";
import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { GatewayClient, type ClientEntry } from "@decocms/mcp-utils/aggregate";
import type { MeshContext } from "../../core/mesh-context";
import type { ConnectionEntity } from "../../tools/connection/schema";
import { createLazyClient } from "../lazy-client";
import type { VirtualClientOptions } from "./types";

/**
 * Aggregates MCP resources from multiple connections via GatewayClient.
 * Tool/prompt names are namespaced with slugified connection IDs.
 */
export class PassthroughClient extends GatewayClient {
  private _connections: Map<string, ConnectionEntity>;

  constructor(
    protected options: VirtualClientOptions,
    protected ctx: MeshContext,
  ) {
    const connections = new Map<string, ConnectionEntity>();
    for (const connection of options.connections) {
      connections.set(connection.id, connection);
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

    super(clients, {
      clientInfo: { name: "virtual-mcp-passthrough", version: "1.0.0" },
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
    });

    this._connections = connections;
  }

  override async listTools(): Promise<ListToolsResult> {
    const result = await super.listTools();
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

  async callStreamableTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Response> {
    const tools = await super.listTools();
    const tool = tools.tools.find((t) => t.name === name);
    const clientKey = (tool?._meta as Record<string, unknown> | undefined)
      ?.gatewayClientId as string | undefined;

    if (clientKey) {
      try {
        const client = await this.getResolvedClient(clientKey);
        if (
          "callStreamableTool" in client &&
          typeof (client as any).callStreamableTool === "function"
        ) {
          // Strip namespace prefix — tool names are "slug_originalName"
          const sep = name.indexOf("_");
          const originalName = sep !== -1 ? name.slice(sep + 1) : name;
          return (client as StreamableMCPProxyClient).callStreamableTool(
            originalName,
            args,
          );
        }
      } catch {
        /* fall through */
      }
    }

    // Fallback: non-streaming
    const result = await this.callTool({ name, arguments: args });
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  override getInstructions(): string | undefined {
    return this.options.virtualMcp.metadata?.instructions ?? undefined;
  }
}
