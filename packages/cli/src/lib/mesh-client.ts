/**
 * Mesh Client for CLI
 *
 * Connects to the Mesh and calls tools, including discovering LLM connections.
 */

import {
  readMeshSession,
  setMeshOrganization,
  type MeshSession,
} from "./mesh-session.js";

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
}

interface ToolCallResult {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface ConnectionTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface Connection {
  id: string;
  title: string;
  type?: string;
  bindings?: string[];
  tools?: ConnectionTool[];
}

export interface AgentConnection extends Connection {
  /** Full tool definitions fetched from the connection */
  fullTools: ConnectionTool[];
  /** System prompt if any */
  systemPrompt?: string;
}

/**
 * Gateway entity (called "Agent" in UI)
 */
export interface Gateway {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  tool_selection_mode?: string;
  connections?: Array<{ connection_id: string }>;
}

/**
 * Build headers with authentication and organization context
 */
function buildHeaders(session: MeshSession): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${session.token}`,
  };
  if (session.organizationId) {
    headers["x-organization-id"] = session.organizationId;
  }
  return headers;
}

/**
 * Call a tool on the Mesh's management endpoint (/mcp)
 * If an organization is selected, uses the org-scoped endpoint
 */
export async function callMeshTool<T = unknown>(
  session: MeshSession,
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  // Always use /mcp for management tools - organization is passed via header
  const mcpPath = "/mcp";

  // Build headers with organization context if available
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${session.token}`,
  };
  if (session.organizationId) {
    headers["x-organization-id"] = session.organizationId;
  }

  const response = await fetch(`${session.meshUrl}${mcpPath}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mesh API error (${response.status}): ${text}`);
  }

  const contentType = response.headers.get("Content-Type") || "";
  let json: {
    result?: ToolCallResult;
    error?: { message: string; code?: number };
  };

  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const lines = text.split("\n");
    const dataLines = lines.filter((line) => line.startsWith("data: "));
    const lastData = dataLines[dataLines.length - 1];
    if (!lastData) {
      throw new Error("Empty SSE response");
    }
    json = JSON.parse(lastData.slice(6));
  } else {
    json = await response.json();
  }

  if (json.error) {
    throw new Error(`Tool error: ${json.error.message}`);
  }

  if (json.result?.structuredContent) {
    return json.result.structuredContent as T;
  }

  const content = json.result?.content;
  if (content && content.length > 0) {
    const textItem = content.find((c) => c.type === "text" || c.text);
    if (textItem?.text) {
      try {
        return JSON.parse(textItem.text) as T;
      } catch {
        return { text: textItem.text } as T;
      }
    }
  }

  return null as T;
}

/**
 * Call a tool on a specific connection
 */
export async function callConnectionTool<T = unknown>(
  session: MeshSession,
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${session.meshUrl}/mcp/${connectionId}`, {
    method: "POST",
    headers: buildHeaders(session),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Connection tool error (${response.status}): ${text}`);
  }

  const contentType = response.headers.get("Content-Type") || "";
  let json: {
    result?: ToolCallResult;
    error?: { message: string; code?: number };
  };

  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const lines = text.split("\n");
    const dataLines = lines.filter((line) => line.startsWith("data: "));
    const lastData = dataLines[dataLines.length - 1];
    if (!lastData) {
      throw new Error("Empty SSE response");
    }
    json = JSON.parse(lastData.slice(6));
  } else {
    json = await response.json();
  }

  if (json.error) {
    throw new Error(`Tool error: ${json.error.message}`);
  }

  if (json.result?.structuredContent) {
    return json.result.structuredContent as T;
  }

  const content = json.result?.content;
  if (content && content.length > 0) {
    const textItem = content.find((c) => c.type === "text" || c.text);
    if (textItem?.text) {
      try {
        return JSON.parse(textItem.text) as T;
      } catch {
        return { text: textItem.text } as T;
      }
    }
  }

  return null as T;
}

/**
 * Call a tool on a gateway (agent)
 */
export async function callGatewayTool<T = unknown>(
  session: MeshSession,
  gatewayId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const requestBody = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args,
    },
  };

  const response = await fetch(`${session.meshUrl}/mcp/gateway/${gatewayId}`, {
    method: "POST",
    headers: buildHeaders(session),
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway tool error (${response.status}): ${text}`);
  }

  const contentType = response.headers.get("Content-Type") || "";
  let json: {
    result?: ToolCallResult;
    error?: { message: string; code?: number };
  };

  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const lines = text.split("\n");
    const dataLines = lines.filter((line) => line.startsWith("data: "));
    const lastData = dataLines[dataLines.length - 1];
    if (!lastData) {
      throw new Error("Empty SSE response");
    }
    json = JSON.parse(lastData.slice(6));
  } else {
    json = await response.json();
  }

  if (json.error) {
    throw new Error(`Tool error: ${json.error.message}`);
  }

  if (json.result?.structuredContent) {
    return json.result.structuredContent as T;
  }

  const content = json.result?.content;
  if (content && content.length > 0) {
    const textItem = content.find((c) => c.type === "text" || c.text);
    if (textItem?.text) {
      try {
        return JSON.parse(textItem.text) as T;
      } catch {
        return { text: textItem.text } as T;
      }
    }
  }

  return null as T;
}

/**
 * List all connections in the Mesh
 */
export async function listConnections(
  session: MeshSession,
): Promise<Connection[]> {
  try {
    const result = await callMeshTool<{ items?: Connection[] }>(
      session,
      "COLLECTION_CONNECTIONS_LIST",
      {},
    );
    return result?.items || [];
  } catch {
    return [];
  }
}

/**
 * Find a connection that has LLM tools (LLM_DO_GENERATE)
 */
export async function findLLMConnection(
  session: MeshSession,
): Promise<Connection | null> {
  const connections = await listConnections(session);

  for (const conn of connections) {
    // Check if connection has LLM tools
    if (conn.tools?.some((t) => t.name === "LLM_DO_GENERATE")) {
      return conn;
    }

    // Check bindings
    if (
      conn.bindings?.includes("LLMS") ||
      conn.bindings?.includes("LANGUAGE_MODEL_BINDING")
    ) {
      return conn;
    }
  }

  // Fallback: try each connection
  for (const conn of connections) {
    try {
      // Try to list tools on this connection
      const toolsResponse = await fetch(`${session.meshUrl}/mcp/${conn.id}`, {
        method: "POST",
        headers: buildHeaders(session),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });

      if (toolsResponse.ok) {
        const data = await toolsResponse.json();
        const tools = data.result?.tools || [];
        if (tools.some((t: { name: string }) => t.name === "LLM_DO_GENERATE")) {
          return conn;
        }
      }
    } catch {
      // Continue to next connection
    }
  }

  return null;
}

/**
 * Get full tool list for a connection
 */
export async function getConnectionTools(
  session: MeshSession,
  connectionId: string,
): Promise<ConnectionTool[]> {
  try {
    const response = await fetch(`${session.meshUrl}/mcp/${connectionId}`, {
      method: "POST",
      headers: buildHeaders(session),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.result?.tools || [];
  } catch {
    return [];
  }
}

/**
 * Get system prompt for a connection (if available)
 */
export async function getConnectionPrompts(
  session: MeshSession,
  connectionId: string,
): Promise<string | undefined> {
  try {
    const response = await fetch(`${session.meshUrl}/mcp/${connectionId}`, {
      method: "POST",
      headers: buildHeaders(session),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "prompts/list",
        params: {},
      }),
    });

    if (!response.ok) {
      return undefined;
    }

    const data = await response.json();
    const prompts = data.result?.prompts || [];

    // Look for a system prompt
    const systemPrompt = prompts.find(
      (p: { name: string }) =>
        p.name === "system" ||
        p.name === "SYSTEM" ||
        p.name.toLowerCase().includes("system"),
    );

    if (systemPrompt) {
      // Fetch the prompt content
      const promptResponse = await fetch(
        `${session.meshUrl}/mcp/${connectionId}`,
        {
          method: "POST",
          headers: buildHeaders(session),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "prompts/get",
            params: { name: systemPrompt.name },
          }),
        },
      );

      if (promptResponse.ok) {
        const promptData = await promptResponse.json();
        const messages = promptData.result?.messages || [];
        if (messages.length > 0) {
          return messages
            .map((m: { content: { text: string } }) => m.content?.text || "")
            .join("\n");
        }
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Agent info combining gateway metadata with tools
 */
export interface Agent {
  id: string;
  name: string; // derived from gateway.title
  description?: string | null;
  status: string;
  tools: ConnectionTool[];
}

/**
 * List all gateways (agents) with their tools
 */
export async function listAgents(session: MeshSession): Promise<Agent[]> {
  const gateways = await listGateways(session);
  const agents: Agent[] = [];

  for (const gateway of gateways) {
    if (gateway.status !== "active") {
      continue;
    }

    // Fetch tools from the gateway endpoint
    try {
      const url = `${session.meshUrl}/mcp/gateway/${gateway.id}`;
      const response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(session),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const tools = data.result?.tools || [];
        agents.push({
          id: gateway.id,
          name: gateway.title,
          description: gateway.description,
          status: gateway.status,
          tools,
        });
      }
    } catch {
      // Skip gateways that fail to respond
    }
  }

  return agents;
}

/**
 * List gateways (agents) in the organization
 */
export async function listGateways(session: MeshSession): Promise<Gateway[]> {
  try {
    const result = await callMeshTool<{ items?: Gateway[] }>(
      session,
      "COLLECTION_GATEWAY_LIST",
      {},
    );
    return result?.items || [];
  } catch {
    return [];
  }
}

/**
 * List organizations the user has access to
 */
export async function listOrganizations(
  session: MeshSession,
): Promise<Organization[]> {
  try {
    const result = await callMeshTool<{ organizations?: Organization[] }>(
      session,
      "ORGANIZATION_LIST",
      {},
    );
    return result?.organizations || [];
  } catch {
    return [];
  }
}

/**
 * Find an LLM-capable gateway (agent) that can be used for reasoning
 * Returns the agent with LLM_DO_GENERATE capability
 */
export async function findLLMGateway(
  session: MeshSession,
): Promise<Agent | null> {
  const agents = await listAgents(session);

  for (const agent of agents) {
    const hasLLM = agent.tools.some((t) => t.name === "LLM_DO_GENERATE");
    if (hasLLM) {
      return agent;
    }
  }

  return null;
}

/**
 * Convert simple messages to the LanguageModelPrompt format
 */
function toLanguageModelPrompt(
  messages: Array<{ role: string; content: string }>,
): Array<{
  role: string;
  content: string | Array<{ type: "text"; text: string }>;
}> {
  return messages.map((msg) => {
    if (msg.role === "system") {
      // System messages have string content
      return { role: "system", content: msg.content };
    }
    // User and assistant messages have array content
    return {
      role: msg.role,
      content: [{ type: "text" as const, text: msg.content }],
    };
  });
}

/**
 * Extract text from LLM response content
 */
function extractTextFromResponse(result: unknown): string {
  if (!result || typeof result !== "object") {
    return JSON.stringify(result);
  }

  const r = result as Record<string, unknown>;

  // Check for content array (LanguageModelGenerateOutputSchema format)
  if (Array.isArray(r.content)) {
    const textParts = r.content
      .filter(
        (part: unknown) =>
          typeof part === "object" &&
          part !== null &&
          (part as Record<string, unknown>).type === "text",
      )
      .map((part: unknown) => (part as { text: string }).text);
    if (textParts.length > 0) {
      return textParts.join("");
    }
  }

  // Fallback to legacy formats
  if (typeof r.text === "string") return r.text;
  if (typeof r.content === "string") return r.content;
  if (
    r.response &&
    typeof r.response === "object" &&
    typeof (r.response as Record<string, unknown>).text === "string"
  ) {
    return (r.response as { text: string }).text;
  }

  return JSON.stringify(result);
}

/**
 * Generate text using an LLM connection
 */
export async function generateText(
  session: MeshSession,
  connectionId: string,
  messages: Array<{ role: string; content: string }>,
  model?: string,
): Promise<string> {
  const result = await callConnectionTool<unknown>(
    session,
    connectionId,
    "LLM_DO_GENERATE",
    {
      modelId: model || "anthropic/claude-sonnet-4",
      callOptions: {
        prompt: toLanguageModelPrompt(messages),
      },
    },
  );

  return extractTextFromResponse(result);
}

/**
 * Generate text using an LLM via a gateway (agent)
 */
export async function generateTextViaGateway(
  session: MeshSession,
  gatewayId: string,
  messages: Array<{ role: string; content: string }>,
  model?: string,
): Promise<string> {
  const result = await callGatewayTool<unknown>(
    session,
    gatewayId,
    "LLM_DO_GENERATE",
    {
      modelId: model || "anthropic/claude-sonnet-4",
      callOptions: {
        prompt: toLanguageModelPrompt(messages),
      },
    },
  );

  return extractTextFromResponse(result);
}

/**
 * Tool definition format for LLM
 */
export interface LLMTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

/**
 * Tool call from LLM response
 */
export interface ToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Callback for tool execution events
 */
export type ToolExecutionCallback = (event: ToolExecutionEvent) => void;

export type ToolExecutionEvent =
  | { type: "text"; text: string }
  | { type: "tool-call-start"; toolName: string; toolCallId: string }
  | { type: "tool-call-args"; toolName: string; args: Record<string, unknown> }
  | {
      type: "tool-result";
      toolName: string;
      result: unknown;
      isError?: boolean;
    }
  | { type: "done" };

/**
 * Parse tool calls from LLM response content
 */
function parseToolCalls(content: unknown[]): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  for (const part of content) {
    if (
      typeof part === "object" &&
      part !== null &&
      (part as Record<string, unknown>).type === "tool-call"
    ) {
      const tc = part as {
        toolCallId?: string;
        toolName?: string;
        input?: string;
      };
      if (tc.toolName) {
        let args: Record<string, unknown> = {};
        if (tc.input) {
          try {
            args = JSON.parse(tc.input);
          } catch {
            args = { input: tc.input };
          }
        }
        toolCalls.push({
          toolCallId: tc.toolCallId || `tc_${Date.now()}`,
          toolName: tc.toolName,
          args,
        });
      }
    }
  }

  return toolCalls;
}

/**
 * Local tool executor type - used for tools that run locally instead of via gateway
 */
export type LocalToolExecutor = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<{ success: boolean; result?: unknown; error?: string }>;

/**
 * Generate text with tool execution loop via gateway
 * Handles multiple rounds of tool calls until the model is done
 * @param localToolExecutor - Optional executor for local tools
 * @param localToolNames - Set of tool names that should be executed locally
 */
export async function generateWithToolsViaGateway(
  session: MeshSession,
  gatewayId: string,
  initialMessages: Array<{ role: string; content: string }>,
  tools: LLMTool[],
  model: string | undefined,
  onEvent: ToolExecutionCallback,
  maxIterations = 10,
  localToolExecutor?: LocalToolExecutor,
  localToolNames?: Set<string>,
): Promise<string> {
  // Convert tools to LLM format
  const llmTools = tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description || "",
    parameters: tool.inputSchema || { type: "object", properties: {} },
  }));

  // Build message history with proper format
  const messageHistory = toLanguageModelPrompt(initialMessages);
  let fullText = "";
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    // Call LLM with tools
    const result = await callGatewayTool<{
      content?: unknown[];
      finishReason?: string;
    }>(session, gatewayId, "LLM_DO_GENERATE", {
      modelId: model || "anthropic/claude-sonnet-4",
      callOptions: {
        prompt: messageHistory,
        tools: llmTools,
        toolChoice: { type: "auto" },
      },
    });

    const content = result?.content || [];

    // Extract text parts
    for (const part of content) {
      if (
        typeof part === "object" &&
        part !== null &&
        (part as Record<string, unknown>).type === "text"
      ) {
        const text = (part as { text: string }).text;
        fullText += text;
        onEvent({ type: "text", text });
      }
    }

    // Check for tool calls
    const toolCalls = parseToolCalls(content);

    if (toolCalls.length === 0) {
      // No tool calls, we're done
      break;
    }

    // Execute tool calls
    const toolResults: Array<{
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError?: boolean;
    }> = [];

    for (const tc of toolCalls) {
      onEvent({
        type: "tool-call-start",
        toolName: tc.toolName,
        toolCallId: tc.toolCallId,
      });
      onEvent({
        type: "tool-call-args",
        toolName: tc.toolName,
        args: tc.args,
      });

      try {
        let toolResult: unknown;
        let isError = false;

        // Check if this is a local tool
        if (localToolExecutor && localToolNames?.has(tc.toolName)) {
          const localResult = await localToolExecutor(tc.toolName, tc.args);
          if (localResult.success) {
            toolResult = localResult.result;
          } else {
            toolResult = { error: localResult.error };
            isError = true;
          }
        } else {
          // Execute the tool via the gateway
          toolResult = await callGatewayTool<unknown>(
            session,
            gatewayId,
            tc.toolName,
            tc.args,
          );
        }

        onEvent({
          type: "tool-result",
          toolName: tc.toolName,
          result: toolResult,
          isError,
        });

        toolResults.push({
          type: "tool-result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          result: toolResult,
          isError,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        onEvent({
          type: "tool-result",
          toolName: tc.toolName,
          result: { error: errorMessage },
          isError: true,
        });

        toolResults.push({
          type: "tool-result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          result: { error: errorMessage },
          isError: true,
        });
      }
    }

    // Add assistant message with tool calls to history
    messageHistory.push({
      role: "assistant",
      content: content.map((part) => {
        if (
          typeof part === "object" &&
          part !== null &&
          (part as Record<string, unknown>).type === "tool-call"
        ) {
          const tc = part as {
            toolCallId?: string;
            toolName?: string;
            input?: string;
          };
          return {
            type: "tool-call" as const,
            toolCallId: tc.toolCallId || "",
            toolName: tc.toolName || "",
            input: tc.input || "{}",
          };
        }
        return part;
      }),
    });

    // Add tool results to history
    messageHistory.push({
      role: "tool",
      content: toolResults.map((tr) => ({
        type: "tool-result" as const,
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        output: {
          type: "json" as const,
          value: tr.result,
        },
        result: tr.result,
      })),
    });

    // Check if we should stop
    if (result?.finishReason === "stop") {
      break;
    }
  }

  onEvent({ type: "done" });
  return fullText;
}

/**
 * Stream event types for real-time LLM output
 */
export type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call-start"; toolCallId: string; toolName: string }
  | {
      type: "tool-call-delta";
      toolCallId: string;
      toolName: string;
      argsText: string;
    }
  | {
      type: "tool-call-end";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      result: unknown;
    }
  | { type: "finish"; reason: string }
  | { type: "error"; error: string };

/**
 * Stream text generation via gateway with real-time callbacks
 */
export async function streamTextViaGateway(
  session: MeshSession,
  gatewayId: string,
  messages: Array<{ role: string; content: string }>,
  model: string | undefined,
  onEvent: (event: StreamEvent) => void,
): Promise<string> {
  const requestBody = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: {
      name: "LLM_DO_STREAM",
      arguments: {
        modelId: model || "anthropic/claude-sonnet-4",
        callOptions: {
          prompt: toLanguageModelPrompt(messages),
        },
      },
    },
  };

  const response = await fetch(`${session.meshUrl}/mcp/gateway/${gatewayId}`, {
    method: "POST",
    headers: buildHeaders(session),
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stream error (${response.status}): ${text}`);
  }

  const contentType = response.headers.get("Content-Type") || "";
  let fullText = "";

  if (contentType.includes("text/event-stream") && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));

            // Handle different event types from the stream
            if (data.result?.content) {
              for (const part of data.result.content) {
                if (part.type === "text" && part.text) {
                  fullText += part.text;
                  onEvent({ type: "text-delta", text: part.text });
                } else if (part.type === "tool-call") {
                  onEvent({
                    type: "tool-call-end",
                    toolCallId: part.toolCallId || "",
                    toolName: part.toolName || "",
                    args: part.input ? JSON.parse(part.input) : {},
                  });
                }
              }
            }

            // Check for finish reason
            if (data.result?.finishReason) {
              onEvent({ type: "finish", reason: data.result.finishReason });
            }

            // Check for errors
            if (data.error) {
              onEvent({
                type: "error",
                error: data.error.message || "Unknown error",
              });
            }
          } catch {
            // Ignore parse errors for partial chunks
          }
        }
      }
    }
  } else {
    // Fallback to non-streaming response
    const json = await response.json();
    if (json.error) {
      throw new Error(`Tool error: ${json.error.message}`);
    }
    fullText = extractTextFromResponse(
      json.result?.structuredContent || json.result,
    );
    onEvent({ type: "text-delta", text: fullText });
    onEvent({ type: "finish", reason: "stop" });
  }

  return fullText;
}

export interface MeshClient {
  session: MeshSession;
  callTool: <T>(name: string, args: Record<string, unknown>) => Promise<T>;
  callConnectionTool: <T>(
    connectionId: string,
    name: string,
    args: Record<string, unknown>,
  ) => Promise<T>;
  callGatewayTool: <T>(
    gatewayId: string,
    name: string,
    args: Record<string, unknown>,
  ) => Promise<T>;
  listOrganizations: () => Promise<Organization[]>;
  setOrganization: (orgId: string, orgSlug: string) => Promise<void>;
  listConnections: () => Promise<Connection[]>;
  listGateways: () => Promise<Gateway[]>;
  listAgents: () => Promise<Agent[]>;
  findLLMConnection: () => Promise<Connection | null>;
  findLLMGateway: () => Promise<Agent | null>;
  getConnectionTools: (connectionId: string) => Promise<ConnectionTool[]>;
  generateText: (
    connectionId: string,
    messages: Array<{ role: string; content: string }>,
    model?: string,
  ) => Promise<string>;
  generateTextViaGateway: (
    gatewayId: string,
    messages: Array<{ role: string; content: string }>,
    model?: string,
  ) => Promise<string>;
  streamTextViaGateway: (
    gatewayId: string,
    messages: Array<{ role: string; content: string }>,
    model: string | undefined,
    onEvent: (event: StreamEvent) => void,
  ) => Promise<string>;
  generateWithToolsViaGateway: (
    gatewayId: string,
    messages: Array<{ role: string; content: string }>,
    tools: LLMTool[],
    model: string | undefined,
    onEvent: ToolExecutionCallback,
    maxIterations?: number,
    localToolExecutor?: LocalToolExecutor,
    localToolNames?: Set<string>,
  ) => Promise<string>;
}

/**
 * Create a Mesh client from the stored session
 */
export async function createMeshClient(): Promise<MeshClient | null> {
  const session = await readMeshSession();
  if (!session) {
    return null;
  }

  return {
    session,
    callTool: <T>(name: string, args: Record<string, unknown>) =>
      callMeshTool<T>(session, name, args),
    callConnectionTool: <T>(
      connectionId: string,
      name: string,
      args: Record<string, unknown>,
    ) => callConnectionTool<T>(session, connectionId, name, args),
    callGatewayTool: <T>(
      gatewayId: string,
      name: string,
      args: Record<string, unknown>,
    ) => callGatewayTool<T>(session, gatewayId, name, args),
    listOrganizations: () => listOrganizations(session),
    setOrganization: async (orgId: string, orgSlug: string) => {
      await setMeshOrganization(orgId, orgSlug);
      // Update the in-memory session too
      session.organizationId = orgId;
      session.organizationSlug = orgSlug;
    },
    listConnections: () => listConnections(session),
    listGateways: () => listGateways(session),
    listAgents: () => listAgents(session),
    findLLMConnection: () => findLLMConnection(session),
    findLLMGateway: () => findLLMGateway(session),
    getConnectionTools: (connectionId: string) =>
      getConnectionTools(session, connectionId),
    generateText: (
      connectionId: string,
      messages: Array<{ role: string; content: string }>,
      model?: string,
    ) => generateText(session, connectionId, messages, model),
    generateTextViaGateway: (
      gatewayId: string,
      messages: Array<{ role: string; content: string }>,
      model?: string,
    ) => generateTextViaGateway(session, gatewayId, messages, model),
    streamTextViaGateway: (
      gatewayId: string,
      messages: Array<{ role: string; content: string }>,
      model: string | undefined,
      onEvent: (event: StreamEvent) => void,
    ) => streamTextViaGateway(session, gatewayId, messages, model, onEvent),
    generateWithToolsViaGateway: (
      gatewayId: string,
      messages: Array<{ role: string; content: string }>,
      tools: LLMTool[],
      model: string | undefined,
      onEvent: ToolExecutionCallback,
      maxIterations?: number,
      localToolExecutor?: LocalToolExecutor,
      localToolNames?: Set<string>,
    ) =>
      generateWithToolsViaGateway(
        session,
        gatewayId,
        messages,
        tools,
        model,
        onEvent,
        maxIterations,
        localToolExecutor,
        localToolNames,
      ),
  };
}
