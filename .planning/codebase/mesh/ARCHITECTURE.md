# Architecture

**Analysis Date:** 2026-02-14

## Pattern Overview

**Overall:** Full-stack MCP (Model Context Protocol) control plane using layered service architecture with middleware-based request handling.

**Key Characteristics:**
- **Dependency injection via MeshContext** - All tools receive a unified context instead of accessing HTTP/DB/env directly
- **MCP-native proxy pattern** - Acts as both MCP Server (for clients) and MCP Client (to downstream servers)
- **Plugin-based extensibility** - Supports runtime plugin loading for Virtual MCPs and custom tools
- **Multi-tenancy** - Organization/project isolation at storage, auth, and tool execution levels
- **Observable by default** - OpenTelemetry instrumentation baked into context, tools, and queries

## Layers

**API/HTTP Layer:**
- Purpose: Handle incoming HTTP requests, MCP protocol binding, and response serialization
- Location: `apps/mesh/src/api/`
- Contains: Hono app routes, request/response handlers, error handling middleware
- Depends on: Hono, MCP SDK, storage abstractions, context factory
- Used by: MCP clients (Cursor, Claude, custom agents), web UI

**Core Context Layer:**
- Purpose: Provide runtime services to tools without coupling them to HTTP/DB frameworks
- Location: `apps/mesh/src/core/`
- Contains: `MeshContext` (unified interface), `ContextFactory` (HTTP→Context conversion), `AccessControl`, `defineTool` (tool definition wrapper)
- Depends on: Storage adapters, auth bindings, observability (tracer/meter)
- Used by: All tool implementations, event bus, proxy routes

**Auth Layer:**
- Purpose: Manage authentication (Better Auth), JWT tokens, API keys, and organization/project scoping
- Location: `apps/mesh/src/auth/`
- Contains: Better Auth initialization, JWT handling, OAuth provider config, role/permission definitions
- Depends on: Better Auth library, database for user/org storage
- Used by: Context factory for extracting auth state, access control for permission checks

**Storage Layer:**
- Purpose: Abstract database operations using Kysely ORM for SQLite/PostgreSQL compatibility
- Location: `apps/mesh/src/storage/`
- Contains: Type-safe storage adapters (`ConnectionStorage`, `VirtualMCPStorage`, `MonitoringStorage`, `EventBusStorage`, etc.)
- Depends on: Kysely, database dialects (Sqlite, PostgreSQL)
- Used by: Tools, context factory, event bus worker

**Database/Persistence Layer:**
- Purpose: Provide configured database connections with observability
- Location: `apps/mesh/src/database/index.ts`
- Contains: Kysely dialect setup, query logging, query duration metrics
- Depends on: Kysely, pg (PostgreSQL driver)
- Used by: Storage adapters

**Tools/Business Logic Layer:**
- Purpose: Define MCP tools grouped by domain (organizations, connections, virtual MCPs, monitoring, etc.)
- Location: `apps/mesh/src/tools/`
- Contains: Tool definitions using `defineTool()` pattern, schemas (Zod), handlers
- Depends on: Storage adapters, context for access control and audit
- Used by: MCP proxy routes, API endpoints

**MCP Client/Proxy Layer:**
- Purpose: Connect to downstream MCP servers and proxy tool calls through access control middleware
- Location: `apps/mesh/src/mcp-clients/`
- Contains: MCP client factories, decorators for caching/authorization, transport adapters (HTTP, SSE, WebSocket)
- Depends on: MCP SDK, storage for connection configs, encryption vault for credentials
- Used by: Proxy routes, virtual MCP routes

**Event Bus Layer:**
- Purpose: Pub/sub event delivery with scheduled retries, at-least-once guarantees
- Location: `apps/mesh/src/event-bus/`
- Contains: Event publishing, subscription management, worker processing, notify strategies (PostgreSQL LISTEN/NOTIFY + polling, SQLite timer polling)
- Depends on: Storage, database, notification strategies
- Used by: Tools, routes for event-driven workflows

**Observability Layer:**
- Purpose: OpenTelemetry tracing, metrics collection, and monitoring
- Location: `apps/mesh/src/observability/`
- Contains: Tracer/meter initialization, Prometheus exporter, span creation helpers
- Depends on: OpenTelemetry SDK, database for query metrics
- Used by: Context (tracer/meter injected), tools (for automatic span wrapping)

**Encryption/Credential Vault:**
- Purpose: Encrypt and manage sensitive credentials (API keys, OAuth tokens)
- Location: `apps/mesh/src/encryption/credential-vault.ts`
- Contains: Encryption/decryption of connection credentials
- Depends on: Database for credential storage
- Used by: MCP client factory, OAuth proxy

**Web/UI Layer:**
- Purpose: React 19 admin dashboard for managing connections, organizations, policies
- Location: `apps/mesh/src/web/`
- Contains: React components, providers (Auth, Theme), pages, sidebar navigation
- Depends on: React, Tailwind, shadcn, API client for backend calls
- Used by: Browser clients

**Plugins/Extensibility:**
- Purpose: Runtime-loaded plugin system for Virtual MCPs and custom business logic
- Location: `apps/mesh/src/core/plugin-loader.ts` + `packages/mesh-plugin-*`
- Contains: Plugin discovery, initialization, storage setup, startup hooks
- Depends on: Storage, context
- Used by: App initialization, tool registry

## Data Flow

**Incoming MCP Request:**

1. Client connects via HTTP/SSE (Cursor, Claude, etc.)
2. `api/routes/proxy.ts` receives request
3. `ContextFactory` extracts auth (API key or Better Auth session) → creates `MeshContext`
4. `AccessControl` middleware checks permissions
5. Tool handler executes with injected context
6. Response serialized back as MCP message

**Tool Execution Flow:**

1. Handler defined with `defineTool()` receives validated input + context
2. `ctx.access.check()` verifies permissions, records audit
3. Handler calls `ctx.storage.*` for data access (e.g., `ctx.storage.connections.list()`)
4. OpenTelemetry span tracks execution (name, duration, metrics)
5. Result validated against output schema
6. Metrics recorded (success/error count, duration histogram)

**Connection Proxy to Downstream MCP:**

1. Client lists tools via `/mcp` endpoint
2. Proxy creates `MCPProxyClient` from connection config
3. Client credentials decrypted from credential vault
4. Tools fetched from downstream server, cached in context
5. Tool call routed to downstream via proxy
6. Response streamed back with observability

**Event Publishing & Delivery:**

1. Tool calls `ctx.eventBus.publish()`
2. Event stored in database with retry metadata
3. Notify strategy triggered (PostgreSQL LISTEN/NOTIFY or timer)
4. EventBusWorker picks up event
5. Subscribers listed from storage
6. Event delivered with exponential backoff retries
7. Delivery marked as acked or scheduled for retry

**State Management:**

- **Auth state:** Better Auth session (stored in database + JWT cookie)
- **Organization/project context:** Extracted from Better Auth session + x-mesh-project header
- **Tool permissions:** Stored in database, checked at execution time via access control
- **Credentials:** Encrypted in database, decrypted at tool execution
- **Audit logs:** Recorded at tool invocation (tool name, user, org, timestamp, input)

## Key Abstractions

**MeshContext:**
- Purpose: Unified runtime interface for tools
- Examples: `apps/mesh/src/core/mesh-context.ts`
- Pattern: Provides `storage`, `auth`, `access`, `tracer`, `meter`, `credentialVault` without exposing HTTP/database details
- Access pattern: Injected into all tool handlers, bound to org/project scope

**ConnectionEntity & MCP Client:**
- Purpose: Represent configured downstream MCP servers
- Examples: `apps/mesh/src/tools/connection/schema.ts`, `apps/mesh/src/mcp-clients/client.ts`
- Pattern: Configuration + connection details stored in database, MCP client created on demand
- Caching: Tool definitions cached per request to reduce downstream fetches

**Virtual MCP:**
- Purpose: Compose subset of tools from multiple connections into new MCP endpoint
- Examples: `apps/mesh/src/storage/virtual.ts`, `apps/mesh/src/mcp-clients/virtual-mcp/`
- Pattern: Routing layer that dispatches tool calls to selected upstream connections based on policy
- Access: Exposed as single MCP endpoint with unified authentication

**ToolDefinition + defineTool():**
- Purpose: Declarative tool creation with automatic validation, logging, tracing
- Examples: `apps/mesh/src/core/define-tool.ts`, `apps/mesh/src/tools/organization/create.ts`
- Pattern: Zod schemas for input/output, handler receives `MeshContext`, automatic wrapping for metrics/tracing
- Usage: All management tools follow this pattern

**EventBusStorage + NotifyStrategy:**
- Purpose: Database-agnostic event queue with multiple delivery strategies
- Examples: `apps/mesh/src/storage/event-bus.ts`, `apps/mesh/src/event-bus/postgres-notify.ts`
- Pattern: Storage abstraction via Kysely, strategy pattern for notification (PostgreSQL LISTEN/NOTIFY or polling)
- Guarantees: At-least-once delivery, exponential backoff retries

## Entry Points

**HTTP/MCP Server:**
- Location: `apps/mesh/src/index.ts`
- Triggers: `bun run src/index.ts` or `bun run index.js` (production)
- Responsibilities: Initialize observability, create Hono app, start Bun server on port 3000
- Serves: MCP protocol requests, API endpoints, static assets (React UI)

**MCP Proxy Route:**
- Location: `apps/mesh/src/api/routes/proxy.ts`
- Triggers: POST/GET to `/mcp/*` endpoint
- Responsibilities: Create MCP proxy client, authenticate request, route to downstream
- Pattern: Handles both request/response and streaming transports

**Tool Execution:**
- Location: `apps/mesh/src/api/routes/` (various routes), called via MCP `call_tool`
- Triggers: MCP client calls tool with name + params
- Responsibilities: Locate tool definition, validate input, execute with context, return result
- Pattern: All tools wrapped by `defineTool()` execute method

**Virtual MCP Route:**
- Location: `apps/mesh/src/api/routes/virtual-mcp.ts`
- Triggers: MCP client connects to virtual MCP endpoint
- Responsibilities: Apply policy routing, select upstream connection, proxy tool calls
- Pattern: Middleware wraps tool dispatch with access control

**Event Bus Worker:**
- Location: `apps/mesh/src/event-bus/event-bus.ts`
- Triggers: Periodically woken via notify strategy (PostgreSQL LISTEN or timer)
- Responsibilities: Scan for pending events, deliver to subscribers, handle retries/acks
- Pattern: Background worker started with app, runs continuously

**Plugin Startup:**
- Location: `apps/mesh/src/core/plugin-loader.ts`
- Triggers: App initialization in `createApp()`
- Responsibilities: Discover plugins, initialize storage, run startup hooks
- Pattern: Hooks allow plugins to register tools, setup routes

## Error Handling

**Strategy:** Try-catch in handlers with structured error propagation, OpenTelemetry error recording

**Patterns:**

- **Validation errors:** Zod schema validation happens at MCP protocol level (client validates before sending)
- **Access control errors:** `AccessControl.check()` throws if permission denied, recorded in audit
- **Tool handler errors:** Caught in `defineTool.execute()`, recorded as error span + metric, re-thrown
- **Downstream errors:** MCP client proxy catches downstream failures, returns error response
- **Database errors:** Query logging catches SQL errors (slow query threshold, error logging)

## Cross-Cutting Concerns

**Logging:** Combined approach
- `console` for startup/debug messages
- OpenTelemetry spans for structured tracing (tool execution, DB queries, HTTP requests)
- Audit logs in database (tool name, user, org, timestamp, input/output)
- Dev logger middleware for HTTP requests

**Validation:**
- Input: Zod schemas defined per tool, validated at MCP protocol level
- Output: Zod schema validation in `defineTool.execute()` before returning
- Configuration: Handled by Better Auth (OAuth scopes) and plugin config storage

**Authentication:**
- Better Auth session (OAuth 2.1) stored as JWT cookie + database records
- API key auth via `x-mesh-auth-token` header + database lookup
- Token verification in `ContextFactory` before creating context
- Organization scoping: Extracted from Better Auth org + x-mesh-project header

**Multi-tenancy:**
- Organization ID enforced at storage layer (queries filtered by org)
- Project ID scoped within organization via x-mesh-project header
- Permissions checked against organization membership + role
- Credentials encrypted per organization

---

*Architecture analysis: 2026-02-14*
