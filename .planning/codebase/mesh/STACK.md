# Technology Stack - Mesh

**Analysis Date:** 2026-02-14

## Languages

**Primary:**
- TypeScript 5.9.3 - Primary language for all applications and packages
- JavaScript - Used alongside TypeScript via ESNext target

**Secondary:**
- TOML - Configuration format (smol-toml package)
- JSON - Configuration and type definitions

## Runtime

**Environment:**
- Node.js 24.0.0+ (required)
- Bun - Runtime and package manager for development/production

**Package Manager:**
- Bun (primary) - Monorepo management with bun.lock
- npm - Secondary for CLI tools and shadcn components
- Lockfile: `bun.lock` present

## Frameworks & Core Libraries

**Web Framework:**
- Hono 4.10.7 - Lightweight server framework for HTTP APIs and routing in `apps/mesh/src`
- Vite 7.2.1 - Build tool for client-side code in `apps/mesh`

**Frontend (Client):**
- React 19.2.0 - UI framework for web interface
- Preact - React compatibility layer (via jsxImportSource)
- TanStack React Query 5.90.11 - Data fetching and caching
- TanStack React Router 1.139.7 - Routing for SPA
- Zustand 5.0.9 - Client state management

**UI Components:**
- Radix UI - Headless component library (avatar, checkbox, dialog, dropdown, label, select, separator, slot, tabs)
- shadcn/ui - Built on Radix UI components (`packages/ui`)
- TailwindCSS 4.1.17 - Utility-first CSS framework
- DaisyUI - TailwindCSS component library (implicit via shadcn)
- Class Variance Authority 0.7.1 - CSS class management
- Lucide React 0.468.0 - Icon library

**Database & Storage:**
- Kysely 0.28.8 - Type-safe SQL query builder
- Kysely-Bun-Worker 0.6.0 - SQLite dialect for Bun
- PostgreSQL (pg 8.16.3) - Primary database option
- SQLite - Default/fallback database (via BunWorkerDialect)

**Authentication & Authorization:**
- Better Auth 1.4.5 - Modern auth framework with plugins
- @decocms/better-auth 1.5.17 - Custom Deco Better Auth fork
- @better-auth/sso 1.4.1 - SSO plugin for social authentication
- jose 6.0.11 - JWT handling

**AI/LLM Integration:**
- @ai-sdk/provider 3.0.0 - Provider-agnostic AI SDK interface
- @ai-sdk/react 3.0.1 - React hooks for AI interactions
- ai 6.0.1 - Vercel AI SDK for LLM APIs and streaming
- @modelcontextprotocol/sdk 1.26.0 - MCP (Model Context Protocol) SDK

**Editor & Content:**
- Tiptap 3.15.3 - Headless rich text editor (core, extensions, React bindings)
- Monaco Editor 4.7.0 - VS Code-based code editor for UI
- React Hook Form 7.66.0 - Form management
- React JSON Schema Form (@rjsf/core 6.1.2, @rjsf/shadcn 6.1.2) - JSON schema-based forms
- Marked 15.0.6 - Markdown parser
- React Markdown 10.1.0 - Markdown to React component renderer
- React Syntax Highlighter 15.6.1 - Code syntax highlighting
- Rehype Raw 7.0.0 - HTML in markdown

**Data Validation:**
- Zod 4.0.0 - Schema validation library
- Zod-from-JSON-Schema 0.5.2 - Convert JSON schema to Zod schemas
- @rjsf/validator-ajv8 6.1.2 - JSON schema validator

**Observability & Monitoring:**
- OpenTelemetry (multiple packages):
  - @opentelemetry/api 1.9.0 - Tracing API
  - @opentelemetry/api-logs 0.211.0 - Logging API
  - @opentelemetry/exporter-logs-otlp-proto 0.211.0 - OTLP log exporter
  - @opentelemetry/exporter-prometheus 0.208.0 - Prometheus metrics exporter
  - @opentelemetry/exporter-trace-otlp-proto 0.207.0 - OTLP trace exporter
  - @opentelemetry/instrumentation-runtime-node 0.24.0 - Node.js runtime instrumentation
  - @opentelemetry/sdk-logs 0.211.0 - Logs SDK
  - @opentelemetry/sdk-metrics 2.2.0 - Metrics SDK
  - @opentelemetry/sdk-node 0.207.0 - Node.js SDK
  - @opentelemetry/sdk-trace-base 2.5.0 - Tracing SDK

**Code Quality & Formatting:**
- Biome 2.2.5 - All-in-one linter and formatter
- Oxlint 1.23.0 - High-performance linter
- Knip 5.83.1 - Unused import detector
- TypeScript 5.9.3 - Type checking (tsc --noEmit)

**Testing:**
- Bun test - Native test runner (bun test)
- Puppeteer - Component testing framework

**Build & Bundling:**
- tsup - TypeScript bundler
- Babel React Compiler 1.0.0 - React optimization

**Utilities:**
- Croner 9.1.0 - Cron job scheduling
- Date-fns 4.1.0 - Date manipulation
- Input OTP 1.4.2 - OTP input component
- Nanoid 5.1.6 - Small unique string IDs
- DOMPurify 3.3.1 - HTML sanitization
- QuickJS (two variants) - JavaScript execution sandbox:
  - @jitl/quickjs-wasmfile-release-sync 0.31.0 - WASM-based JS engine
  - quickjs-emscripten-core 0.31.0 - Emscripten version
- Prettier 3.4.2 - Code formatter

**Plugin System:**
- Custom Mesh plugin architecture with workspace packages:
  - `mesh-plugin-object-storage` - File/blob storage plugin
  - `mesh-plugin-private-registry` - Private package registry
  - `mesh-plugin-reports` - Reporting and analytics
  - `mesh-plugin-user-sandbox` - User code execution sandbox
  - `mesh-plugin-workflows` - Workflow automation
  - `mesh-plugin-site-builder` - Site building plugin
  - `mesh-plugin-task-runner` - Task execution plugin

**CLI & Development:**
- deco-cli (workspace:*) - CLI for Deco project management
- Commander 12.0.0 - CLI framework
- Inquirer 9.2.15 - Interactive CLI prompts
- Chalk 5.3.0 - Terminal colors
- Concurrently 9.2.1 - Run multiple npm scripts concurrently

**DevOps & Deployment:**
- Cloudflare Workers - Target deployment platform
- @cloudflare/workers-types 4.20250617.0 - Type definitions
- Warp Node - Deco deployment utility

## Configuration

**Environment:**
- Loads from `.env` file (Bun --env-file)
- Config files: `config.json` and `auth-config.json` (optional, file-based)
- Path overrideable via `CONFIG_PATH` and `AUTH_CONFIG_PATH` env vars
- Critical env vars:
  - `DATABASE_URL` - Database connection (postgres:// or file://)
  - `PORT` - HTTP server port (default: 3000)
  - `DEBUG_PORT` - Debug server port (default: 9090)
  - `ENABLE_DEBUG_SERVER` - Enable internal debug server (false by default)
  - `NODE_ENV` - Environment (development/production/test)
  - `OTEL_SERVICE_NAME` - OpenTelemetry service name (default: "mesh")
  - `DATABASE_PG_SSL` - Enable SSL for PostgreSQL (false by default)
  - `DISABLE_RATE_LIMIT` - Disable auth rate limiting (development only)
  - `CONFIG_PATH` - Path to config.json
  - `AUTH_CONFIG_PATH` - Path to auth-config.json

**Build:**
- `tsconfig.json` - Strict TypeScript configuration
- `biome.json` - Formatting and linting config
- `.oxlintrc.json` - Oxlint configuration
- `vite.config.ts` - Vite bundler configuration
- `knip.jsonc` - Unused code detection
- `.npmrc` - NPM/package registry config
- `bun.lock` - Dependency lock file (Bun)

## Platforms & Runtimes

**Development:**
- Bun 1.x (primary runtime)
- Node.js 24+

**Production:**
- Bun runtime (containerized)
- Kubernetes-compatible (listens on 0.0.0.0, idleTimeout: 0 for long-lived SSE)
- Can run on Cloudflare Workers (via Worker bindings)
- Self-hostable on any infrastructure

---

*Stack analysis: 2026-02-14*
