# Technology Stack - Deco Framework

**Analysis Date:** 2026-02-14

## Languages

**Primary:**
- TypeScript - All source code
- TSX/JSX - Component definitions with `@jsxImportSource: preact`

**Secondary:**
- JavaScript - Generated code and build outputs

## Runtime

**Environment:**
- Deno 2.x - Primary runtime for server-side execution
- Node.js compatibility layer - For npm package ecosystem via JSR/npm imports

**Package Manager:**
- Deno (JSR/npm registry integration) - Primary dependency management
- Lockfile: Present (`deno.lock` auto-generated)

## Frameworks

**Core Framework:**
- Fresh 1.6.8 - Deno web framework via `$fresh/` scoped imports from `https://cdn.jsdelivr.net/gh/denoland/fresh@1.6.8/`
- Hono 4.5.4 (`@hono/hono@^4.5.4`) - HTTP server/routing layer via JSR

**UI:**
- Preact 10.23.1 - Client-side component framework (React-compatible)
- preact-render-to-string 6.4.0 - Server-side rendering for Preact components

**Observability:**
- OpenTelemetry 1.9.0 - Distributed tracing and metrics instrumentation
  - `@opentelemetry/api@1.9.0` - Core API
  - `@opentelemetry/sdk-trace-base@1.25.1` - Tracing implementation
  - `@opentelemetry/sdk-trace-node@1.25.1` - Node.js tracer provider
  - `@opentelemetry/exporter-trace-otlp-proto@0.52.1` - OTLP trace export
  - `@opentelemetry/instrumentation-fetch@0.52.1` - Fetch API instrumentation
  - `@opentelemetry/sdk-logs@0.52.1` - Logging integration
  - `@opentelemetry/exporter-logs-otlp-http@0.52.1` - Log export

**Development/Build:**
- esbuild - Code bundling (via node_modules)
- TypeScript - Type checking and compilation

## Key Dependencies

**Critical:**
- `@deco/durable@^0.5.3` - Durable state management
- `@deco/warp@^0.3.8` - Performance/caching utilities
- `@deco/deno-ast-wasm@^0.5.5` - AST parsing for TypeScript code analysis
- `@deco/codemod-toolkit@^0.3.4` - Code transformation utilities
- `@deco/inspect-vscode@0.2.1` - VSCode debugging integration

**Infrastructure:**
- `@redis/client@^1.6.0` - Redis caching support (optional, conditional)
- `simple-git@^3.25.0` - Git operations and repository management

**Standards & Encoding:**
- `@std/http@^1.0.0` - Standard HTTP utilities (cookies, headers)
- `@std/crypto@1.0.0-rc.1` - Cryptographic operations
- `@std/encoding@^1.0.0-rc.1` - Data encoding/decoding
- `@std/fmt@^0.225.3` - Formatting utilities
- `@std/fs@^0.229.1` - Filesystem operations
- `@std/path@^0.225.2` - Path manipulation
- `@std/log@^0.224.5` - Logging
- `@std/async@^0.224.1` - Async utilities
- `@std/streams@^1.0.0` - Stream operations
- `@std/cli@^1.0.3` - CLI argument parsing
- `@std/datetime@^0.224.0` - Date/time utilities
- `@std/testing@^1.0.0` - Test assertions

**JWT & Security:**
- `@zaubrik/djwt@^3.0.2` - JWT creation and verification
- `@core/asyncutil@^1.0.2` - Async utilities

**JSON & Type Utilities:**
- `fast-json-patch@^3.1.1` - JSON patching operations
- `utility-types@3.10.0` - TypeScript utility types
- `@types/json-schema@7.0.11` - JSON Schema type definitions

**CLI & Tools:**
- `@cliffy/prompt@^1.0.0-rc.5` - Interactive CLI prompts
- `@deco/codemod-toolkit@^0.3.4` - Code transformation

**Caching & Performance:**
- `weak-lru-cache@1.0.0` - In-memory LRU caching

**Third-Party Scripts:**
- `partytown@0.3.0` - Third-party script isolation (from `https://deno.land/x/partytown@0.3.0/`)

## Configuration

**Environment:**
Environment variables control runtime behavior:
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OpenTelemetry export endpoint
- `LOADER_CACHE_REDIS_URL` - Redis cache connection string
- `LOADER_CACHE_REDIS_TTL_SECONDS` - Redis cache TTL (default: 3600)
- `CACHE_MAX_AGE_S` - HTTP cache max age in seconds (default: 60)
- `ENABLE_LOADER_CACHE` - Enable data loader caching (default: true)
- `WEB_CACHE_ENGINE` - Comma-separated list of cache engines to use
- `CACHE_MAX_SIZE` / `MAX_CACHE_SIZE` - LRU cache size limit
- `FILE_SYSTEM_CACHE_DIRECTORY` - Filesystem cache location (default: `/tmp/deco_cache`)
- `DECO_RELOAD_TOKEN` - Token for reload endpoint
- `DECO_ADMIN_PUBLIC_KEY` - Admin JWT verification key
- `DURABLE_TOKEN` - Token for durable state backend
- `DECO_TUNNEL_SERVER_TOKEN` - Tunnel server authentication
- `GITHUB_APP_KEY` - GitHub App private key
- `DENO_REGION` - Cloud region identifier
- `DECO_ENV_NAME` - Environment name for tagging
- `DENO_DEPLOYMENT_ID` - Deno Deploy deployment identifier
- `DECO_PREVIEW` - Preview mode flag
- `K_SERVICE` - Knative service name (Kubernetes indicator)
- `SOURCE_ASSET_PATH` - Source asset path for persistence

**Build:**
- `deno.json` - Deno configuration with:
  - Import scopes mapping external CDN resources
  - JSR/npm registry configuration
  - TypeScript compiler options (jsx: react-jsx, jsxImportSource: preact)
  - Task definitions for build, test, and development commands

## Platform Requirements

**Development:**
- Deno 2.x runtime
- TypeScript support via Deno
- Network access for:
  - JSR registry (jsr.io)
  - npm registry (npm.org)
  - CDN (cdn.jsdelivr.net)
  - Deno Land (deno.land)

**Production:**
- Deno Deploy (primary target) - Requires `DENO_DEPLOYMENT_ID`
- Kubernetes/Knative - Requires `K_SERVICE` variable
- Redis (optional) - For distributed caching via `@redis/client`
- OpenTelemetry collector - For observability export

**Deployment Targets:**
- Deno Deploy (`denodeploy`)
- Kubernetes (`kubernetes`)
- Localhost/Development (`localhost`)

---

*Stack analysis: 2026-02-14*
