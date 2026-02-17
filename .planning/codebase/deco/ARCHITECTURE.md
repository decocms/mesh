# Architecture

**Analysis Date:** 2026-02-14

## Pattern Overview

**Overall:** Deco is a declarative, type-driven CMS framework with a modular block architecture. It uses a schema-based plugin system where TypeScript types automatically generate UI schemas for content editors. The framework follows a resolver pattern for lazy-loading and composing resolvable blocks (Sections, Loaders, Actions).

**Key Characteristics:**
- Schema-first design: TypeScript interfaces → JSON schemas → visual editor UI
- Block-based composition: Sections, Loaders, Actions, Handlers as first-class blocks
- Lazy resolution with dependency injection: blocks resolved at runtime based on type matching
- Git-based CMS: All content stored as JSON in git repositories
- Framework-agnostic rendering: Supports Fresh (server-side JSX) and HTMX (progressive enhancement)

## Layers

**Block Definition Layer:**
- Purpose: Define reusable, composable blocks with TypeScript interfaces
- Location: `blocks/` directory and `engine/block.ts`
- Contains: Block type definitions (Section, Loader, Action, Handler, Workflow, Flag, Account)
- Depends on: Engine schema system, Type introspection
- Used by: Manifest builder, resolver system

**Manifest & App Integration Layer:**
- Purpose: Aggregate blocks from multiple apps into a unified manifest
- Location: `engine/manifest/manifest.ts`, `engine/manifest/manifestBuilder.ts`, `blocks/app.ts`
- Contains: Manifest building, app installation, resolver initialization
- Depends on: Block definitions, Import map builder, Decofile provider
- Used by: Runtime initialization, daemon/LSP

**Resolution & Execution Layer:**
- Purpose: Resolve blocks at runtime based on type matching and dependencies
- Location: `engine/core/resolver.ts`, `engine/core/mod.ts`
- Contains: ReleaseResolver class, field resolution, dangling reference recovery
- Depends on: Manifest, Decofile provider, Middleware system
- Used by: Runtime render/invoke, page loading

**Schema & Type System Layer:**
- Purpose: Convert TypeScript types to JSON schemas for UI generation
- Location: `engine/schema/` (builder.ts, transform.ts, schemeable.ts, parser.ts)
- Contains: Schema generation, lazy schema loading, type introspection, comment parsing
- Depends on: AST parser (@deco/deno-ast-wasm), Block definitions
- Used by: Admin UI, block introspection, validation

**Runtime Request Layer:**
- Purpose: Handle HTTP requests through middleware chain and render/invoke pattern
- Location: `runtime/middleware.ts`, `runtime/mod.ts`, `runtime/handler.tsx`
- Contains: Deco class, state preparation, middleware orchestration, request context
- Depends on: Block resolution, Schema system, Observability
- Used by: Framework entry points (Fresh, HTMX), CLI

**Feature Layer:**
- Purpose: Provide core runtime features: render, invoke, metadata, styling
- Location: `runtime/features/` (render.tsx, invoke.ts, meta.ts, styles.css.ts, preview.tsx)
- Contains: Page rendering, block invocation, component metadata, CSS resolution
- Depends on: Resolution layer, Block system
- Used by: HTTP handlers, daemon

**Daemon/Dev Tools Layer:**
- Purpose: Local development, file sync, git management, real-time updates
- Location: `daemon/` (main.ts, git.ts, fs/*, realtime/*, workers/*)
- Contains: Local file watching, git operations, SSE channel, CRDT sync, WebSocket workers
- Depends on: Block system, Schema generation
- Used by: Development server, LSP integration

**Observability Layer:**
- Purpose: Telemetry, logging, tracing, error tracking
- Location: `observability/` (otel/, probes/, observe.ts, http.ts)
- Contains: OpenTelemetry instrumentation, metrics, tracing spans, request logging
- Depends on: Standards library, Custom trace context
- Used by: All other layers for monitoring

## Data Flow

**Page Render Flow (Fresh SSR):**

1. HTTP Request arrives at `runtime/middleware.ts`
2. Middleware chain initializes (state builder → observability → main handler)
3. `prepareState()` creates `State` object with monitoring, resolve/invoke functions
4. Handler routes to page component via Fresh routing
5. Page component calls `state.resolve()` to fetch loader data
6. Resolver uses `ReleaseResolver.resolve()` to:
   - Look up block by `__resolveType` key in manifest
   - Execute block function with props
   - Cache result, recover dangling refs
7. Block renders as JSX using Preact
8. ErrorBoundary wraps each section for isolation
9. Response headers set (timings, caching, CORS)
10. Middleware post-processing handles debugging, segmentation, cookies

**Block Invocation Flow:**

1. User action triggers client event (form submit, button click)
2. Handler calls `state.invoke({ __resolveType: "actions/myAction", ...props })`
3. Invocation dispatches to daemon/server or resolves locally
4. Action block executes, may yield multiple `Step` objects for progress
5. Each step returned to client via streaming or SSE
6. Client updates UI based on step type and data

**Manifest Resolution Flow:**

1. `Deco.init()` loads manifest file (usually `manifest.gen.ts`)
2. App dependency resolution via `installAppsForResolver()`
3. Each app contributes blocks to unified manifest
4. Import map built from app namespaces
5. Release provider (git/HTTP) connected to manifest
6. `ReleaseResolver` instantiated with combined blocks
7. Ready for request handling

**State Management:**

- Server-side: State object contains resolve/invoke functions bound to request context
- Request context via AsyncLocalStorage: available to blocks during execution
- Decofile provider watches for changes (HMR trigger)
- Resolver caches results per-request to avoid duplicate resolves
- Client-side: Optional Preact signals for interactive sections (HTMX)

## Key Abstractions

**Block:**
- Purpose: Represents any reusable function (Loader, Action, Section, Handler, etc.)
- Examples: `blocks/loader.ts`, `blocks/action.ts`, `blocks/section.ts`
- Pattern: Each block type implements `Block<TBlockModule>` interface with optional invoke/preview/decorate functions
- Used for: Plugin discovery, schema generation, invocation routing

**Resolvable:**
- Purpose: Value reference that can be resolved at runtime based on type
- Pattern: Object with `__resolveType: string` key indicating resolver to use
- Used for: Lazy data loading, dependency injection, cached resolution
- Example: `{ __resolveType: "loaders/product", id: "123" }`

**Resolver/ReleaseResolver:**
- Purpose: Resolves resolvables by executing corresponding block
- Pattern: Takes resolvable + context, executes block, caches result, handles errors
- Key method: `resolve(resolvable, context)` → Promise<T>
- Used for: Runtime data loading and composition

**AppManifest:**
- Purpose: Type-safe registry of all available blocks in a site
- Pattern: Generic type `AppManifest<T>` with sections/loaders/actions/handlers properties
- Used for: TypeScript type checking, schema generation, block discovery
- Location: Defined in `blocks/app.ts`

**Section:**
- Purpose: Composable page component with optional data loading
- Pattern: Default export is Preact component; optional loaders for data
- Features: Error boundaries, loading fallbacks, progressive enhancement
- Located in: `components/section.tsx` (runtime wrapper), `blocks/section.ts` (type def)

**Decofile:**
- Purpose: Content/config file provider (git-based or HTTP)
- Pattern: Interface `DecofileProvider` with onChange(), read(), write() methods
- Implementations: `engine/decofile/fs.ts` (local), HTTP fetcher
- Used for: Content versioning, multi-environment support, site config

**ImportMap:**
- Purpose: Maps import specifiers to actual module paths
- Pattern: Built from app namespaces, scope-based resolution
- Used for: Module resolution, app isolation, relative imports
- Built by: `buildImportMap()` in `blocks/utils.tsx`

## Entry Points

**Deco.init():**
- Location: `runtime/mod.ts` - Deco class
- Triggers: Application startup (Fresh server init, CLI tool startup)
- Responsibilities:
  - Load manifest (TypeScript or generated)
  - Initialize resolver with all block definitions
  - Set up global context
  - Return Deco instance for request handling

**Deco.handler:**
- Location: `runtime/handler.tsx` - handlerFor() function
- Triggers: Each HTTP request
- Responsibilities:
  - Apply middleware chain
  - Route to appropriate handler (Fresh route, HTMX partial, JSON API)
  - Manage response lifecycle

**ReleaseResolver.resolve():**
- Location: `engine/core/resolver.ts`
- Triggers: Data fetch in page, action invocation, metadata request
- Responsibilities:
  - Look up block by `__resolveType`
  - Execute with props + context
  - Apply middleware/decorators
  - Cache and return result

**daemon/main.ts:**
- Location: `daemon/main.ts` - startServer()
- Triggers: `deno run @deco/deco/scripts/run` in dev environment
- Responsibilities:
  - Watch local filesystem for content changes
  - Manage git operations (commit, diff, status)
  - Serve LSP protocol for editor integration
  - SSE broadcast of real-time updates
  - CRDT-based conflict resolution for concurrent edits

## Error Handling

**Strategy:** Layered error recovery with graceful degradation

**Patterns:**

1. **Block-level errors:** Caught by ErrorBoundary component, fallback to error UI
2. **Resolution errors:** DanglingReference exception with recovery chain
   - Try block-specific recover function
   - Try app-level recover function
   - Fall through to error UI
3. **HTTP errors:** HttpError class in `engine/errors.ts`
   - Caught by middleware, returned as proper HTTP responses
   - Correlation IDs for debugging
4. **Async errors:** RequestContext signal allows abort propagation
   - Blocks can listen to `context.signal` for cancellation
   - Prevents memory leaks from orphaned requests

**Key Files:** `engine/errors.ts`, `runtime/errors.ts`, `components/section.tsx` (ErrorBoundary)

## Cross-Cutting Concerns

**Logging:**
- Observability layer uses @std/log for structured logging
- Request-level correlation IDs via AsyncLocalStorage
- Server timings header for performance debugging
- Formatters in `utils/log.ts`

**Validation:**
- TypeScript interface → JSON schema → editor UI validation
- Props validation happens on invocation
- Schema-based error messages for content editors
- Handled by schema transform layer

**Authentication:**
- Context-based auth via `blocks/account.ts`
- Account info stored in global context
- Blocks can access via `useContext()` (section) or context parameter
- Admin-only routes checked via middleware

**Caching:**
- HTTP caching via Cache-Control headers
- Resolver result caching per-request (no cross-request cache by default)
- Optional file-system/memory caches via `runtime/caches/`
- TTL and invalidation via Decofile onChange()

**Request Context:**
- AsyncLocalStorage-based context via `RequestContext` in `deco.ts`
- Available to all blocks during request lifecycle
- Framework detection (Fresh vs HTMX)
- AbortSignal for request cancellation

**Observability (Tracing):**
- OpenTelemetry instrumentation
- Root span per request in middleware
- Child spans for block resolution, rendering
- Attributes: site name, route, method, status, timings
- Integration point in `runtime/middleware.ts` line 260+

---

*Architecture analysis: 2026-02-14*
