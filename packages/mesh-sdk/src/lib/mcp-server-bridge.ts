import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  CancelTaskRequestSchema,
  CompleteRequestSchema,
  CreateMessageRequestSchema,
  ElicitRequestSchema,
  GetPromptRequestSchema,
  GetTaskPayloadRequestSchema,
  GetTaskRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListRootsRequestSchema,
  ListTasksRequestSchema,
  ListToolsRequestSchema,
  PingRequestSchema,
  ReadResourceRequestSchema,
  SetLevelRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type CancelTaskRequest,
  type CancelTaskResult,
  type CompleteRequest,
  type CompleteResult,
  type CreateMessageRequest,
  type CreateMessageResult,
  type ElicitRequest,
  type ElicitResult,
  type GetPromptRequest,
  type GetPromptResult,
  type GetTaskPayloadRequest,
  type GetTaskPayloadResult,
  type GetTaskRequest,
  type GetTaskResult,
  type ListPromptsResult,
  type ListResourcesResult,
  type ListResourceTemplatesResult,
  type ListRootsRequest,
  type ListRootsResult,
  type ListTasksRequest,
  type ListTasksResult,
  type ListToolsRequest,
  type ListToolsResult,
  type PingRequest,
  type ReadResourceRequest,
  type ReadResourceResult,
  type SetLevelRequest,
  type SubscribeRequest,
  type UnsubscribeRequest,
} from "@modelcontextprotocol/sdk/types.js";

type ServerInfo = {
  name: string;
  version: string;
  instructions?: string;
};

/**
 * Helper to access the Client's request method for generic MCP requests
 */
function makeClientRequest<T>(
  client: Client,
  method: string,
  params?: unknown,
): Promise<T> {
  return (
    client as unknown as {
      request: (req: { method: string; params?: unknown }) => Promise<T>;
    }
  ).request({
    method,
    params,
  }) as Promise<T>;
}

/**
 * Create an MCP Server that proxies requests to a connected Client.
 * The caller is responsible for client lifecycle management.
 */
export function createMcpServerBridge(
  client: Client,
  serverInfo: ServerInfo,
): McpServer {
  // Get instructions from client if available, otherwise use serverInfo
  const instructions = serverInfo.instructions ?? client.getInstructions?.();

  const server = new McpServer(
    { name: serverInfo.name, version: serverInfo.version },
    {
      capabilities: { tools: {}, resources: {}, prompts: {} },
      instructions,
    },
  );

  server.server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest): Promise<ListToolsResult> => {
      return client.listTools();
    },
  );

  server.server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest): Promise<CallToolResult> => {
      return (await client.callTool(request.params)) as CallToolResult;
    },
  );

  server.server.setRequestHandler(
    ListResourcesRequestSchema,
    async (): Promise<ListResourcesResult> => {
      return client.listResources();
    },
  );

  server.server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest): Promise<ReadResourceResult> => {
      return client.readResource(request.params);
    },
  );

  server.server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (): Promise<ListResourceTemplatesResult> => {
      return client.listResourceTemplates();
    },
  );

  server.server.setRequestHandler(
    ListPromptsRequestSchema,
    async (): Promise<ListPromptsResult> => {
      return client.listPrompts();
    },
  );

  server.server.setRequestHandler(
    GetPromptRequestSchema,
    async (request: GetPromptRequest): Promise<GetPromptResult> => {
      return client.getPrompt(request.params);
    },
  );

  // Ping handler - forward to client
  server.server.setRequestHandler(
    PingRequestSchema,
    async (_request: PingRequest) => {
      return makeClientRequest<{ jsonrpc: "2.0"; id: unknown }>(client, "ping");
    },
  );

  // Logging/setLevel handler - forward to client
  server.server.setRequestHandler(
    SetLevelRequestSchema,
    async (request: SetLevelRequest) => {
      return makeClientRequest<{
        jsonrpc: "2.0";
        id: unknown;
        result: unknown;
      }>(client, "logging/setLevel", request.params);
    },
  );

  // Completion/complete handler - forward to client
  server.server.setRequestHandler(
    CompleteRequestSchema,
    async (request: CompleteRequest): Promise<CompleteResult> => {
      return makeClientRequest<CompleteResult>(
        client,
        "completion/complete",
        request.params,
      );
    },
  );

  // Resources/subscribe handler - forward to client
  server.server.setRequestHandler(
    SubscribeRequestSchema,
    async (request: SubscribeRequest) => {
      return makeClientRequest<{
        jsonrpc: "2.0";
        id: unknown;
        result: unknown;
      }>(client, "resources/subscribe", request.params);
    },
  );

  // Resources/unsubscribe handler - forward to client
  server.server.setRequestHandler(
    UnsubscribeRequestSchema,
    async (request: UnsubscribeRequest) => {
      return makeClientRequest<{
        jsonrpc: "2.0";
        id: unknown;
        result: unknown;
      }>(client, "resources/unsubscribe", request.params);
    },
  );

  // Tasks/list handler - forward to client
  server.server.setRequestHandler(
    ListTasksRequestSchema,
    async (_request: ListTasksRequest): Promise<ListTasksResult> => {
      return makeClientRequest<ListTasksResult>(client, "tasks/list");
    },
  );

  // Tasks/get handler - forward to client
  server.server.setRequestHandler(
    GetTaskRequestSchema,
    async (request: GetTaskRequest): Promise<GetTaskResult> => {
      return makeClientRequest<GetTaskResult>(
        client,
        "tasks/get",
        request.params,
      );
    },
  );

  // Tasks/result handler - forward to client
  server.server.setRequestHandler(
    GetTaskPayloadRequestSchema,
    async (request: GetTaskPayloadRequest): Promise<GetTaskPayloadResult> => {
      return makeClientRequest<GetTaskPayloadResult>(
        client,
        "tasks/result",
        request.params,
      );
    },
  );

  // Tasks/cancel handler - forward to client
  server.server.setRequestHandler(
    CancelTaskRequestSchema,
    async (request: CancelTaskRequest): Promise<CancelTaskResult> => {
      return makeClientRequest<CancelTaskResult>(
        client,
        "tasks/cancel",
        request.params,
      );
    },
  );

  // Server→client requests: roots/list
  // These are requests the server makes to the client, so we handle them by making requests to the downstream client
  server.server.setRequestHandler(
    ListRootsRequestSchema,
    async (_request: ListRootsRequest): Promise<ListRootsResult> => {
      return makeClientRequest<ListRootsResult>(client, "roots/list");
    },
  );

  // Server→client requests: sampling/createMessage
  server.server.setRequestHandler(
    CreateMessageRequestSchema,
    async (request: CreateMessageRequest): Promise<CreateMessageResult> => {
      return makeClientRequest<CreateMessageResult>(
        client,
        "sampling/createMessage",
        request.params,
      );
    },
  );

  // Server→client requests: elicitation/create
  server.server.setRequestHandler(
    ElicitRequestSchema,
    async (request: ElicitRequest): Promise<ElicitResult> => {
      return makeClientRequest<ElicitResult>(
        client,
        "elicitation/create",
        request.params,
      );
    },
  );

  // Note: Notification forwarding would require transport-level integration
  // Notifications from the downstream client come through the transport layer
  // and would need to be forwarded through the server's transport.
  // This is left as a future enhancement.

  return server;
}
