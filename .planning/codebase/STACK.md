# Technology Stack

**Analysis Date:** 2026-02-01

## Languages

**Primary:**
- TypeScript 5.9.3 - Full codebase, both frontend and backend
- React 19.2.0 - Web UI and component library

**Secondary:**
- JavaScript/JSX - Build scripts and configuration files
- CSS/Tailwind CSS - Styling and utility-first framework

## Runtime

**Environment:**
- Bun (primary) - Package manager and runtime for development and production
- Node.js >=24.0.0 - Required by package.json engines field
- Vercel NFT v1.1.1 - Used for bundle analysis during builds

**Package Manager:**
- Bun - Primary package manager
- Lockfile: `bun.lock` (present)
- NPM registry compatibility with JSR registry support (`@jsr:registry=https://npm.jsr.io`)

## Frameworks

**Core:**
- Hono 4.10.7 - HTTP server/API framework (TypeScript-first, edge-ready)
- Better Auth 1.4.5 - Authentication and authorization framework with SSO support
- React Router 1.139.7 - Client-side routing and navigation
- Vite 7.2.1 - Frontend build tool with hot module replacement

**UI & Components:**
- Radix UI (multiple packages) - Headless UI components library
  - `@radix-ui/react-dialog` 1.1.15 - Modal dialogs
  - `@radix-ui/react-dropdown-menu` 2.1.16 - Dropdown menus
  - `@radix-ui/react-tabs` 1.1.13 - Tab components
  - `@radix-ui/react-select` 2.2.6 - Select components
  - `@radix-ui/react-avatar` 1.1.10 - Avatar components
  - `@radix-ui/react-checkbox` 1.3.3 - Checkbox inputs
  - `@radix-ui/react-label` 2.1.7 - Form labels
  - `@radix-ui/react-separator` 1.1.7 - Visual separators
  - `@radix-ui/react-slot` 1.2.3 - Slot composition pattern
- TailwindCSS 4.1.17 - Utility-first CSS framework
- `@tailwindcss/vite` 4.1.17 - Vite integration for Tailwind
- Shadow CN UI patterns - Component library patterns using Radix and Tailwind

**Form & State:**
- React Hook Form 7.66.0 - Performant, flexible form library
- Zod 4.0.0 - TypeScript-first schema validation
- TanStack React Query 5.90.11 - Server state management
- Zustand 5.0.9 - Lightweight client state management

**Editor & Rich Text:**
- Monaco Editor (@monaco-editor/react) 4.7.0 - Code editor component
- Tiptap 3.15.3 - Headless rich text editor
  - Core, React plugin, Starter Kit
  - Extensions: mention, placeholder
  - Prosemirror (PM) integration
- React Syntax Highlighter 15.6.1 - Code syntax highlighting

**Markdown & Documentation:**
- Marked 15.0.6 - Markdown parser
- React Markdown 9.0.0 - React component for rendering markdown
- Remark GFM 4.0.0 - GitHub Flavored Markdown plugin
- Rehype Raw 7.0.0 - Parse raw HTML in markdown

**Data Visualization:**
- Recharts 3.6.0 - Composable charting library

**Utilities:**
- Class Variance Authority 0.7.1 - Type-safe CSS class composition
- CLSX 2.1.1 - Conditional CSS class utility
- Date-fns 4.1.0 - Date manipulation utilities
- Tailwind Merge 3.3.1 - Merge Tailwind CSS classes intelligently
- Input OTP 1.4.2 - OTP/PIN input component

**Notifications & Toasts:**
- Sonner 2.0.7 - Toast notifications library
- React Day Picker 8.10.1 - Date picker component

**Other:**
- Jose 6.0.11 - JWT handling
- Nanoid 5.1.6 - Unique ID generator
- Shell-quote 1.8.3 - Shell command quoting utility
- Pathe 2.0.3 - Path utilities

## Testing

**Test Runners:**
- Bun Test (built-in) - Unit and integration testing
- Playwright 1.58.1 - Browser-based end-to-end testing
  - @playwright/test 1.58.1 - Test framework
  - Runner: `bunx playwright test`

## Build & Development

**Build Tools:**
- Vite 7.2.1 - Frontend bundler with ES module support
- Vite TSConfig Paths 5.1.4 - Path alias resolution in Vite
- @vitejs/plugin-react 5.1.0 - React plugin for Vite
- Babel Plugin React Compiler 1.0.0 - React compiler for optimization

**Code Quality:**
- Biome 2.2.5 - Formatter, linter, and code quality tool
  - Configuration: `biome.json` at root
  - Formatting: 2-space indentation, double quotes
  - GIT-aware file ignoring
- TypeScript 5.9.3 - Static type checking
  - Command: `bun run check` (tsc --noEmit)
- OxLint 1.23.0 - Fast JavaScript linter (Rust-based)
- Knip 5.73.4 - Unused files and dependencies finder

**Development Utilities:**
- Concurrently 9.2.1 - Run multiple commands in parallel
- Prettier 3.4.2 - Code formatter
- Vite Tsconfig Paths 5.1.4 - Absolute path imports
- Tree-kill 1.2.2 - Process tree termination utility

## Database & ORM

**Primary:**
- Kysely 0.28.8 - Fully type-safe SQL query builder for TypeScript
- Kysely Bun Worker 0.6.0 - Bun integration for Kysely

**Supported Databases:**
- SQLite (default) - Lightweight, file-based with BunWorkerDialect
- PostgreSQL - Production-grade relational database with pg driver
- Connection: Automatic detection via `DATABASE_URL` environment variable

**ORM Driver:**
- pg 8.16.3 - PostgreSQL client library

**Migrations:**
- Better Auth CLI - Handles auth schema migrations

## Key Dependencies

**Critical:**
- @modelcontextprotocol/sdk 1.25.3 - MCP (Model Context Protocol) SDK for client/server implementations
- @ai-sdk/provider 3.0.0 - AI model provider abstraction
- @ai-sdk/react 3.0.1 - React hooks for AI SDK (streaming)
- ai 6.0.1 - Core SDK for AI models (OpenAI, Anthropic, etc.)
- Better Auth plugins (1.4.5-1.5.17) - Auth plugins for SSO, JWT, API keys, etc.
- @decocms/better-auth 1.5.17 - Custom Better Auth plugins for mesh
- @decocms/bindings 1.1.1 - Type-safe capability bindings

**Infrastructure & Observability:**
- @opentelemetry/api 1.9.0 - OpenTelemetry tracing API
- @opentelemetry/sdk-trace-base 2.5.0 - Tracing implementation
- @opentelemetry/sdk-metrics 2.2.0 - Metrics collection
- @opentelemetry/sdk-logs 0.211.0 - Logs collection
- @opentelemetry/sdk-node 0.207.0 - Node.js SDK
- @opentelemetry/exporter-trace-otlp-proto 0.207.0 - OTLP trace exporter
- @opentelemetry/exporter-logs-otlp-proto 0.211.0 - OTLP logs exporter
- @opentelemetry/exporter-prometheus 0.208.0 - Prometheus metrics exporter
- @opentelemetry/instrumentation-runtime-node 0.24.0 - Node runtime metrics

**Sandbox & Runtime:**
- @jitl/quickjs-wasmfile-release-sync 0.31.0 - QuickJS JavaScript engine (WASM)
- quickjs-emscripten-core 0.31.0 - QuickJS Emscripten binding

**Email:**
- Resend (custom implementation) - Email delivery via Resend API
- SendGrid (custom implementation) - Email delivery via SendGrid API

**SSO & OAuth:**
- @better-auth/sso 1.4.1 - SSO provider integration (OIDC)
- @daveyplate/better-auth-ui 3.2.7 - UI components for Better Auth

**Schema Validation:**
- Zod 4.0.0 - Runtime type validation
- Zod to JSON Schema 3.25.0 - Converts Zod schemas to JSON Schema
- @rjsf/core 6.1.2 - React JSON Schema Form
- @rjsf/shadcn 6.1.2 - Shadcn UI integration
- @rjsf/validator-ajv8 6.1.2 - AJV validator
- ajv 8.17.1 - JSON Schema validator

**Scheduling:**
- Croner 9.1.0 - Cron job scheduling

**Workspace Packages:**
- @deco/ui - Custom UI component library
- @decocms/vite-plugin - Custom Vite plugin
- @decocms/runtime - Runtime utilities and asset handling
- @decocms/mesh-sdk - SDK for mesh integration

## Configuration Files

**Format & Linting:**
- `biome.json` - Biome formatter/linter config
- `.prettierrc` - Prettier configuration
- `.oxlintrc.json` - OxLint configuration
- `tsconfig.json` - TypeScript configuration
- `.npmrc` - NPM configuration (JSR registry)

**Build & Runtime:**
- `vite.config.ts` - Vite build configuration
- `vite-tsconfig-paths.config.ts` - Path alias resolution

**Authentication:**
- `config.json` - Optional mesh configuration file
- `auth-config.json` - Better Auth configuration (optional)
- Loaded via `CONFIG_PATH` and `AUTH_CONFIG_PATH` env vars

## Environment Variables

**Core:**
- `NODE_ENV` - Environment mode (development/production)
- `PORT` - Server port (default: 3000)
- `BASE_URL` - Base URL for the mesh (default: http://localhost:3000)
- `DEBUG_PORT` - Debug server port (default: 9090)
- `ENABLE_DEBUG_SERVER` - Enable internal debug server

**Database:**
- `DATABASE_URL` - Connection string (default: file:./data/mesh.db)
  - Supports: `postgres://`, `postgresql://`, `sqlite://`, `file://`, `:memory:`
- `DATABASE_PG_SSL` - Enable SSL for PostgreSQL connections (true/false)

**Configuration Paths:**
- `CONFIG_PATH` - Path to config.json (default: ./config.json)
- `AUTH_CONFIG_PATH` - Path to auth-config.json (default: ./auth-config.json)

**Email Providers** (configured in auth-config.json):
- Resend API key and sender email
- SendGrid API key and sender email

**Authentication:**
- JWT_SECRET - Secret for JWT signing (optional, can be generated)
- OAuth provider credentials for SSO (Microsoft, etc.)

**Observability:**
- OTEL_EXPORTER_OTLP_ENDPOINT - OpenTelemetry collector endpoint
- OTEL_EXPORTER_OTLP_PROTOCOL - Protocol (proto, json, grpc)
- OTEL_SERVICE_NAME - Service name for traces

## Platform Requirements

**Development:**
- Bun >=1.0.0 (recommended)
- Node.js >=24.0.0
- TypeScript >=5.9.3
- Git (for VCS integration)

**Production:**
- Bun or Node.js >=24.0.0
- PostgreSQL or SQLite database
- Email provider account (Resend/SendGrid) for email features
- OpenTelemetry collector (optional, for observability)

**Deployment Targets:**
- Docker (Dockerfile support expected)
- Kubernetes (listens on 0.0.0.0, configurable via env)
- Traditional VPS/servers
- Serverless (with considerations for long-running connections)
- Deco.page (proprietary platform)

---

*Stack analysis: 2026-02-01*
