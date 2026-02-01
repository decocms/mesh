# Architecture

**Analysis Date:** 2026-02-01

## Pattern Overview

**Overall:** Layered HTTP + MCP Gateway with Plugin Architecture

**Key Characteristics:**
- **MCP Gateway**: Acts as a Model Context Protocol (MCP) server that proxies requests to downstream MCP servers (connections) while providing a unified interface
- **Full-Stack**: Server (Hono HTTP framework) + React Frontend (TanStack Router) in single monorepo
- **Context-Driven**: All business logic uses dependency injection through `MeshContext` to avoid coupling to HTTP or database drivers
- **Event-Driven**: Async event bus for notifications, subscriptions, and task execution
- **Multi-Tenant**: Organization-scoped access control via Better Auth, with API key authentication for programmatic access
- **Pluggable**: Server plugins and client plugins for extensibility

## Layers

**Web Layer (Frontend):**
- Purpose: React SPA for user interface
- Location: `apps/mesh/src/web/`
- Contains: React components, TanStack Router routes, hooks, layouts
- Depends on: API layer (REST/HTTP)
- Used by: End users via browser

**API Layer (HTTP):**
- Purpose: Hono HTTP server handling all client requests
- Location: `apps/mesh/src/api/`
- Contains: Route handlers, middleware, request/response processing
- Depends on: Core layer (MeshContext, business logic)
- Used by: Web frontend, external clients, CLI tools

**Core Layer (Business Logic):**
- Purpose: Request context creation, access control, configuration
- Location: `apps/mesh/src/core/`
- Contains: Context factory, access control, tool definitions, plugin loader
- Depends on: Storage layer, Auth layer, Encryption, Observability
- Used by: API routes, Tools

**Tools Layer (Management Operations):**
- Purpose: MCP-compatible tools for managing organizations, connections, tokens, etc.
- Location: `apps/mesh/src/tools/`
- Contains: Tool implementations in subdirectories (organization, connection, apiKeys, etc.)
- Depends on: Core context, Storage
- Used by: Proxy (exposes via /mcp/self), API routes, Direct calls

**MCP Client Layer:**
- Purpose: Manages connections to downstream MCP servers and handles MCP protocol
- Location: `apps/mesh/src/mcp-clients/`
- Contains: Client factories, outbound headers, virtual MCP client
- Depends on: MCP SDK, Storage
- Used by: Proxy routes

**Storage Layer:**
- Purpose: Abstract database access with specific storage adapters
- Location: `apps/mesh/src/storage/`
- Contains: Connection storage, virtual MCP storage, monitoring, user storage
- Depends on: Database (Kysely), Types
- Used by: Core context, Tools, Event bus

**Authentication Layer:**
- Purpose: Better Auth integration, JWT verification, session management
- Location: `apps/mesh/src/auth/`
- Contains: Better Auth configuration, JWT utilities, OAuth handlers
- Depends on: Database
- Used by: Middleware, Context factory

**Database Layer:**
- Purpose: Low-level database access with dialect support
- Location: `apps/mesh/src/database/`
- Contains: Kysely configuration, migrations, connection pools
- Depends on: Database drivers (pg, better-sqlite3)
- Used by: Storage adapters, Context factory

**Supporting Layers:**
- Encryption (`apps/mesh/src/encryption/`): Credential vault for storing encrypted secrets
- Event Bus (`apps/mesh/src/event-bus/`): Async event publishing and delivery
- Observability (`apps/mesh/src/observability/`): OpenTelemetry tracing, metrics, logging
- Sandbox (`apps/mesh/src/sandbox/`): Code execution environment for dynamic tools

## Data Flow

**Incoming Request to MCP Proxy:**

1. HTTP request arrives at Hono app
2. Middleware pipeline: timing, tracing, CORS, logging, 5xx error capture
3. Context injection middleware creates `MeshContext` (includes auth, storage, observability)
4. Request routes to `/mcp/:connectionId` (proxy.ts)
5. MCP proxy:
   - Deserializes MCP request from streamable HTTP
   - Creates/reuses MCP client to downstream server
   - Applies monitoring middleware (logs, metrics)
   - Forwards request through MCP client to downstream server
   - Captures response and monitors
   - Returns streamable HTTP response
6. Response sent to client

**Incoming Request to Management Tool:**

1. HTTP request to `/mcp/self/*` or API route
2. Context injection creates `MeshContext`
3. Route handler calls tool function with context
4. Tool accesses database through `ctx.storage.*` adapters
5. Tool returns result (or throws error)
6. API layer serializes and returns response

**State Management:**

- **Database**: PostgreSQL or SQLite (Kysely ORM) - persistent state for connections, organizations, settings
- **Memory (Event Bus)**: In-memory queue for async event delivery, survives application restarts via database
- **Session**: HTTP cookies via Better Auth
- **API Keys**: JWT tokens signed with BETTER_AUTH_SECRET, scoped to organizations
- **Configuration**: Environment variables, config files, database settings table

## Key Abstractions

**MeshContext:**
- Purpose: Encapsulates all request-scoped dependencies and state
- Examples: `src/core/context-factory.ts`, `src/core/mesh-context.ts`
- Pattern: Factory pattern creates context from HTTP request, injected into all tools and route handlers
- Contains: auth (user/API key), storage adapters, observability, event bus, encryption, headers

**Storage Adapters:**
- Purpose: Abstract database access for different entity types
- Examples: `ConnectionStorage`, `VirtualMCPStorage`, `MonitoringStorage`
- Pattern: Each adapter owns its own database queries and type conversions
- Location: `src/storage/*.ts`

**Tool Definition:**
- Purpose: Define MCP tool metadata and implementation
- Pattern: `defineTool({ name, description, inputSchema, execute })` factory function
- Examples: `src/tools/organization/*.ts`, `src/tools/connection/*.ts`
- Used by: registry (metadata), proxy (execution)

**MCP Client:**
- Purpose: Establish and maintain connection to downstream MCP server
- Pattern: Lazy creation, caching, automatic reconnection
- Location: `src/mcp-clients/outbound/index.ts`
- Supports: Streamable HTTP and STDIO transports

**Plugin Loader:**
- Purpose: Dynamically load server plugins and mount routes
- Pattern: Plugins register routes and storage factories
- Location: `src/core/plugin-loader.ts`
- Examples: `mesh-plugin-task-runner`, `mesh-plugin-object-storage`, `mesh-plugin-user-sandbox`

## Entry Points

**Server Entry Point:**
- Location: `src/index.ts`
- Triggers: `bun run src/index.ts` or CLI
- Responsibilities: Initialize observability, create Hono app, start Bun server on port 3000
- Creates: App via `createApp()` function

**CLI Entry Point:**
- Location: `src/cli.ts`
- Triggers: `bunx @decocms/mesh` (bin entry point)
- Responsibilities: Parse CLI args, run migrations, set port, emit dev-only secrets warning
- Calls: `src/index.ts` after setup

**Client Entry Point:**
- Location: `src/web/index.tsx`
- Triggers: Vite dev server or bundled client
- Responsibilities: Initialize React root, create TanStack Router with routes, mount providers
- Creates: Router tree with routes like `/login`, `/orgs/:org/*`, `/connect/:sessionId`

**API Route Entry Points (in `src/api/routes/`):**
- `/api/auth/*`: Auth routes (API key management) → `auth.ts`
- `/api/config`: Public config endpoint → `public-config.ts`
- `/mcp/:connectionId`: MCP proxy to downstream servers → `proxy.ts`
- `/mcp/gateway/:virtualMcpId` or `/mcp/virtual-mcp/:virtualMcpId`: Virtual MCP → `virtual-mcp.ts`
- `/mcp/self`: Management tools (org, connection, etc.) → `self.ts`
- `/oauth-proxy/:connectionId/*`: OAuth token endpoint proxying → `oauth-proxy.ts`
- `/api/:org/models/*`: LLM models (decopilot) → `decopilot/routes.ts`
- `/api/:org/chat`: OpenAI-compatible chat API → `openai-compat.ts`
- `/org/:organizationId/events/:type`: Public event publishing → App (direct handler)

## Error Handling

**Strategy:** Hierarchical error handling with context-aware recovery

**Patterns:**
- Try-catch at tool level: tools catch and return error results
- Middleware error wrapping: routes wrapped in error handlers that serialize to JSON
- Global app.onError(): final fallback for unhandled errors, logs and returns 500
- 5xx response logging: middleware logs response body for all 500+ errors for debugging
- MCP-specific: McpError types preserve error codes and messages from downstream servers

## Cross-Cutting Concerns

**Logging:**
- Console via Hono logger middleware
- Dev mode: custom dev logger with colors
- Production: standard Hono logger
- 5xx responses logged with full body
- OpenTelemetry logs exported to OTLP endpoint (if configured)

**Validation:**
- Request parameters: validated in route handlers with type checking
- Tool input: validated by JSON schema (defined in tool.inputSchema)
- Database: Kysely provides type-safe queries

**Authentication:**
- Better Auth session: HTTP cookies, validated by middleware
- API Keys: JWT tokens extracted from Authorization header
- OAuth: Better Auth SSO plugin for OAuth flows, proxy handling
- MCP Auth: WWW-Authenticate header with OAuth challenge for API clients

**Authorization:**
- Organization scope: user must be member of org to access resources
- Role-based access control (RBAC): Better Auth roles (owner, admin, member)
- Tool-level permissions: managed via Better Auth permissions system
- API key scopes: can be restricted to specific tools/resources

**Observability:**
- Tracing: OpenTelemetry tracer with spans for MCP requests, tool calls, DB queries
- Metrics: Prometheus metrics on `/metrics` endpoint
- Timing: Server-Timing header with latency breakdown (mcp, llm_models, etc.)
- Debugging: Optional debug server on port 9090 (ENABLE_DEBUG_SERVER=true)

---

*Architecture analysis: 2026-02-01*
