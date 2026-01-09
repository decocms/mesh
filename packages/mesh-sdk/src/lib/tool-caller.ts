export const UNKNOWN_CONNECTION_ID = "UNKNOWN_CONNECTION_ID";

const parseSSEResponseAsJson = async (response: Response) => {
  /**
   * example:
   * 'event: message\ndata: {"result":{"content":[{"type":"text","text":"{\\"organizations\\":[{\\"id\\":\\"1\\",\\"name\\":\\"Organization 1\\",\\"slug\\":\\"organization-1\\",\\"createdAt\\":\\"2025-11-03T18:12:46.700Z\\"}]}"}],"structuredContent":{"organizations":[{"id":"1","name":"Organization 1","slug":"organization-1","createdAt":"2025-11-03T18:12:46.700Z"}]}},"jsonrpc":"2.0","id":1}\n\n'
   */
  const raw = await response.text();
  const data = raw.split("\n").find((line) => line.startsWith("data: "));

  if (!data) {
    throw new Error("No data received from the server");
  }

  const json = JSON.parse(data.replace("data: ", ""));

  return json;
};

/**
 * Type for a generic tool caller function
 */
export type ToolCaller<TArgs = unknown, TOutput = unknown> = (
  toolName: string,
  args: TArgs,
) => Promise<TOutput>;

/**
 * Create a unified tool caller
 *
 * - If connectionId is provided: routes to /mcp/:connectionId (connection-specific tools)
 * - If connectionId is omitted/null: routes to /mcp (mesh API tools)
 *
 * This abstracts the routing logic so hooks don't need to know if they're
 * calling mesh tools or connection-specific tools.
 */
export function createToolCaller<TArgs = unknown, TOutput = unknown>(
  connectionId?: string,
): ToolCaller<TArgs, TOutput> {
  if (connectionId === UNKNOWN_CONNECTION_ID) {
    return (async () => {}) as unknown as ToolCaller<TArgs, TOutput>;
  }

  const endpoint = connectionId ? `/mcp/${connectionId}` : "/mcp";

  return async (toolName: string, args: TArgs): Promise<TOutput> => {
    const response = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      }),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json =
      response.headers.get("Content-Type") === "application/json"
        ? await response.json()
        : await parseSSEResponseAsJson(response);

    if (json.result?.isError) {
      throw new Error(json.result.content?.[0]?.text || "Tool call failed");
    }

    return json.result?.structuredContent || json.result;
  };
}
