# External Integrations - Deco Framework

**Analysis Date:** 2026-02-14

## APIs & External Services

**GitHub:**
- Git repository integration for managing site source code
  - SDK/Client: `simple-git@^3.25.0`
  - Located in: `daemon/git.ts`
  - Auth: `GITHUB_APP_KEY` environment variable
  - Operations: Clone, pull, push, diff, merge-base operations
  - URL pattern: `https://github.com/deco-sites/{site}.git`

**Deno Deploy:**
- Deployment and site hosting platform
  - Auth: `DECO_DENO_ORG_ID`, `DECO_DENO_TOKEN`
  - Identifier: `DENO_DEPLOYMENT_ID` environment variable
  - Used for: Site deployment, version management, region routing

**Third-Party Scripts (Partytown):**
- Script isolation and sandboxing
  - SDK: `partytown@0.3.0` (from `https://deno.land/x/partytown@0.3.0/`)
  - Used for: Loading tracking scripts, analytics, ads in isolated context
  - Located in: `hooks/useSection.ts` references CloudFlare APO query parameters

## Data Storage

**Caching Systems:**
- Redis (optional, conditional)
  - Connection: `LOADER_CACHE_REDIS_URL` environment variable
  - Client: `@redis/client@^1.6.0`
  - Purpose: Distributed data loader result caching
  - Configuration: Located in `runtime/caches/redis.ts`
  - TTL control: `LOADER_CACHE_REDIS_TTL_SECONDS` (default 3600s)
  - Operation timeout: 500ms per command
  - Connection timeout: 500ms

- In-Memory LRU Cache (primary fallback)
  - Client: `weak-lru-cache@1.0.0`
  - Located in: `runtime/caches/lrucache.ts`
  - Size limit: Configurable via `CACHE_MAX_SIZE` or `MAX_CACHE_SIZE`
  - TTL auto-purge: Controlled by `CACHE_TTL_AUTOPURGE` environment variable

- Filesystem Cache (fallback)
  - Located in: `runtime/caches/fileSystem.ts`
  - Directory: `FILE_SYSTEM_CACHE_DIRECTORY` (default: `/tmp/deco_cache`)

- Header-Based Cache (HTTP cache control)
  - Located in: `runtime/caches/headerscache.ts`
  - TTL: `CACHE_MAX_AGE_S` (default 60 seconds)

**Cache Management:**
- Multi-engine cache support via `WEB_CACHE_ENGINE` comma-separated list
- Cache abstraction layer: `runtime/caches/mod.ts`
- Loader cache behavior: `runtime/caches/tiered.ts`
- Configurable: `ENABLE_LOADER_CACHE` (default: true)

**Durable State:**
- Service: `@deco/durable@^0.5.3`
- Located in: `commons/workflows/initialize.ts`
- Auth: `DURABLE_TOKEN` environment variable
- Purpose: Persistent state for workflows and async operations

## Authentication & Identity

**Auth Provider:**
- Custom JWT implementation
  - Library: `@zaubrik/djwt@^3.0.2`
  - Verification: Admin public key from `DECO_ADMIN_PUBLIC_KEY`
  - Located in: `commons/jwt/keys.ts`, `commons/jwt/trusted.ts`
  - Implementation: RSA key-based JWT validation

**GitHub App Auth:**
- GitHub App authentication for git operations
  - Private key: `GITHUB_APP_KEY` environment variable
  - Used in: `daemon/git.ts` for repository authentication
  - Token fetching: Via admin endpoints for package access

## Monitoring & Observability

**Error Tracking & Observability:**
- OpenTelemetry Protocol (OTLP)
  - Export endpoint: `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable
  - Trace exporter: `@opentelemetry/exporter-trace-otlp-proto@0.52.1`
  - Log exporter: `@opentelemetry/exporter-logs-otlp-http@0.52.1`
  - Metric exporter: `@opentelemetry/exporter-metrics-otlp-http@0.52.1`
  - Located in: `observability/otel/config.ts`

**Instrumentation:**
- Fetch API calls: `@opentelemetry/instrumentation-fetch@0.52.1`
- Deno runtime: Custom `DenoRuntimeInstrumentation` in `observability/otel/instrumentation/deno-runtime.ts`
- Span sampling: URL-based and debug sampling in `observability/otel/samplers/`

**Logging:**
- Console logging for development
- OpenTelemetry logging when `OTEL_IS_ENABLED`
- Logger: `observability/otel/logger.ts` with OpenTelemetryHandler
- Log level mapping: Standard Severity numbers via `@opentelemetry/api-logs@0.52.1`

**Tracing Attributes:**
- CloudFlare headers tracked: Cf-Ray, Cf-Cache-Status, X-Origin-Cf-Cache-Status, X-Vtex-Io-Cluster-Id, X-Edge-Cache-Status
- Service resource attributes: Name, version, instance ID, cloud provider, region, deployment environment
- Sampling configuration: Base64-encoded `OTEL_SAMPLING_CONFIG` environment variable

## CI/CD & Deployment

**Hosting:**
- Deno Deploy (primary)
- Kubernetes/Knative (via `K_SERVICE` environment variable)
- Development/localhost

**CI Pipeline:**
- GitHub Actions integration via `simple-git` client
- Repository operations: Clone, pull, push, diff operations
- Automatic asset persistence: `SOURCE_ASSET_PATH` and `DENO_DEPLOYMENT_ID` control versioning

**VSCode Integration:**
- Debug support via `@deco/inspect-vscode@0.2.1`
- DOM inspection for development

## Environment Configuration

**Required env vars:**
- `DECO_RELOAD_TOKEN` - For reload endpoint security
- `OTEL_EXPORTER_OTLP_ENDPOINT` - For tracing export (if OTEL enabled)
- `LOADER_CACHE_REDIS_URL` - For Redis caching (if using Redis engine)
- `GITHUB_APP_KEY` - For Git operations

**Optional env vars:**
- `DENO_DEPLOYMENT_ID` - Indicates Deno Deploy environment
- `K_SERVICE` - Indicates Kubernetes environment
- `DECO_PREVIEW` - Enable preview mode
- `DECO_ENV_NAME` - Environment name tagging
- `DENO_REGION` - Cloud region for resource attributes

**Secrets location:**
- Environment variables only (no secrets file)
- GitHub App key: `GITHUB_APP_KEY`
- Admin JWT key: `DECO_ADMIN_PUBLIC_KEY`
- Durable token: `DURABLE_TOKEN`
- Tunnel server token: `DECO_TUNNEL_SERVER_TOKEN`

## Webhooks & Callbacks

**Incoming:**
- `/live/invoke/{moduleId}` - Invocation endpoint for loaders, actions, functions
  - Supports JSON, form-data, search-params, and URL-encoded request bodies
  - Located in: `runtime/routes/invoke.ts`

- `/live/invoke/**` - Batch invocation via POST
  - Located in: `runtime/routes/batchInvoke.ts`
  - Returns: AsyncIterableIterator for streaming responses

- `/live/previews/**` - Live preview rendering
  - Located in: `runtime/routes/previews.tsx`

- `/live/release` - Release/versioning endpoint
  - Located in: `runtime/routes/release.ts`

- `/live/reload` - Reload trigger endpoint
  - Auth: `DECO_RELOAD_TOKEN`
  - Located in: `runtime/routes/reload.ts`

**Outgoing:**
- None detected in codebase analysis
- Git push operations: To remote repositories (GitHub)

## Block Execution & Invocation

**Loader Blocks:**
- Server-side data fetchers
- Located in: `blocks/loader.ts`
- Caching: Integrated with tiered cache system
- Single-flight deduplication: Configurable via `CACHE_SINGLEFLIGHT_DISABLED`
- Response caching: Max age via `CACHE_MAX_AGE_S`

**Action Blocks:**
- Server-side mutations
- Located in: `blocks/action.ts`
- Response: Can return `AsyncIterableIterator<Step>` for progress tracking

**Function Blocks:**
- Pure functions for computation
- Located in: `blocks/function.ts`

**Section/Component Blocks:**
- UI components for rendering
- Located in: `blocks/section.ts`
- Framework support: Fresh and HTMX

**Handler Blocks:**
- HTTP request handlers
- Located in: `blocks/handler.ts`
- Context: Full HTTP context with state access

---

*Integration audit: 2026-02-14*
