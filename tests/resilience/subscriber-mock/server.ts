/**
 * Subscriber Mock Server
 *
 * A minimal Bun HTTP server implementing the MCP JSON-RPC protocol
 * over StreamableHTTP transport. It exposes a single ON_EVENTS tool
 * that records received CloudEvents for later inspection.
 *
 * Endpoints:
 * - POST /mcp        - MCP JSON-RPC (StreamableHTTP)
 * - GET  /received   - Returns all recorded ON_EVENTS payloads
 * - DELETE /received  - Clears recorded events
 * - GET  /health     - Health check (200 OK)
 */

const PORT = Number(process.env.PORT) || 3003;

const sessionId = crypto.randomUUID();

interface CloudEvent {
  specversion: string;
  id: string;
  source: string;
  type: string;
  time?: string;
  subject?: string;
  datacontenttype?: string;
  dataschema?: string;
  data?: unknown;
}

interface OnEventsInput {
  events: CloudEvent[];
}

// Recorded ON_EVENTS payloads
const receivedEvents: OnEventsInput[] = [];

// ON_EVENTS tool definition with JSON Schema
const ON_EVENTS_TOOL = {
  name: "ON_EVENTS",
  description:
    "Receive a batch of CloudEvents for processing. Events follow the CloudEvents v1.0 specification.",
  inputSchema: {
    type: "object" as const,
    properties: {
      events: {
        type: "array" as const,
        minItems: 1,
        description: "Batch of CloudEvents to process",
        items: {
          type: "object" as const,
          properties: {
            specversion: {
              type: "string" as const,
              const: "1.0",
              description: "CloudEvents specification version",
            },
            id: {
              type: "string" as const,
              description: "Unique identifier for this event",
            },
            source: {
              type: "string" as const,
              description: "Connection ID of the event publisher",
            },
            type: {
              type: "string" as const,
              description: "Event type (e.g., 'order.created')",
            },
            time: {
              type: "string" as const,
              format: "date-time",
              description: "Timestamp of when the event occurred (ISO 8601)",
            },
            subject: {
              type: "string" as const,
              description: "Subject/resource identifier",
            },
            datacontenttype: {
              type: "string" as const,
              description: "Content type of the data attribute",
            },
            dataschema: {
              type: "string" as const,
              format: "uri",
              description: "URI to the schema for the data attribute",
            },
            data: {
              description: "Event payload (any JSON value)",
            },
          },
          required: ["specversion", "id", "source", "type"],
        },
      },
    },
    required: ["events"],
  },
};

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function jsonRpcResponse(
  id: string | number | null,
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function handleInitialize(req: JsonRpcRequest): JsonRpcResponse {
  return jsonRpcResponse(req.id ?? null, {
    protocolVersion: "2025-03-26",
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: "subscriber-mock",
      version: "1.0.0",
    },
  });
}

function handleToolsList(req: JsonRpcRequest): JsonRpcResponse {
  return jsonRpcResponse(req.id ?? null, {
    tools: [ON_EVENTS_TOOL],
  });
}

function handleToolsCall(req: JsonRpcRequest): JsonRpcResponse {
  const params = req.params as
    | { name: string; arguments?: Record<string, unknown> }
    | undefined;

  if (!params || params.name !== "ON_EVENTS") {
    return jsonRpcError(
      req.id ?? null,
      -32602,
      `Unknown tool: ${params?.name}`,
    );
  }

  const input = params.arguments as unknown as OnEventsInput;
  receivedEvents.push(input);

  return jsonRpcResponse(req.id ?? null, {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true }),
      },
    ],
  });
}

function handleRequest(req: JsonRpcRequest): JsonRpcResponse | null {
  switch (req.method) {
    case "initialize":
      return handleInitialize(req);
    case "notifications/initialized":
      // Notification - no response
      return null;
    case "tools/list":
      return handleToolsList(req);
    case "tools/call":
      return handleToolsCall(req);
    default:
      return jsonRpcError(
        req.id ?? null,
        -32601,
        `Method not found: ${req.method}`,
      );
  }
}

const mcpHeaders = {
  "Content-Type": "application/json",
  "mcp-session-id": sessionId,
};

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (req.method === "GET" && url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    // Get recorded events
    if (req.method === "GET" && url.pathname === "/received") {
      return Response.json(receivedEvents);
    }

    // Clear recorded events
    if (req.method === "DELETE" && url.pathname === "/received") {
      receivedEvents.length = 0;
      return new Response(null, { status: 204 });
    }

    // MCP StreamableHTTP endpoint
    if (req.method === "POST" && url.pathname === "/mcp") {
      return (async () => {
        const body = await req.json();
        const rpcReq = body as JsonRpcRequest;
        const response = handleRequest(rpcReq);

        if (response === null) {
          // Notification acknowledged - return 202
          return new Response(null, {
            status: 202,
            headers: { "mcp-session-id": sessionId },
          });
        }

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: mcpHeaders,
        });
      })();
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`subscriber-mock listening on port ${server.port}`);
