# Codebase Structure

**Analysis Date:** 2026-02-14

## Directory Layout

```
/Users/guilherme/Projects/mesh/
├── apps/                           # Application workspaces
│   ├── mesh/                       # Main MCP Mesh app (full-stack)
│   │   ├── src/
│   │   │   ├── api/                # HTTP routes & middleware
│   │   │   ├── auth/               # Better Auth setup & JWT
│   │   │   ├── core/               # MeshContext, ContextFactory, AccessControl, tools
│   │   │   ├── tools/              # MCP tool definitions by domain
│   │   │   ├── storage/            # Kysely ORM adapters (per entity type)
│   │   │   ├── database/           # Database factory (SQLite/PostgreSQL)
│   │   │   ├── mcp-clients/        # MCP client factories & decorators
│   │   │   ├── event-bus/          # Pub/sub event queue system
│   │   │   ├── encryption/         # Credential vault
│   │   │   ├── observability/      # OpenTelemetry setup
│   │   │   ├── web/                # React 19 admin UI
│   │   │   ├── sandbox/            # Code execution sandbox
│   │   │   ├── oauth/              # OAuth proxy helpers
│   │   │   ├── monitoring/         # Monitoring aggregation
│   │   │   ├── shared/             # Shared utilities
│   │   │   └── index.ts            # Server entry point
│   │   ├── migrations/             # Kysely database migrations
│   │   ├── vite.config.ts          # Vite config for UI bundling
│   │   └── package.json
│   ├── docs/                       # Astro documentation site
│   ├── api/                        # Legacy API (deprecated)
│   ├── benchmark/                  # Performance benchmarking
│   ├── studio/                     # Studio app
│   ├── web/                        # Web app
│   └── outbound/                   # Outbound integrations
│
└── packages/                       # Shared packages
    ├── mesh-sdk/                   # Public SDK types & utilities
    ├── bindings/                   # MCP binding abstractions
    ├── runtime/                    # Shared runtime utilities (proxy, OAuth, assets)
    ├── ui/                         # shadcn-based React components
    ├── cli/                        # CLI tooling (deco commands)
    ├── mesh-plugin-workflows/      # Workflow plugin package
    ├── mesh-plugin-user-sandbox/   # User code execution sandbox
    ├── mesh-plugin-reports/        # Reports generation plugin
    ├── mesh-plugin-object-storage/ # Object storage plugin
    ├── mesh-plugin-private-registry/ # Private package registry
    ├── mesh-plugin-site-builder/   # Site builder plugin
    ├── mesh-plugin-task-runner/    # Task runner plugin
    ├── create-deco/                # Project scaffolding (npm create deco)
    ├── vite-plugin-deco/           # Vite plugin for Deco projects
    ├── sdk/                        # Legacy SDK
    ├── ai/                         # AI utilities
    ├── cf-sandbox/                 # Cloudflare sandbox
    └── site-binding-renderer/      # Site binding renderer

Root files:
├── package.json                    # Monorepo config (Bun workspaces)
├── tsconfig.json                   # TypeScript config
├── biome.json                      # Biome formatter & linter config
├── .oxlintrc.json                  # Oxlint config
├── knip.jsonc                      # Unused imports checker
├── lefthook.yml                    # Git hooks config
└── README.md                       # Project overview
```

## Directory Purposes

**apps/mesh/src/api/:**
- Purpose: HTTP request handlers, Hono routes, request/response middleware
- Contains: Route files (proxy.ts, virtual-mcp.ts, auth.ts, etc.), error handling, CORS/logging middleware
- Key files: `app.ts` (Hono app factory), `routes/` (route handlers)

**apps/mesh/src/auth/:**
- Purpose: Authentication setup using Better Auth
- Contains: Better Auth initialization, JWT token handling, OAuth provider config, org/role definitions
- Key files: `index.ts` (Better Auth instance), `jwt.ts` (JWT create/verify), `org.ts` (org plugin config), `roles.ts` (permission roles)

**apps/mesh/src/core/:**
- Purpose: Core abstractions and runtime context
- Contains: `MeshContext` (unified interface), `ContextFactory` (HTTP→context conversion), `AccessControl` (permission checking), `defineTool` (tool definition wrapper)
- Key files: `mesh-context.ts`, `context-factory.ts`, `access-control.ts`, `define-tool.ts`, `plugin-loader.ts`

**apps/mesh/src/tools/:**
- Purpose: MCP tool definitions organized by domain
- Contains: Subdirectories for each domain (organization, connection, virtual, monitoring, etc.)
- Pattern: Each tool is a `defineTool()` with Zod schema + handler
- Key files: `index.ts` (exports all tools), `registry.ts` (tool metadata for frontend), `*/index.ts` (tool exports per domain), `*/schema.ts` (Zod types)

**apps/mesh/src/storage/:**
- Purpose: Kysely ORM adapters for database operations
- Contains: Storage adapter classes per entity type (ConnectionStorage, VirtualMCPStorage, EventBusStorage, etc.), Kysely dialect configuration
- Key files: `types.ts` (database schema), `connection.ts`, `virtual.ts`, `event-bus.ts`, `monitoring.ts`, `threads.ts`

**apps/mesh/src/database/:**
- Purpose: Database connection factory and configuration
- Contains: Kysely dialect setup for SQLite/PostgreSQL, query logging, metrics collection
- Key files: `index.ts` (factory function returning configured Kysely instance)

**apps/mesh/src/mcp-clients/:**
- Purpose: MCP client creation and management
- Contains: Client factories for different connection types, decorators for caching/authorization, transport adapters
- Key files: `client.ts`, `server.ts`, `outbound/` (transports), `virtual-mcp/` (virtual MCP router), `decorators/` (middleware)

**apps/mesh/src/event-bus/:**
- Purpose: Pub/sub event delivery system
- Contains: Event publishing, subscription management, worker processing, notify strategies
- Key files: `index.ts` (factory), `event-bus.ts` (core implementation), `interface.ts` (types), `polling.ts`, `postgres-notify.ts` (notify strategies)

**apps/mesh/src/encryption/:**
- Purpose: Credential management
- Contains: Encryption/decryption of sensitive data
- Key files: `credential-vault.ts` (encrypt/decrypt API keys, tokens)

**apps/mesh/src/observability/:**
- Purpose: OpenTelemetry setup and metrics
- Contains: Tracer/meter initialization, Prometheus exporter
- Key files: `index.ts` (setup), helpers for span creation

**apps/mesh/src/web/:**
- Purpose: React 19 admin dashboard UI
- Contains: React components, providers (auth, theme), pages, routes
- Key files: `index.tsx` (entry point), `providers/` (context providers), `components/` (sidebar, pages, forms)

**apps/mesh/src/sandbox/:**
- Purpose: Code execution runtime
- Contains: Sandbox environment setup, runtime configuration
- Key files: `index.ts`, execution engine files

**apps/mesh/src/oauth/:**
- Purpose: OAuth-specific helpers
- Contains: OAuth token generation, scope handling
- Key files: Various OAuth utilities

**apps/mesh/src/monitoring/:**
- Purpose: Observability data aggregation
- Contains: Log collection, metric aggregation helpers
- Key files: Various monitoring utilities

**apps/mesh/migrations/:**
- Purpose: Database schema changes
- Contains: Numbered migration files (001-, 002-, etc.), seeds for dev data
- Pattern: Each migration is a Kysely migration with up/down
- Key files: `index.ts` (migration runner), `seeds/index.ts` (seed data)

**packages/mesh-sdk/:**
- Purpose: Public SDK types for external consumers
- Contains: Type definitions, shared utilities for plugin development
- Key files: Type exports for plugins to consume

**packages/bindings/:**
- Purpose: MCP binding abstractions
- Contains: Core interfaces for binding implementations
- Key files: `core/` (connection, binder, plugin context)

**packages/runtime/:**
- Purpose: Shared runtime utilities
- Contains: MCP proxy logic, OAuth handling, asset serving
- Key files: `mcp.ts`, `oauth.ts`, `proxy.ts`, `asset-server/`

**packages/ui/:**
- Purpose: Shared React component library
- Contains: shadcn-based components for consistent UI across apps
- Key files: Components for forms, layouts, common UI patterns

**packages/cli/:**
- Purpose: CLI tooling
- Contains: Deco CLI commands
- Key files: CLI entry points and command handlers

**packages/mesh-plugin-*/**
- Purpose: Plugin packages extending Mesh with new capabilities
- Examples: workflows, user sandbox, object storage, private registry, task runner, site builder

## Key File Locations

**Entry Points:**
- `apps/mesh/src/index.ts`: Server startup (Bun server, port 3000)
- `apps/mesh/src/web/index.tsx`: React UI entry point
- `apps/mesh/src/api/app.ts`: Hono app factory (routes, middleware setup)

**Configuration:**
- `apps/mesh/vite.config.ts`: Vite bundling config for UI
- `apps/mesh/package.json`: App-specific scripts and dependencies
- `tsconfig.json`: Shared TypeScript configuration
- `biome.json`: Code formatting rules

**Core Logic:**
- `apps/mesh/src/core/mesh-context.ts`: Unified runtime interface for tools
- `apps/mesh/src/core/context-factory.ts`: HTTP request → MeshContext conversion
- `apps/mesh/src/core/define-tool.ts`: Tool definition wrapper with validation/tracing
- `apps/mesh/src/database/index.ts`: Database factory (SQLite/PostgreSQL)

**Testing:**
- Test files co-located with source: `*.test.ts` or `*.spec.ts`
- Integration tests: `apps/mesh/src/api/*.integration.test.ts`
- Migration seeds: `apps/mesh/migrations/seeds/`

## Naming Conventions

**Files:**
- Kebab-case for most files: `api-key.ts`, `event-bus.ts`, `access-control.ts`
- PascalCase for React components: `Sidebar.tsx`, `Button.tsx`
- Test files: `*.test.ts` (unit/integration) or `*.spec.ts` (rare)
- Migration files: Numbered prefix + kebab-case: `001-initial-schema.ts`, `021-threads.ts`

**Directories:**
- Kebab-case for feature directories: `event-bus/`, `mcp-clients/`, `storage/`
- Feature names match tool/component purpose
- Subdirectories group related files by domain: `tools/organization/`, `tools/connection/`

**Functions & Variables:**
- camelCase for functions: `createMeshContext()`, `defineService()`
- UPPER_SNAKE_CASE for constants: `MCP_TOOL_CALL_TIMEOUT_MS`, `WELL_KNOWN_QUERY_ERRORS`
- PascalCase for types/interfaces: `MeshContext`, `ConnectionEntity`, `ToolDefinition`

**Storage/Model Files:**
- `*-storage.ts` for Kysely adapter: `connection-storage.ts`, `event-bus-storage.ts`
- `*-schema.ts` for Zod types: `connection-schema.ts`, `organization-schema.ts`
- `*-entity.ts` for database row types: `connection-entity.ts` (if separate from schema)

## Where to Add New Code

**New Tool/Feature:**
- Tool implementation: `apps/mesh/src/tools/{feature-name}/index.ts` (export tool definition)
- Tool schema: `apps/mesh/src/tools/{feature-name}/schema.ts` (Zod types)
- Tool handler: `apps/mesh/src/tools/{feature-name}/{operation}.ts` (e.g., create.ts, update.ts, delete.ts)
- Storage adapter: `apps/mesh/src/storage/{entity}.ts` (if new entity type)
- Tests: `apps/mesh/src/tools/{feature-name}/{operation}.test.ts` (co-located)
- Register in: `apps/mesh/src/tools/registry.ts` (add metadata), `apps/mesh/src/tools/index.ts` (export)

**New API Route:**
- Route handler: `apps/mesh/src/api/routes/{feature}.ts`
- Type variables: Include `Variables = { meshContext: MeshContext }`
- Tests: `apps/mesh/src/api/routes/{feature}.test.ts`
- Mount in: `apps/mesh/src/api/app.ts` (add route to Hono app)

**New Storage Entity:**
- Storage adapter: `apps/mesh/src/storage/{entity}.ts` (class extending EntityStorage pattern)
- Database schema: Update `apps/mesh/src/storage/types.ts` (add to Database interface)
- Migration: `apps/mesh/migrations/{NNN}-{description}.ts` (add Kysely migration)
- Tests: `apps/mesh/src/storage/{entity}.test.ts` (co-located)

**New UI Component:**
- Component file: `apps/mesh/src/web/components/{category}/{component-name}.tsx`
- Tests: `apps/mesh/src/web/components/{category}/{component-name}.test.tsx` (co-located)
- Styles: Use Tailwind classes inline (no separate CSS files)
- shadcn components: Use from `packages/ui` library

**New Plugin:**
- Create directory: `packages/mesh-plugin-{feature-name}/`
- Plugin entry: `packages/mesh-plugin-{feature-name}/src/index.ts` (export plugin factory)
- Plugin hooks: Implement startup hooks in plugin factory
- Package metadata: `packages/mesh-plugin-{feature-name}/package.json`
- Storage schema: Define in plugin if needed (migrations handled by plugin)

**Utilities & Helpers:**
- Shared utilities: `apps/mesh/src/shared/` (or package-level in `packages/`)
- Tool-specific utilities: `apps/mesh/src/tools/{feature-name}/utils.ts`
- Common patterns: Re-export from `packages/runtime/` when cross-app

## Special Directories

**apps/mesh/migrations/:**
- Purpose: Database schema versioning
- Generated: No (manually written, committed to git)
- Committed: Yes
- How to add: Create `{NNN}-description.ts` with Kysely migration
- Runs: Via `deno task migrate` or `bun run migrate`

**apps/mesh/src/web/:**
- Purpose: React 19 admin dashboard
- Generated: Vite builds to `dist/` (not committed)
- Committed: Yes (source only)
- Build command: `bun run build:client`

**node_modules/, packages/*/node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes (by `bun install`)
- Committed: No (git-ignored)
- Root lockfile: `bun.lock` (committed, handles all workspaces)

**dist/, build/, .next/:**
- Purpose: Build outputs
- Generated: Yes (by build/dev commands)
- Committed: No (git-ignored)
- Ignored: Listed in `.gitignore`

**.tsbuildinfo:**
- Purpose: TypeScript incremental build cache
- Generated: Yes
- Committed: No (git-ignored)

## Import Aliases

**From tsconfig.json:**
- `@/` → `./src/` (in apps/mesh)
- `@decocms/mesh-sdk` → `packages/mesh-sdk`
- `@decocms/bindings` → `packages/bindings`
- `@decocms/runtime` → `packages/runtime`

**Usage in app code:**
```typescript
// Prefer absolute aliases
import { MeshContext } from "@/core/mesh-context";
import type { ServerClient } from "@decocms/bindings/mcp";
import { createAssetHandler } from "@decocms/runtime/asset-server";

// Relative imports acceptable for same-directory helpers
import { helper } from "./utils";
```

---

*Structure analysis: 2026-02-14*
