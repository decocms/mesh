# Codebase Structure

**Analysis Date:** 2026-02-01

## Directory Layout

```
/Users/guilherme/Projects/mesh/
├── apps/                          # Applications
│   ├── api/                        # REST API app (deprecated, functionality moved to mesh)
│   ├── benchmark/                  # Performance benchmarking suite
│   ├── docs/                        # Documentation site
│   ├── mesh/                        # Main MCP Gateway application (server + client)
│   ├── outbound/                    # Outbound integrations
│   ├── studio/                      # Studio/admin tools
│   └── web/                         # Legacy web app
├── packages/                        # Reusable packages
│   ├── ai/                          # AI/LLM utilities
│   ├── bindings/                    # Type bindings for plugins
│   ├── cli/                         # CLI utilities
│   ├── create-deco/                 # Project scaffolding
│   ├── mesh-plugin-object-storage/  # Server plugin for object storage
│   ├── mesh-plugin-task-runner/     # Server plugin for task execution
│   ├── mesh-plugin-user-sandbox/    # Server plugin for user code execution
│   ├── mesh-sdk/                    # SDK for MCP integration
│   ├── runtime/                     # Runtime utilities and asset server
│   ├── sdk/                         # Legacy SDK
│   ├── ui/                          # Shared React UI components
│   └── vite-plugin-deco/            # Vite plugin for deco tooling
├── skills/                          # Task runner skills
├── plugins/                         # Legacy plugin directory
├── data/                            # Data files (database, migrations)
├── deploy/                          # Deployment configs (Docker, K8s)
├── migrations/                      # Database migrations (symlink to apps/mesh/migrations)
├── .planning/                       # Planning docs
├── package.json                     # Monorepo workspace root
└── tsconfig.json                    # Root TypeScript config
```

## Directory Purposes

**apps/mesh** - Main Application:
- Purpose: The MCP Gateway server + React web UI
- Contains: Server API, web frontend, all management tools, database layer
- Key subdirs: `src/`, `public/`, `migrations/`, `e2e/`
- Build targets: `dist/server/` (bundled server), `dist/client/` (SPA)

**apps/mesh/src** - Server Source Code:
- `api/`: HTTP routes and request handlers
- `auth/`: Better Auth configuration and JWT utilities
- `core/`: Context factory, access control, plugin loader
- `tools/`: Management tools (organization, connection, virtual MCP, etc.)
- `storage/`: Database adapter layer
- `database/`: Kysely ORM and migrations
- `mcp-clients/`: MCP client implementations
- `web/`: React frontend source
- `event-bus/`: Async event system
- `encryption/`: Credential vault
- `observability/`: OpenTelemetry setup
- `sandbox/`: Code execution environment
- `index.ts`: Server entry point
- `cli.ts`: CLI entry point

**packages/bindings** - Plugin Type Bindings:
- Purpose: Shared types for server and client plugins
- Contains: Plugin interface definitions, MCP types
- Used by: All plugins that extend Mesh

**packages/runtime** - Asset Server:
- Purpose: Serves client assets and handles dev proxy
- Contains: Static file handler, dev proxy logic
- Used by: Server (index.ts) for client asset delivery

**packages/mesh-sdk** - MCP SDK:
- Purpose: Utilities for MCP integration with Mesh
- Contains: Helper functions for creating MCP servers from clients

**Server Plugins** (in packages/):
- `mesh-plugin-task-runner`: Task execution with Bun
- `mesh-plugin-object-storage`: File/object storage management
- `mesh-plugin-user-sandbox`: Dynamic code execution

## Key File Locations

**Entry Points:**
- `apps/mesh/src/index.ts`: Server startup, creates Hono app
- `apps/mesh/src/cli.ts`: CLI entry point, runs migrations, starts server
- `apps/mesh/src/web/index.tsx`: React app root with TanStack Router setup

**Configuration:**
- `apps/mesh/package.json`: Main app dependencies and scripts
- `apps/mesh/tsconfig.json`: TypeScript config
- `apps/mesh/vite.config.ts`: Vite build config for client
- `apps/mesh/.env`: Development environment variables
- `package.json` (root): Workspace root config

**Core Logic:**
- `apps/mesh/src/core/context-factory.ts`: Creates MeshContext from HTTP requests
- `apps/mesh/src/core/mesh-context.ts`: MeshContext interface (dependency injection)
- `apps/mesh/src/core/access-control.ts`: Permission checking logic
- `apps/mesh/src/tools/registry.ts`: Tool metadata registry (used by frontend)
- `apps/mesh/src/tools/index.ts`: All tool implementations

**API Routes:**
- `apps/mesh/src/api/app.ts`: Main Hono application setup
- `apps/mesh/src/api/routes/proxy.ts`: MCP proxy to downstream servers
- `apps/mesh/src/api/routes/virtual-mcp.ts`: Virtual MCP aggregation
- `apps/mesh/src/api/routes/self.ts`: Self MCP (management tools)
- `apps/mesh/src/api/routes/auth.ts`: API key management
- `apps/mesh/src/api/routes/decopilot/routes.ts`: LLM chat API
- `apps/mesh/src/api/routes/oauth-proxy.ts`: OAuth token proxying

**Database:**
- `apps/mesh/migrations/`: All database migration files
- `apps/mesh/src/database/index.ts`: Database connection and pool
- `apps/mesh/src/database/migrate.ts`: Migration runner
- `apps/mesh/src/storage/types.ts`: Database schema interfaces

**Storage Adapters:**
- `apps/mesh/src/storage/connection.ts`: Connection management
- `apps/mesh/src/storage/virtual.ts`: Virtual MCP definitions
- `apps/mesh/src/storage/monitoring.ts`: Logs and stats
- `apps/mesh/src/storage/ports.ts`: Server ports tracking
- `apps/mesh/src/storage/event-bus.ts`: Event subscriptions
- `apps/mesh/src/storage/user.ts`: User info queries

**Web/Frontend:**
- `apps/mesh/src/web/index.tsx`: React app root with router
- `apps/mesh/src/web/routes/`: Route components for all pages
- `apps/mesh/src/web/layouts/`: Layout wrapper components
- `apps/mesh/src/web/components/`: Reusable React components
- `apps/mesh/src/web/hooks/`: React hooks
- `apps/mesh/src/web/providers/`: Context providers (theme, query, auth)

**Testing:**
- `apps/mesh/e2e/`: Playwright end-to-end tests
- `apps/mesh/src/**/*.test.ts`: Unit/integration tests co-located with source

## Naming Conventions

**Files:**
- **Routes**: `<verb>-or-name>.ts` (e.g., `proxy.ts`, `oauth-proxy.ts`, `auth.ts`)
- **Storage adapters**: `<entity>.ts` (e.g., `connection.ts`, `virtual.ts`)
- **Tools**: `<action>.ts` (e.g., `create.ts`, `list.ts`, `get.ts`)
- **Tests**: `*.test.ts` or `*.spec.ts` (co-located with source)
- **Type definitions**: `types.ts` or included in same file
- **Constants**: `constants.ts` or in same file with `const` declarations
- **Utilities**: `utils.ts` or `<name>-utils.ts`

**Directories:**
- **Feature domains**: lowercase with dashes (e.g., `event-bus`, `mcp-clients`)
- **Organizational**: by layer (api, core, storage, tools)
- **Tool groups**: by entity name (organization, connection, virtual, apiKeys, etc.)
- **Tests**: same directory as source with `.test.ts` extension

**Functions/Variables:**
- **camelCase**: All functions, variables, properties
- **PascalCase**: Classes, interfaces, types
- **SCREAMING_SNAKE_CASE**: Constants only
- **_leadingUnderscore**: Private/internal functions (convention only)

**TypeScript:**
- **Interfaces**: Describe shapes, used for dependencies
- **Types**: Unions, primitives, derived types
- **Enums**: Avoid (use union types)
- **Generic types**: Used extensively for type-safe abstractions

## Where to Add New Code

**New Feature (complete CRUD):**
- **Primary code**: `apps/mesh/src/tools/<entity-name>/` (create.ts, list.ts, get.ts, update.ts, delete.ts)
- **Storage**: `apps/mesh/src/storage/<entity>.ts` (if new entity type)
- **Database**: `apps/mesh/migrations/<timestamp>-add-<entity>-table.ts` (if new table)
- **Tests**: co-located in same directories as `.test.ts` files
- **API exposure**: Add to `apps/mesh/src/tools/registry.ts` if management tool, or create route in `apps/mesh/src/api/routes/`

**New API Route:**
- **Implementation**: `apps/mesh/src/api/routes/<feature>.ts` or `apps/mesh/src/api/routes/<feature>/routes.ts`
- **Utilities**: `apps/mesh/src/api/routes/<feature>/helpers.ts` if needed
- **Types**: `apps/mesh/src/api/routes/<feature>/types.ts` if needed
- **Schema**: `apps/mesh/src/api/routes/<feature>/schemas.ts` if Zod validation needed
- **Mount**: Register in `apps/mesh/src/api/app.ts` with `app.route("/api", yourRoutes)`

**New Component/Module:**
- **Shared UI components**: `packages/ui/src/components/`
- **Server plugin**: Create new package in `packages/mesh-plugin-<name>/`
- **Utility library**: Create new package in `packages/<name>/`
- **CLI command**: `packages/cli/src/commands/`

**Utilities/Helpers:**
- **Shared across app**: `apps/mesh/src/<layer>/` (e.g., shared in api, core, storage)
- **Specific to feature**: `<feature-directory>/` (co-located)
- **Multiple utilities in one area**: Create `utils/` subdirectory

**Database:**
- **New table**: `apps/mesh/migrations/<timestamp>-<description>.ts`
- **Constraint/index**: Separate migration file or add to same migration
- **Type definition**: `apps/mesh/src/storage/types.ts` (add new interface)
- **Storage adapter**: `apps/mesh/src/storage/<entity>.ts`

## Special Directories

**apps/mesh/migrations:**
- Purpose: Database schema migrations
- Generated: Yes (created by running `bunx @better-auth/cli migrate`)
- Committed: Yes (tracked in git)
- Run with: `bun run migrate` or `bun run db:migrate`

**apps/mesh/data:**
- Purpose: Local development database files (SQLite) and generated secrets
- Generated: Yes (created at runtime)
- Committed: No (in .gitignore)
- Contains: `mesh.db` (SQLite database), `mesh-dev-only-secrets.json` (dev secrets)

**apps/mesh/public:**
- Purpose: Static assets (icons, images, favicon)
- Generated: No
- Committed: Yes

**apps/mesh/dist:**
- Purpose: Bundled output for production deployment
- Generated: Yes (via `bun run build:server` and `bun run build:client`)
- Committed: No (in .gitignore)

**node_modules:**
- Purpose: Installed dependencies
- Generated: Yes
- Committed: No
- Use: `bun install` to populate

**.planning/codebase:**
- Purpose: Architecture and planning documents for this codebase
- Generated: Yes (by GSD mappers)
- Committed: Yes (part of git)
- Contains: ARCHITECTURE.md, STRUCTURE.md, TESTING.md, CONVENTIONS.md, CONCERNS.md, etc.

---

*Structure analysis: 2026-02-01*
