# External Integrations - Mesh

**Analysis Date:** 2026-02-14

## APIs & External Services

**Model Context Protocol (MCP):**
- Service: MCP Servers (client connectivity hub)
- What it's used for: Central gateway for managing connections to MCP servers and tools
- SDK/Client: @modelcontextprotocol/sdk 1.26.0
- Routes: `apps/mesh/src/api/routes/virtual-mcp.ts`, `apps/mesh/src/mcp-clients/`

**AI/LLM Providers (Multi-provider via Vercel AI SDK):**
- Service: OpenAI, Anthropic, and other providers
- What it's used for: LLM inference for chat and tool assistance
- SDK/Client: @ai-sdk/provider 3.0.0, ai 6.0.1
- Routes: `apps/mesh/src/api/routes/decopilot/`
- Auth: Model provider credentials stored in connections

**OpenAI-Compatible API Proxy:**
- Service: Any OpenAI-compatible LLM endpoint
- What it's used for: Provides OpenAI-compatible API surface for external clients
- Routes: `apps/mesh/src/api/routes/openai-compat.ts`
- Purpose: Drop-in replacement for OpenAI API

**OAuth 2.1 Server (Deco MCP):**
- Service: OAuth provider for MCP client authentication
- What it's used for: Secure API access to Mesh tools and connections
- Routes: `apps/mesh/src/api/routes/oauth-proxy.ts`
- Auth: Via Better Auth MCP plugin

**Deco Store Registry:**
- Service: Deco plugin/site registry
- What it's used for: Package discovery and management for plugins
- Connection URL: `DECO_STORE_URL` constant in config
- Storage: `apps/mesh/src/storage/projects.ts`

## Data Storage

**Databases:**

**SQLite (Default):**
- Type: File-based relational database
- Connection: Via `DATABASE_URL` (file:// protocol or :memory:)
- Default path: `./data/mesh.db` (relative to working directory)
- Client: Kysely with BunWorkerDialect
- Features: WAL mode enabled, foreign keys enabled
- Implementation: `apps/mesh/src/database/index.ts`

**PostgreSQL (Production):**
- Type: PostgreSQL 12+
- Connection: Via `DATABASE_URL` (postgres:// or postgresql:// protocol)
- Client: Kysely with PostgreSQL dialect via pg driver
- Pool Configuration:
  - Max connections: 10 (configurable)
  - Keep-alive enabled
  - Idle timeout: 5 minutes (cross-region optimization)
  - Connection timeout: 30 seconds
  - SSL: Configurable via `DATABASE_PG_SSL` env var
- Implementation: `apps/mesh/src/database/index.ts`

**Database Schema:**
- Type: Kysely-managed SQL schema
- Migration path: `apps/mesh/src/database/migrate.ts`
- Storage models:
  - Users and sessions (Better Auth)
  - Organizations and members
  - MCP connections and configurations
  - Event bus subscriptions
  - Monitoring dashboards
  - Projects and plugin configurations

**File/Object Storage:**
- Service: Plugin-based (see mesh-plugin-object-storage)
- What it's used for: Storing files, assets, and large objects
- Client: Via storage plugins
- Implementation: `packages/mesh-plugin-object-storage/`

**Virtual/Distributed Storage:**
- Service: Virtual storage layer for cross-organization data
- What it's used for: Thread/conversation persistence, virtual tools
- Implementation: `apps/mesh/src/storage/virtual.ts`

## Authentication & Identity

**Auth Provider:**
- Service: Better Auth (self-hosted)
- Implementation: `apps/mesh/src/auth/index.ts`
- Plugins:
  - Organization plugin: Multi-tenant organization management
  - MCP plugin: OAuth 2.1 server for MCP clients
  - API Key plugin: Direct API access with metadata
  - Admin plugin: System-level super-admin access
  - OpenAPI plugin: API documentation generation
  - JWT plugin: Short-lived tokens (5 min default) for proxy access
  - SSO plugin: Social authentication (configurable)
  - Magic Link plugin: Email-based passwordless auth (configurable)

**Session Management:**
- Type: JWT-based and database sessions
- Stores: Database-backed session storage
- Token expiration: Configurable per auth method

**Organization Access Control:**
- Type: Dynamic role-based access control (RBAC)
- Roles: user, admin, owner (with custom roles possible)
- Max custom roles per organization: 500
- Scopes: Mapped to available tools
- Implementation: `apps/mesh/src/auth/index.ts` (createAccessControl)

**API Key Management:**
- Type: Long-lived API keys with metadata
- Features: Configurable expiration, permissions metadata
- Min expiration: 5 minutes
- Default permissions: Read organization/connection, create API keys
- Implementation: Better Auth API Key plugin

## Email Providers (for auth & invitations)

**Resend:**
- Service: Email delivery
- Used for: Magic links, organization invitations
- Client: Custom Resend wrapper
- Config: API key + from email address
- Implementation: `apps/mesh/src/auth/email-providers.ts`

**SendGrid:**
- Service: Email delivery
- Used for: Magic links, organization invitations
- Client: Custom SendGrid wrapper
- Config: API key + from email address
- Implementation: `apps/mesh/src/auth/email-providers.ts`

**Configuration:**
- Via `auth-config.json` (file-based):
  - `emailProviders`: Array of provider configs
  - `inviteEmailProviderId`: Selected provider for invitations
- Optional: If not configured, email features are disabled

## Monitoring & Observability

**Distributed Tracing:**
- Exporter: OpenTelemetry OTLP Proto over gRPC
- Exporter: OTLPTraceExporter (via @opentelemetry/exporter-trace-otlp-proto)
- Sampling: 10% default ratio + debug sampling (query param `__d`)
- Tracer: `trace.getTracer("mesh", "1.0.0")`
- Implementation: `apps/mesh/src/observability/index.ts`

**Metrics:**
- Exporter: Prometheus (text format)
- Exporter: PrometheusExporter (via @opentelemetry/exporter-prometheus)
- Endpoint: `/metrics` (scraped by Prometheus)
- Metrics collected:
  - `db.query.duration` - Database query execution time (histogram)
  - Custom metrics via `meter.createHistogram()` etc.
- Meter: `metrics.getMeter("mesh", "1.0.0")`
- Implementation: `apps/mesh/src/observability/index.ts`

**Structured Logging:**
- Exporter: OpenTelemetry OTLP Proto for logs
- Log levels: ERROR, WARN, DEBUG
- Intercepted console methods: console.error, console.warn, console.debug
- Attributes: log.source, trace context
- Logger: logs.getLogger("mesh", "1.0.0")
- Batch processor: BatchLogRecordProcessor
- Implementation: `apps/mesh/src/observability/index.ts`

**Monitoring Dashboards:**
- Type: In-database dashboard definitions
- Storage: `apps/mesh/src/storage/monitoring-dashboards.ts`
- Use: Organization-scoped metrics visualization

**Debug Mode:**
- Activation: Query param `__d` or header `x-trace-debug-id`
- Behavior: Always samples traces when debug mode is active
- Response header: `x-trace-debug-id` (correlation ID)

## Event System

**Event Bus:**
- Type: Pub/sub event distribution system
- Storage: Database-backed subscriptions and event history
- Features: Async publish, subscription management, acknowledgment
- Implementation: `apps/mesh/src/event-bus/`
- Database support: PostgreSQL LISTEN/NOTIFY, SQLite polling

**SSE Hub (Server-Sent Events):**
- Type: Real-time push notifications
- Use: Live updates for Mesh clients (MCP notifications, tool results)
- Implementation: `apps/mesh/src/event-bus/sse-hub.ts`
- Endpoint: SSE streaming for connected clients

**Event Types:**
- MCP Tool Results: Results from executed tools
- Connection Updates: Connection state changes
- Organization Events: Member changes, settings updates
- Thread/Message Events: Conversation updates

## Code Execution & Sandboxing

**QuickJS Sandbox:**
- Service: JavaScript code execution in isolated WASM environment
- Libraries: @jitl/quickjs-wasmfile-release-sync, quickjs-emscripten-core
- Use: Plugin user-sandbox for safe code execution
- Implementation: `packages/mesh-plugin-user-sandbox/`

**Babel React Compiler:**
- Service: React code optimization
- Use: Runtime compilation and optimization of user React components
- Version: 1.0.0

## Encryption & Security

**Credential Vault:**
- Purpose: Secure storage and retrieval of connection credentials
- Implementation: `apps/mesh/src/encryption/credential-vault.ts`
- Storage: Database-backed encrypted storage
- Use: MCP connection secrets, API keys, auth tokens

**JWT Tokens:**
- Library: jose 6.0.11
- Use: OAuth tokens, proxy access tokens, session tokens
- Token lifetime: Configurable (default 5 minutes for proxy)
- Algorithm: HS256 or RS256 (configurable)

**HTML Sanitization:**
- Library: DOMPurify 3.3.1
- Use: Sanitize markdown/HTML content from user input

## CI/CD & Deployment

**Hosting Platforms:**
- Supported: Kubernetes, Deno Deploy, Cloudflare Workers (via bindings)
- Configuration: Platform-specific implementations in plugin system

**Kubernetes:**
- Deployment: Container with Bun runtime
- Network: Listens on 0.0.0.0 for pod discovery
- Health: idleTimeout disabled for long-lived SSE connections
- Environment: Kubernetes-native secret injection

**Deployment Artifacts:**
- Bundling: `bun run bundle` or `bun run build:server`
- Output: `dist/server/` directory
- Entry: `dist/server/server.js`

## GitHub Integration (Optional)

**GitHub App:**
- Purpose: Optional GitHub authentication via SSO
- Configuration: Via auth-config.json ssoConfig
- Implementation: Better Auth SSO plugin

## Deco CLI Integration

**Purpose:** Remote project management from CLI
- Package: deco-cli (workspace:*)
- Connection: Mesh API via OAuth/API keys
- Use: Deploy, configure, and manage Mesh projects from terminal

## API Documentation

**OpenAPI:**
- Generated via Better Auth openAPI plugin
- Endpoint: Auto-generated API schema (configurable)
- Purpose: API discovery and client generation

## Well-Known Collection Types

**Defined in `@decocms/bindings`:**
- Collections: Object storage, connections, LLM providers
- Well-known MCPs: Standard MCP implementations
- Assistants, Prompts, Workflows: Deco application frameworks

---

*Integration audit: 2026-02-14*
