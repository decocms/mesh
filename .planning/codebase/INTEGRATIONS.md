# External Integrations

**Analysis Date:** 2026-02-01

## APIs & External Services

**AI Model Providers:**
- Anthropic - Claude models (integrated via @ai-sdk/provider)
  - Supported models visible in `apps/mesh/src/web/components/chat/select-model.tsx`
  - Examples: `anthropic/claude-sonnet-4.5`, `anthropic/claude-opus-4.5`
- OpenAI - GPT models (via @ai-sdk/provider)
- Groq - Fast LLM inference
- Replicate - Model API platform
- Cohere - LLM platform
- Other providers available through @ai-sdk/provider abstraction

**Email Services:**
- Resend (https://api.resend.com/emails)
  - Implementation: `apps/mesh/src/auth/known-email-providers.ts`
  - Configuration: API key + sender email in auth-config.json
  - Used for: Magic link authentication, organization invitations

- SendGrid (https://api.sendgrid.com/v3/mail/send)
  - Implementation: `apps/mesh/src/auth/known-email-providers.ts`
  - Configuration: API key + sender email in auth-config.json
  - Used for: Magic link authentication, organization invitations

**Authentication & SSO:**
- Microsoft Azure AD / Entra ID
  - OIDC configuration in `apps/mesh/src/auth/sso.ts`
  - Discovery endpoint: `https://login.microsoftonline.com/{TENANT_ID}/v2.0/.well-known/openid-configuration`
  - Requires: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET environment variables
  - OAuth 2.0 + PKCE support

**OAuth 2.1 Protocol:**
- Better Auth provides OAuth 2.1 server implementation
- API Key management plugin
- Token refresh via `apps/mesh/src/oauth/token-refresh.ts`
- LISTEN/NOTIFY support for PostgreSQL event propagation
  - Location: `apps/mesh/src/database/index.ts` (Pool management)

## Data Storage

**Databases:**
- SQLite (default)
  - BunWorkerDialect integration via `kysely-bun-worker`
  - File location: `./data/mesh.db` (default)
  - Features: WAL mode, foreign keys enforcement, busy timeout
  - Configuration: `apps/mesh/src/database/index.ts`

- PostgreSQL (production)
  - Driver: `pg` (node-postgres) v8.16.3
  - Connection pooling with configurable max connections (default: 10)
  - Features: Keep-alive, idle timeout (5 min), connection timeout (30s)
  - SSL support via `DATABASE_PG_SSL=true`
  - LISTEN/NOTIFY support for event bus
  - Configuration: `apps/mesh/src/database/index.ts`

**Connection:**
- Environment variable: `DATABASE_URL`
- Auto-detection of dialect from connection string protocol
- Connection pooling with optimized defaults for cross-region deployments
- Slow query logging (threshold: 400ms) with OpenTelemetry metrics

**ORM:**
- Kysely 0.28.8 - Type-safe SQL query builder
- Schema types: `apps/mesh/src/storage/types.ts`

**File Storage:**
- Local filesystem for SQLite databases
- Object storage plugin available: `packages/mesh-plugin-object-storage`
- S3-compatible storage expected (implementation in plugin)

**Caching:**
- Not detected in core codebase
- Event-driven updates via EventBus (pub/sub)

## Authentication & Identity

**Auth Provider:**
- Better Auth 1.4.5 - Self-hosted authentication framework
  - Configuration: `apps/mesh/src/auth/index.ts`
  - Email & password authentication (enabled by default)
  - SSO via OIDC (Microsoft, extensible)
  - Magic link authentication via email providers
  - API Key management for programmatic access
  - JWT-based sessions with configurable secret
  - Organization/multi-tenancy support

**Role-Based Access Control (RBAC):**
- Fine-grained access control via Better Auth plugins
  - Admin plugin: `@decocms/better-auth/plugins/access`
  - Organization plugin: `@decocms/better-auth/plugins`
  - Custom role creation with statement-based permissions
  - Location: `apps/mesh/src/auth/roles.ts`

**Session Management:**
- JWT tokens with refresh capability
- Configuration location: `apps/mesh/src/auth/jwt.ts`

**Credential Storage:**
- CredentialVault for encrypted secret storage
  - Location: `apps/mesh/src/encryption/credential-vault.ts`
  - Used for OAuth tokens, API keys, connection credentials

## Monitoring & Observability

**OpenTelemetry (Full Stack):**
- Tracing: `@opentelemetry/sdk-trace-base` 2.5.0
- Metrics: `@opentelemetry/sdk-metrics` 2.2.0
- Logs: `@opentelemetry/sdk-logs` 0.211.0
- Node SDK: `@opentelemetry/sdk-node` 0.207.0

**Exporters:**
- OTLP Trace Exporter (gRPC + protobuf): `@opentelemetry/exporter-trace-otlp-proto`
- OTLP Logs Exporter (gRPC + protobuf): `@opentelemetry/exporter-logs-otlp-proto`
- Prometheus Metrics Exporter: `@opentelemetry/exporter-prometheus` 0.208.0

**Instrumentations:**
- Runtime metrics: `@opentelemetry/instrumentation-runtime-node`
- Fetch API tracing: `apps/mesh/src/observability/instrumentations/fetch.ts`

**Metrics Collection:**
- Database query duration (histogram)
- Request timing middleware (Hono timing)
- Prometheus metrics endpoint (format available)

**Logs:**
- OpenTelemetry-integrated logging
- Structured logging via OTLP exporter
- Configuration: `apps/mesh/src/core/config.ts` MonitoringConfig

**Sampling:**
- Debug sampler with correlation ID tracking
- 10% head-based sampling by default (configurable)
- Debug mode via `__d` query parameter or `x-trace-debug-id` header
- Location: `apps/mesh/src/observability/index.ts`

**Error Tracking:**
- No dedicated error tracking service detected (Sentry, Datadog not in deps)
- OpenTelemetry-based error propagation available
- Structured error logging in database operations

## CI/CD & Deployment

**Hosting:**
- Self-hosted capable (Docker, VPS, Kubernetes)
- Deco.page (proprietary Deco platform)
- Listens on 0.0.0.0 hostname for Kubernetes compatibility
- Environment-based configuration (no hardcoded endpoints)

**CI Pipeline:**
- Not detected (likely GitHub Actions based on .github/ directory)
- Test commands: `bun test` (unit), `bun test:e2e` (Playwright)

**Build Process:**
- `bun run build:client` - Vite build for frontend
- `bun run build:server` - Bundle server using esbuild-based bundler
- Output: `dist/` directory with CLI binary at `dist/server/cli.js`

**Docker:**
- `.dockerignore` file present (indicates Docker support)
- Node.js >=24.0.0 compatible
- Port: 3000 (configurable via PORT env var)

**Deployment Considerations:**
- Hot reload capability in development (`NODE_ENV=development` + `bun --hot`)
- Asset handler for both dev proxy and production static files
- Database migrations: `bun run migrate` or `bun run db:migrate`
- Authentication migrations: `bun run better-auth:migrate`

## Environment Configuration

**Required environment variables:**
- `DATABASE_URL` - Database connection string
  - Format: `postgres://user:pass@host/db` or `file:./path/to/db.sqlite`
  - Default: `file:./data/mesh.db` (SQLite)

- `PORT` - HTTP server port (default: 3000)
- `BASE_URL` - Public URL of the mesh (for OAuth redirects, etc.)

**Optional environment variables:**
- `NODE_ENV` - development or production
- `DEBUG_PORT` - Debug server port (default: 9090)
- `ENABLE_DEBUG_SERVER` - Set to "true" to enable debug endpoint
- `DATABASE_PG_SSL` - Set to "true" for PostgreSQL SSL
- `CONFIG_PATH` - Custom path to config.json
- `AUTH_CONFIG_PATH` - Custom path to auth-config.json

**Email Provider Secrets** (in auth-config.json):
- For Resend: API key, sender email
- For SendGrid: API key, sender email

**SSO Secrets** (in auth-config.json):
- Microsoft: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET

**OpenTelemetry Secrets**:
- `OTEL_EXPORTER_OTLP_ENDPOINT` - Collector endpoint
- `OTEL_EXPORTER_OTLP_PROTOCOL` - Protocol selection (proto/json/grpc)

**Secrets location:**
- `config.json` and `auth-config.json` files (file-based, not env vars for auth)
- Environment variables for OpenTelemetry and database
- `.env` file support via Bun's `--env-file` flag

## Webhooks & Callbacks

**Incoming Webhooks:**
- OAuth redirect endpoints (built-in to Better Auth)
- Event bus for internal pub/sub: `apps/mesh/src/event-bus/`

**Outgoing Webhooks:**
- Not detected in core (expected in plugin implementations)
- Event bus can trigger scheduled/cron-based deliveries
- LISTEN/NOTIFY via PostgreSQL for real-time propagation

**Event System:**
- Custom EventBus implementation
  - Location: `apps/mesh/src/event-bus/`
  - Features: Pub/sub, at-least-once delivery guarantees
  - Scheduled delivery with cron support
  - Configuration stored in database

## External MCP Servers

**MCP Proxy Layer:**
- Outbound MCP client connections with token vault
  - Location: `apps/mesh/src/mcp-clients/outbound/`
  - Features: OAuth token refresh, credential injection
  - Header customization: `apps/mesh/src/mcp-clients/outbound/headers.ts`

**Virtual MCP:**
- In-process MCP server for tool composition
  - Location: `apps/mesh/src/mcp-clients/virtual-mcp/`
  - Exposes tools through MCP protocol

**Supported Upstream Services:**
- Any MCP server via HTTP/SSE
- Registry/Store connections to Deco Store
  - Environment constant: `DECO_STORE_URL`
  - Deco-hosted MCP detection: `isDecoHostedMcp()` in `apps/mesh/src/core/deco-constants.ts`

## Code Execution & Sandbox

**JavaScript Runtime:**
- QuickJS (WASM-based) via `@jitl/quickjs-wasmfile-release-sync`
- User sandbox plugin: `packages/mesh-plugin-user-sandbox`
- Server-side sandbox: `apps/mesh/src/sandbox/`
  - Built-in utilities: `apps/mesh/src/sandbox/builtins/`

**Cloudflare Workers:**
- Sandbox plugin available: `packages/cf-sandbox`
- Expected for edge function execution

## Developer Experience

**CLI & Tools:**
- Deco CLI: `deco-cli` workspace dependency
  - Used for: Linking, development workflows
  - Command: `bun run link` - Start dev server with Deco link

**Type Safety:**
- Full TypeScript codebase with strict checking
- Zod runtime validation for configuration

**Development Server:**
- Concurrent client (Vite) and server (Bun with hot reload)
- Command: `bun run dev` (runs migrations first)

---

*Integration audit: 2026-02-01*
