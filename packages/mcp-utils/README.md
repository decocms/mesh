# @decocms/mcp-utils

Primitives for building MCP proxies, gateways, and sandboxes.

The MCP SDK gives you `Client`, `Server`, and `Transport` — this package gives you the glue between them: in-process bridging, client-to-server proxying, transport middleware, multi-server aggregation, and sandboxed code execution.

Extracted from [DECO CMS](https://github.com/decocms/mesh), an open-source MCP control plane.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
  - [Bridge two MCP endpoints in-process](#bridge-two-mcp-endpoints-in-process)
  - [Turn any Client into a Server (proxy pattern)](#turn-any-client-into-a-server-proxy-pattern)
  - [Add middleware to a transport](#add-middleware-to-a-transport)
  - [Aggregate multiple MCP servers into one](#aggregate-multiple-mcp-servers-into-one)
  - [Run code in a sandbox with an MCP client](#run-code-in-a-sandbox-with-an-mcp-client)
- [Types](#types)
- [Peer Dependencies](#peer-dependencies)
- [License](#license)

## Install

```bash
npm install @decocms/mcp-utils @modelcontextprotocol/sdk
```

For sandbox support (optional):
```bash
npm install quickjs-emscripten-core @jitl/quickjs-wasmfile-release-sync
```

## Usage

### Bridge two MCP endpoints in-process

Connect an MCP Client to an MCP Server without network overhead. Messages are passed by reference using microtask scheduling — no serialization, no sockets.

```typescript
import { createBridgeTransportPair } from "@decocms/mcp-utils";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const { client: clientTransport, server: serverTransport } = createBridgeTransportPair();

const server = new Server({ name: "my-server", version: "1.0.0" }, { capabilities: { tools: {} } });
const client = new Client({ name: "my-client", version: "1.0.0" });

await server.connect(serverTransport);
await client.connect(clientTransport);

// client and server can now communicate in-process
const tools = await client.listTools();
```

### Turn any Client into a Server (proxy pattern)

Wrap an upstream MCP Client as a Server. Incoming requests are forwarded to the client — useful for building proxies, adding auth layers, or re-exposing a remote server on a different transport.

```typescript
import { createServerFromClient, createBridgeTransportPair } from "@decocms/mcp-utils";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Connect to an upstream MCP server
const upstreamClient = new Client({ name: "upstream", version: "1.0.0" });
await upstreamClient.connect(upstreamTransport);

// Expose it as a new server
const proxyServer = createServerFromClient(upstreamClient, {
  name: "my-proxy",
  version: "1.0.0",
});

// Connect the proxy to any transport (SSE, stdio, bridge, etc.)
await proxyServer.connect(downstreamTransport);
```

Delegates `listTools`, `callTool`, `listResources`, `readResource`, `listResourceTemplates`, `listPrompts`, and `getPrompt`. Strips `outputSchema` from tools (proxies should not validate — that is the origin server's job).

Options:
- `capabilities` — override server capabilities (defaults to client's)
- `instructions` — override server instructions
- `toolCallTimeoutMs` — timeout for forwarded tool calls

### Add middleware to a transport

Intercept and transform messages flowing through any MCP transport. `WrapperTransport` is the base class; `composeTransport` chains multiple middlewares left-to-right.

```typescript
import { composeTransport, WrapperTransport } from "@decocms/mcp-utils";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

class LoggingTransport extends WrapperTransport {
  protected handleIncomingMessage(msg: JSONRPCMessage) {
    console.log("←", msg);
    super.handleIncomingMessage(msg);
  }

  protected handleOutgoingMessage(msg: JSONRPCMessage) {
    console.log("→", msg);
    return super.handleOutgoingMessage(msg);
  }
}

class AuthTransport extends WrapperTransport {
  constructor(inner: Transport, private token: string) {
    super(inner);
  }

  protected async handleOutgoingMessage(msg: JSONRPCMessage) {
    // inject auth headers, rewrite requests, etc.
    return super.handleOutgoingMessage(msg);
  }
}

// Compose middlewares — messages flow through logging, then auth
const transport = composeTransport(
  baseTransport,
  (t) => new LoggingTransport(t),
  (t) => new AuthTransport(t, "my-token"),
);
```

Override `handleOutgoingMessage` (client → server) and/or `handleIncomingMessage` (server → client) to intercept traffic. Helper methods `isRequest()` and `isResponse()` are available for filtering.

### Aggregate multiple MCP servers into one

`GatewayClient` merges tools, resources, and prompts from multiple upstream clients into a single unified client. It implements `IClient`, so it composes with `createServerFromClient()` to expose the aggregation as a server.

```typescript
import { GatewayClient } from "@decocms/mcp-utils/aggregate";

const gateway = new GatewayClient({
  slack: { client: slackClient },
  google: { client: googleClient },
  github: { client: () => connectToGithub() }, // lazy — connected on first use
});

// List tools from all upstream servers
const { tools } = await gateway.listTools();

// Call a tool — automatically routed to the correct upstream
const result = await gateway.callTool({
  name: "slack_send_message", // namespaced: "{key}_{tool}"
  arguments: { channel: "#general", text: "Hello!" },
});
```

Filter which tools/resources/prompts each upstream exposes:

```typescript
const gateway = new GatewayClient({
  slack: {
    client: slackClient,
    tools: ["send_message", "list_channels"], // only expose these tools
  },
  github: {
    client: () => connectToGithub(),
    resources: ["repo://main"],               // only expose this resource
  },
});
```

Features:
- **Lazy initialization** — factory functions called on first use, results cached
- **Caching** — list results cached; call `refresh()` to invalidate
- **Auto-pagination** — fetches all pages from upstream clients
- **Namespacing** — tools and prompts prefixed with client key (e.g. `slack_send_message`)
- **Routing** — `callTool`/`readResource`/`getPrompt` routed to the correct upstream
- **Selection** — per-client allowlists for tools, resources, and prompts

Compose with `createServerFromClient` to expose the gateway as a server:

```typescript
import { createServerFromClient } from "@decocms/mcp-utils";

const server = createServerFromClient(gateway, {
  name: "my-gateway",
  version: "1.0.0",
});

await server.connect(transport); // now serves aggregated tools over any transport
```

### Run code in a sandbox with an MCP client

Execute untrusted JavaScript in a QuickJS sandbox with an MCP client injected. The sandbox is memory-limited, time-limited, and fully isolated.

```typescript
import { runCode } from "@decocms/mcp-utils/sandbox";

const result = await runCode({
  code: `export default async (client) => {
    const { tools } = await client.listTools();
    const data = await client.callTool({ name: "list_items", arguments: {} });
    console.log("Found tools:", tools.length);
    return data;
  }`,
  client: mcpClient,
  timeoutMs: 5000,
});

console.log(result.returnValue);  // tool call result
console.log(result.consoleLogs);  // captured console.log/warn/error calls
```

The code must `export default` an async function that receives a `client` object. The client exposes standard MCP methods: `callTool`, `listTools`, `listResources`, `readResource`, `listPrompts`, and `getPrompt`.

Options:
- `code` — JavaScript source (must `export default async (client) => { ... }`)
- `client` — an `IClient`-compatible MCP client
- `timeoutMs` — execution timeout
- `memoryLimitBytes` — QuickJS memory limit (default: 32 MB)
- `stackSizeBytes` — QuickJS stack limit (default: 512 KB)

## Types

### `IClient`

Minimal interface matching the MCP SDK `Client` methods. Use this to type-check custom objects that can be passed to `createServerFromClient` or used as upstream clients in `GatewayClient`.

```typescript
import type { IClient } from "@decocms/mcp-utils";
```

### `SandboxLog`

```typescript
type SandboxLog = { type: "log" | "warn" | "error"; content: string };
```

## Peer Dependencies

| Subpath | Required |
|---------|----------|
| `@decocms/mcp-utils` | `@modelcontextprotocol/sdk >=1.27.0` |
| `@decocms/mcp-utils/sandbox` | + `quickjs-emscripten-core >=0.31.0`, `@jitl/quickjs-wasmfile-release-sync >=0.31.0` |
| `@decocms/mcp-utils/aggregate` | `@modelcontextprotocol/sdk >=1.27.0` |

## License

MIT
