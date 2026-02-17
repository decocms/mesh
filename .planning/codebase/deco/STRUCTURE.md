# Codebase Structure

**Analysis Date:** 2026-02-14

## Directory Layout

```
/Users/guilherme/Projects/deco/
├── blocks/                 # Block type definitions (Loader, Action, Section, etc.)
├── clients/                # External service clients and proxy utilities
├── commons/                # Shared utilities (JWT, workflows)
├── components/             # Preact runtime components (section wrappers, error boundaries)
├── daemon/                 # Development server: file sync, git, real-time updates
├── dev/                    # Development utilities and CLI tools
├── engine/                 # Core resolution engine: manifest, resolver, schema
│   ├── core/              # Resolver implementation
│   ├── manifest/          # Manifest building and initialization
│   ├── schema/            # Type → JSON schema conversion
│   ├── decofile/          # Content/config file providers
│   └── importmap/         # Module import resolution
├── hooks/                  # Preact hooks for client-side section enhancement
├── hypervisor/            # Isolated execution environment (experimental)
├── observability/         # Telemetry: OpenTelemetry, tracing, logging probes
├── runtime/               # Request handling: middleware, rendering, invocation
│   ├── features/          # Core features (render, invoke, meta, styles)
│   ├── fresh/             # Fresh framework integration
│   ├── htmx/              # HTMX progressive enhancement
│   ├── routes/            # HTTP route handlers
│   ├── caches/            # Caching implementations
│   ├── middlewares/       # Middleware (liveness, auth)
│   └── fetch/             # Fetch utilities and logging
├── scripts/               # Build and deployment scripts
├── utils/                 # Utility functions (http, cookies, invoke, logging, etc.)
├── assets/                # Static assets
├── deco.ts                # Global context and request context binding
├── deno.json              # Deno configuration and dependencies
├── mod.ts                 # Main export entry point
├── mod.web.ts             # Web framework exports
└── live.ts                # Development entry point
```

## Directory Purposes

**blocks/:**
- Purpose: Define all block types used by the framework
- Contains: TypeScript interfaces for Loader, Action, Section, Handler, Workflow, Flag, Account
- Key files:
  - `loader.ts` - Data fetching blocks
  - `action.ts` - Server mutations
  - `section.ts` - Page components
  - `handler.ts` - Custom HTTP handlers
  - `workflow.ts` - Durable workflow definitions
  - `app.ts` - App manifest type definitions
  - `index.ts` - Block definition helpers
- Pattern: Each exports a Block definition and type helpers
- Used by: Manifest builder, resolver, schema generator

**clients/:**
- Purpose: External service integrations and proxy utilities
- Contains:
  - `withManifest.ts` - HTTP client wrapper for manifest-based API calls
  - `proxy.ts` - Proxy request utilities
  - `formdata.ts` - Form data utilities
- Pattern: Provide typed client factories or request interception
- Used by: Custom block implementations

**commons/:**
- Purpose: Shared functionality across multiple modules
- Contains:
  - `jwt/mod.ts` - JWT token utilities
  - `workflows/mod.ts` - Durable workflow primitives
- Pattern: Framework-agnostic utilities
- Used by: Various blocks and runtime components

**components/:**
- Purpose: Preact components for rendering framework
- Contains:
  - `section.tsx` - withSection HOC, ErrorBoundary, section rendering logic
  - `LiveControls.tsx` - Dev mode controls
  - `StubSection.tsx` - Placeholder for missing blocks
  - `JsonViewer.tsx` - Debug component
- Pattern: Server-side helpers that wrap block rendering
- Used by: Fresh pages, HTMX handlers

**daemon/:**
- Purpose: Local development server for file syncing and git management
- Contains:
  - `main.ts` - Entry point, CLI argument parsing, server startup
  - `git.ts` - Git operations (commit, diff, status, checkout)
  - `fs/` - File system API (read, write, delete, patch, grep)
  - `realtime/` - CRDT-based real-time sync, WebSocket management
  - `sse/` - Server-sent events channel for broadcasting updates
  - `workers/` - Background job processing
  - `loggings/` - Dev server logging
- Pattern: Sidecar process that communicates with editor/LSP
- Used by: `deno task dev` or direct daemon process

**dev/:**
- Purpose: Development and build tools
- Contains: CLI scripts for bundling, component generation, code mods
- Used by: Development workflow

**engine/core/:**
- Purpose: Core resolver implementation
- Contains:
  - `resolver.ts` - Main resolution algorithm, FieldResolver chain, Resolvable typing
  - `mod.ts` - ReleaseResolver class, hint system, resolver composition
  - `hints.ts` - Resolution optimization hints
  - `utils.ts` - Helper functions for resolution
- Key exports: ReleaseResolver, resolve(), Resolvable, FieldResolver
- Pattern: Pure resolution logic independent of runtime
- Used by: Runtime render/invoke, daemon, CLI

**engine/manifest/:**
- Purpose: Aggregate blocks from multiple apps into unified manifest
- Contains:
  - `manifest.ts` - Manifest initialization, context setup, app resolution
  - `manifestBuilder.ts` - Build manifest from app blocks
  - `defaults.ts` - Default block definitions (error, loading, etc.)
  - `fresh.ts` - Fresh framework default resolvers
- Key exports: newContext(), $live, mergeManifests()
- Used by: Deco.init(), development setup

**engine/schema/:**
- Purpose: Convert TypeScript types to JSON schemas
- Contains:
  - `transform.ts` - Main transformation logic, recursive type handling
  - `schemeable.ts` - Schemeable protocol, type/file references
  - `builder.ts` - Build schemas for block functions
  - `parser.ts` - Parse TypeScript to schema
  - `comments.ts` - Extract JSDoc/comments as schema metadata
  - `lazy.ts` - Lazy schema loading strategy
- Key exports: Schemeable, schemeableToJSONSchema(), fromJSON()
- Pattern: Uses AST parsing (@deco/deno-ast-wasm) for accurate type inference
- Used by: Admin UI, block introspection, validation

**engine/decofile/:**
- Purpose: Content/config file provider abstraction
- Contains:
  - `provider.ts` - Provider interface and auto-detection
  - `fs.ts` - Local file system provider (watches deco.json)
  - `fetcher.ts` - HTTP provider for remote deco.json
- Key exports: DecofileProvider interface, getProvider()
- Pattern: Pluggable provider system for different deployment models
- Used by: Manifest initialization, runtime hot reloading

**engine/importmap/:**
- Purpose: Module import resolution
- Contains: ImportMapBuilder, scope-based import resolution
- Used by: Block loading, app namespacing

**hooks/:**
- Purpose: Preact hooks for interactive sections
- Contains:
  - `useSection.ts` - Access section context and props
  - `useScript.ts` - Load external scripts
  - `useDevice.ts` - Get device info from section context
  - `usePartialSection.ts` - Partial section updates
- Pattern: Preact hooks that access global context via SectionContext
- Used by: HTMX-enhanced components, client-side interactivity

**observability/:**
- Purpose: Telemetry, tracing, metrics, logging
- Contains:
  - `otel/` - OpenTelemetry instrumentation, samplers, configuration
  - `probes/` - Health check probes
  - `observe.ts` - Metrics collection
  - `http.ts` - HTTP request/response logging
- Key exports: tracer, logger, observe, startObserve()
- Used by: All layers for monitoring and debugging

**runtime/:**
- Purpose: Request handling and rendering
- Contains core execution flow

**runtime/middleware.ts:**
- Purpose: Request middleware chain
- Key stages:
  1. Liveness check
  2. State builder (prepareState)
  3. Observability/tracing
  4. Main handler (routing)
  5. Response post-processing (headers, caching, cookies)
- Used by: Deco.handler

**runtime/mod.ts:**
- Purpose: Main Deco class entry point
- Contains: Deco class with init(), handler, render(), invoke(), prepareState()
- Pattern: Singleton per application, lazy handler initialization
- Key methods:
  - `Deco.init()` - Async initialization with manifest
  - `.handler` - Express-like handler for HTTP requests
  - `.render()` - Server-side render a page
  - `.invoke()` - Invoke a block (Loader/Action)
  - `.resolve()` - Resolve a value with type matching
- Used by: Fresh config, HTMX setup, CLI tools

**runtime/features/:**
- Purpose: Core runtime feature implementations
- Contains:
  - `render.tsx` - Page rendering (section + data composition)
  - `invoke.ts` - Block invocation with middleware support
  - `meta.ts` - Component metadata (used by admin UI)
  - `styles.css.ts` - CSS loading from TailwindCSS config
  - `preview.tsx` - Component preview mode
- Used by: Handlers, daemon

**runtime/routes/:**
- Purpose: HTTP route handlers for built-in endpoints
- Contains: Page routing, API endpoints, handler dispatch
- Used by: Middleware

**runtime/fresh/:**
- Purpose: Fresh framework integration
- Contains: Fresh middleware setup, context extraction
- Used by: Fresh config (fresh.config.ts in site projects)

**runtime/htmx/:**
- Purpose: HTMX progressive enhancement
- Contains: Partial rendering, form handling, real-time sync
- Used by: Sites with HTMX sections

**runtime/caches/:**
- Purpose: Caching implementations
- Contains: File system cache, memory cache, cache API
- Env vars: `WEB_CACHE_ENGINE`, `CACHE_MAX_SIZE`, `CACHE_TTL_AUTOPURGE`
- Used by: Loader result caching (optional via env)

**runtime/fetch/:**
- Purpose: Fetch utilities
- Contains: Patched fetch for proper headers, fetch logging
- Used by: Block code that makes HTTP requests

**utils/:**
- Purpose: Utility functions used across the framework
- Key files:
  - `invoke.ts` - Block invocation helpers
  - `invoke.server.ts` - Server-side invocation setup
  - `invoke.types.ts` - Invocation type definitions
  - `http.ts` - HTTP headers, CORS, force HTTPS
  - `admin.ts` - Admin route detection, admin URL building
  - `cookies.ts` - Cookie parsing and setting
  - `logging.ts` - Request logging
  - `object.ts` - Object manipulation utilities
  - `timings.ts` - Server timing headers
  - `userAgent.ts` - Device detection
  - `async.ts` - Async utilities
- Pattern: Pure functions, no side effects except logging
- Used by: All layers

**scripts/:**
- Purpose: Build, release, and deployment tools
- Contains:
  - `apps/bundle.ts` - Build and bundle sites
  - `dev.ts` - Development server setup
  - `release.ts` - Version release automation
  - `codemod.ts` - Code transformation utilities
- Used by: CLI tasks in deno.json

## Key File Locations

**Entry Points:**
- `mod.ts`: Main export (most imports from this file)
- `mod.web.ts`: Web framework exports (Deno Deploy, Fresh)
- `live.ts`: Development entry point (check command target)
- `deco.ts`: Global context setup (do not import directly, use Context from mod.ts)

**Configuration:**
- `deno.json`: Deno configuration, imports, tasks, export map
- `deps.ts`: Pinned dependencies used across the project

**Core Logic:**
- `runtime/mod.ts`: Deco class, main request handling
- `engine/core/resolver.ts`: Resolution algorithm
- `engine/manifest/manifest.ts`: Manifest initialization
- `engine/schema/transform.ts`: Type to schema conversion
- `blocks/mod.ts`: Block type exports

**Testing:**
- `**/*.test.ts`: Unit tests, run with `deno test`
- `**/*.bench.ts`: Benchmarks, run with `deno bench`
- Component tests in `tests/components/` (Puppeteer-based)

## Naming Conventions

**Files:**
- `.ts`: TypeScript source files
- `.tsx`: TypeScript + JSX (Preact components)
- `.test.ts`: Unit tests
- `.bench.ts`: Benchmarks
- `mod.ts`: Module entry points (directory exports)
- `types.ts`: Type-only files when needed

**Directories:**
- lowercase: General modules (`runtime/`, `blocks/`, `utils/`)
- lowercase with slash tree: Feature areas (`engine/core/`, `daemon/fs/`)
- PascalCase: Not used in this codebase

**Functions:**
- camelCase: Standard functions
- PascalCase: Components, classes, types, block definition functions
- UPPER_SNAKE_CASE: Constants (env vars, sentinel values)

**Types:**
- PascalCase: All type names
- Suffix conventions:
  - `Props`: Component/function input types
  - `Context`: Context types
  - `State`: State object types
  - `Options`: Configuration objects
  - `Handler`: HTTP/callback handlers
  - `Resolver`: Resolution functions
  - `Provider`: Pluggable provider interfaces

## Where to Add New Code

**New Feature (e.g., new block type):**
- Type definition: `blocks/newfeature.ts`
- Type export: Add to `blocks/mod.ts`
- Schema handling: Add to `engine/schema/transform.ts` if special case
- Integration: Wire into `engine/manifest/defaults.ts` if default

**New Component/Module:**
- Implementation: `components/MyComponent.tsx` (runtime)
- Or: `engine/newmodule/mod.ts` (engine layer)
- Exports: `mod.ts` re-export if public API

**Utilities:**
- Shared helpers: `utils/myutil.ts`
- Export via: `utils/mod.ts` or `mod.ts`
- Test alongside: `utils/myutil.test.ts`

**Daemon Features:**
- File operations: `daemon/fs/api.ts`
- Git operations: `daemon/git.ts`
- Real-time: `daemon/realtime/` or `daemon/sse/`
- Entry point integration: `daemon/main.ts`

**Observability:**
- Metrics: `observability/observe.ts`
- Tracing: `observability/otel/`
- Logging: New logger instance via `observability/mod.ts`

## Special Directories

**blocks/:*
- Purpose: Type definitions only
- Generated: No
- Committed: Yes
- Pattern: Each file exports a Block definition factory

**engine/schema/:*
- Purpose: Schema generation logic
- Generated: No
- Committed: Yes
- Note: Uses external AST parser (@deco/deno-ast-wasm)

**daemon/:*
- Purpose: Development server code
- Generated: No
- Committed: Yes
- Note: Not published in npm/jsr; excluded in deno.json publish config

**dev/:*
- Purpose: Development CLI utilities
- Generated: No
- Committed: Yes
- Note: Not published; excluded in deno.json publish config

**assets/:*
- Purpose: Static assets (images, templates)
- Generated: No
- Committed: Yes
- Excluded: In deno.json fmt excludes

**Excluded from publication:**
- `./dev`
- `**/*.bench.ts`
- `**/*.test.ts`
- `./scripts/codemod.ts`
- `./plugins`
- `live.gen.ts`
- `live.ts`
- `MAINTAINERS.txt`
- `CODE_OF_CONDUCT.md`
- `.github`

---

*Structure analysis: 2026-02-14*
