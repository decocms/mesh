/**
 * PassthroughClient
 *
 * Extends GatewayClient with mesh-specific concerns: connection metadata
 * enrichment on tools, streaming tool calls, and VirtualMCP instructions.
 */

import type { StreamableMCPProxyClient } from "@/api/routes/proxy";
import { GatewayClient, type ClientEntry } from "@decocms/mcp-utils/aggregate";
import type { MeshContext } from "../../core/mesh-context";
import { createLazyClient } from "../lazy-client";
import type { VirtualClientOptions } from "./types";

/**
 * Aggregates MCP resources from multiple connections via GatewayClient.
 * Tool/prompt names are namespaced with slugified connection IDs.
 */
export class PassthroughClient extends GatewayClient {
  constructor(
    protected options: VirtualClientOptions,
    protected ctx: MeshContext,
  ) {
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
  }

  /** @deprecated Use standard callTool instead. */
  async callStreamableTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Response> {
    console.warn(
      `[DEPRECATED] callStreamableTool called — tool: ${name}, org: ${this.ctx.organization?.id ?? "unknown"}, virtualMcp: ${this.options.virtualMcp.id}`,
      { tool: name },
    );
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
