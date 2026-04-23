/**
 * call-vm-tool — wrapper around `mcpClient.callTool` that surfaces
 * MCP-protocol errors as thrown exceptions.
 *
 * The MCP TypeScript SDK does NOT throw when a tool handler throws on the
 * server side. Instead it returns a successful Promise resolving to
 * `{ isError: true, content: [{ type: "text", text: "<msg>" }] }`. Naively
 * `.catch()`-ing the promise misses every server-side failure — which is
 * how VM_START bootstrap failures (bad GitHub token, clone refused, etc.)
 * were silently being swallowed and the UI hung on "Booting…" forever.
 *
 * Use this helper for any VM-related callTool so the failure path is
 * uniform and surfaceable.
 */

interface MinimalMcpClient {
  callTool: (params: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<unknown>;
}

interface McpToolResult {
  isError?: boolean;
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
}

/**
 * Calls an MCP tool and throws an `Error` whose `.message` is the
 * server-reported failure text whenever the response carries
 * `isError: true`. Returns the raw `CallToolResult` on success so the
 * caller can read `structuredContent` / `content` as usual.
 */
export async function callVmTool(
  client: MinimalMcpClient,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as McpToolResult;
  if (result.isError) {
    const message =
      result.content?.[0]?.text ?? `Tool ${name} failed without a message`;
    throw new Error(message);
  }
  return result;
}
