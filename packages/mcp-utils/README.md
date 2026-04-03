# @decocms/mcp-utils

Primitives for building MCP proxies, gateways, and sandboxes.

Five utilities extracted from [MCP Mesh](https://github.com/decocms/mesh), an open-source MCP control plane. The MCP SDK gives you `Client`, `Server`, and `Transport` — this package gives you the glue between them.

## Install

```bash
npm install @decocms/mcp-utils @modelcontextprotocol/sdk
```

For sandbox support (optional):
```bash
npm install quickjs-emscripten-core @jitl/quickjs-wasmfile-release-sync
```

## Quick Start

### Bridge two MCP endpoints in-process

```typescript
import { createBridgeTransportPair } from "@decocms/mcp-utils";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const { client: clientTransport, server: serverTransport } = createBridgeTransportPair();

const server = new Server({ name: "my-server", version: "1.0.0" }, { capabilities: { tools: {} } });
const client = new Client({ name: "my-client", version: "1.0.0" });

await server.connect(serverTransport);
await client.connect(clientTransport);
```

### Turn any Client into a Server (proxy pattern)

```typescript
import { createServerFromClient } from "@decocms/mcp-utils";

const proxyServer = createServerFromClient(upstreamClient, {
  name: "my-proxy",
  version: "1.0.0",
});
```

### Add middleware to a transport

```typescript
import { composeTransport, WrapperTransport } from "@decocms/mcp-utils";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

class LoggingTransport extends WrapperTransport {
  protected handleIncomingMessage(msg: JSONRPCMessage) {
    console.log("<-", msg);
    super.handleIncomingMessage(msg);
  }
}

const transport = composeTransport(
  baseTransport,
  (t) => new LoggingTransport(t),
);
```

### Aggregate multiple MCP servers into one

```typescript
import { GatewayClient } from "@decocms/mcp-utils/aggregate";

const gateway = new GatewayClient({
  slack: slackClient,
  google: googleClient,
  github: () => connectToGithub(), // lazy — connected on first use
});

const tools = await gateway.listTools(); // tools from all three
const result = await gateway.callTool({ name: "send_message", arguments: { channel: "#general" } });
```

### Run user code with MCP tool access in a sandbox

```typescript
import { runCodeWithTools } from "@decocms/mcp-utils/sandbox";

const result = await runCodeWithTools({
  code: `export default async (tools) => {
    const items = await tools.list_items({});
    return items.filter(i => i.status === "active");
  }`,
  client: mcpClient,
  timeoutMs: 5000,
});
// result: { returnValue: [...], consoleLogs: [] }
```

## API

### `createBridgeTransportPair()`

Creates a pair of in-process transports for connecting an MCP Client to an MCP Server without network overhead. Uses microtask scheduling for FIFO message ordering.

### `createServerFromClient(client, serverInfo, options?)`

Wraps any `IClient` as an MCP `Server`. Delegates `listTools`, `callTool`, `listResources`, `readResource`, `listResourceTemplates`, `listPrompts`, `getPrompt`. Strips `outputSchema` from tools (proxies should not validate — that is the origin server's job).

Options:
- `capabilities` — override server capabilities (defaults to client's)
- `instructions` — override server instructions
- `toolCallTimeoutMs` — timeout for forwarded tool calls

### `composeTransport(baseTransport, ...middlewares)`

Composes transport middlewares left-to-right. Each middleware wraps the previous transport.

### `WrapperTransport`

Abstract base class for transport middleware. Override `handleOutgoingMessage` and/or `handleIncomingMessage` to intercept messages.

### `GatewayClient`

Aggregates tools, resources, and prompts from multiple `IClient` instances. Implements `IClient` so it composes with `createServerFromClient()`.

Features:
- **Lazy initialization** — factory functions called on first use, cached
- **Caching** — list results cached; call `refresh()` to invalidate
- **Auto-pagination** — fetches all pages from upstream clients
- **Deduplication** — first occurrence wins (insertion order); collisions logged
- **Routing** — `callTool`/`readResource`/`getPrompt` routed to correct upstream
- **Selection** — optional allowlist via `options.selected`

### `runCodeWithTools(options)`

Executes JavaScript in a QuickJS sandbox with MCP tools injected. The code must `export default async (tools) => { ... }`.

Options:
- `code` — JavaScript source code
- `client` — `IClient` instance for tool discovery and execution
- `timeoutMs` — execution timeout (default: 30s)
- `memoryLimitBytes` — QuickJS memory limit (default: 32MB)
- `stackSizeBytes` — QuickJS stack limit (default: 512KB)

### `IClient`

Minimal interface matching the MCP SDK `Client` methods. Use this to type-check objects that can be passed to `createServerFromClient` or used as upstream clients in `GatewayClient`.

## Peer Dependencies

| Subpath | Required |
|---------|----------|
| `@decocms/mcp-utils` | `@modelcontextprotocol/sdk >=1.27.0` |
| `@decocms/mcp-utils/sandbox` | + `quickjs-emscripten-core >=0.31.0`, `@jitl/quickjs-wasmfile-release-sync >=0.31.0` |
| `@decocms/mcp-utils/aggregate` | `@modelcontextprotocol/sdk >=1.27.0` |

## Extracted from MCP Mesh

These utilities are extracted from [MCP Mesh](https://github.com/decocms/mesh), an open-source control plane for MCP traffic. MCP Mesh provides authentication, routing, and observability between MCP clients and servers.

## License

MIT
