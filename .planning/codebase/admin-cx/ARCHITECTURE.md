# Architecture

**Analysis Date:** 2026-02-14

## Pattern Overview

**Overall:** Deno Full-Stack Fresh Application with Multi-Platform Deployment Abstraction

**Key Characteristics:**
- Server-side rendered UI with Preact components and client-side interactivity via signals
- Data fetching layer separation: loaders for reads, actions for writes
- Platform abstraction pattern for multi-platform deployments (Kubernetes, Deno Deploy, Denocluster)
- Middleware-based request processing chain
- Deco.cx app extension system for managing dependencies and manifests
- Role-based authorization with policy enforcement

## Layers

**Routing & HTTP**
- Purpose: HTTP request handling, routing, middleware chain
- Location: `routes/`, `middlewares/`
- Contains: Fresh route modules, middleware handlers, API endpoints
- Depends on: Fresh framework, Deco runtime
- Used by: Client and server for all HTTP communication

**Server State & Auth**
- Purpose: Authentication, authorization, session management, request context
- Location: `middlewares/withAuth.ts`, `middlewares/withDecoState.ts`, `configstore/`
- Contains: JWT validation, Supabase session handling, auth context binding
- Depends on: Supabase client, JWT verification, policy system
- Used by: All protected endpoints and operations

**Data Access Layer**
- Purpose: Loaders (reads) and Actions (writes) following Deco patterns
- Location: `loaders/`, `actions/`
- Contains: 50+ loaders for different data sources, 40+ actions for mutations
- Depends on: External clients (Supabase, GitHub, Kubernetes, analytics services)
- Used by: Components, sections, routes for data fetching and state updates

**Business Logic & Services**
- Purpose: Core functionality abstraction (git, filesystem, storage, environments)
- Location: `sdk/`, `clients/`, `hosting/`, `environments/`
- Contains: Git operations, file system abstractions, platform implementations
- Depends on: External APIs (GitHub, Kubernetes, cloud storage)
- Used by: Actions, loaders, routes for complex operations

**Components & Sections**
- Purpose: UI composition using Preact and TSX
- Location: `components/`, `sections/`, `islands/`
- Contains: Server-side components, interactive islands, page sections
- Depends on: Preact, TailwindCSS, component utils
- Used by: Routes for rendering HTML

**Infrastructure Abstraction**
- Purpose: Multi-platform deployment support
- Location: `hosting/`, `environments/`
- Contains: Kubernetes, Deno Deploy, Denocluster, Knative implementations
- Depends on: Platform-specific APIs (Kubernetes client library, Deno Deploy API)
- Used by: Actions for deployment operations

## Data Flow

**Read Flow (Loaders):**

1. Route renders component with `loader()` call
2. Loader exports `authContext` to specify required permissions
3. Deco framework validates auth, passes `AppContext`
4. Loader queries Supabase, external APIs, or SDK utilities
5. Data returned to component for rendering

**Write Flow (Actions):**

1. Island/component dispatches action via Preact signals
2. Action handler receives `Props` and `AppContext`
3. Chain of Responsibility validators check preconditions
4. Action executes business logic (git push, database insert, etc.)
5. Returns `AsyncIterableIterator<Step>` for progress tracking
6. Component receives steps and updates UI incrementally

**Request Processing:**

1. `_middleware.ts` chain processes request
   - Metrics collection
   - Security redirects
   - Supabase session loading
   - Auth enforcement
   - Deco state preparation
   - i18n identification
2. Route handler/component executes
3. Loaders run server-side
4. Fresh renders to HTML
5. Islands hydrate client-side interactivity

**State Management:**

- Server: AppContext injected into loaders/actions via Deco framework
- Client: Preact signals for reactive state updates
- Global: AdminProvider context for theme, user, preferences
- Database: Supabase PostgreSQL for authoritative state, Turso SQLite for site data

## Key Abstractions

**Loaders (Data Fetchers):**
- Purpose: Server-side data retrieval with auth boundaries
- Examples: `loaders/sites/list.ts`, `loaders/analytics/query.ts`, `loaders/monitor/summary.ts`
- Pattern: `export default async function(props, req, ctx): Promise<T>`
- Export `authContext` to specify required permissions

**Actions (Mutations):**
- Purpose: Server-side state mutations with progress tracking
- Examples: `actions/sites/create.ts`, `actions/deployments/deploy.ts`
- Pattern: Returns `AsyncIterableIterator<Step>` for multi-step operations
- Uses `createIterablePipeline()` for chainable task execution

**HostingPlatform Interface:**
- Purpose: Abstracts deployment platform differences
- Implementations: `kubernetes/`, `denodeploy/`, `denocluster/`, `kubernetes-deno2/`
- Used by: Platform selection and deployment actions
- Configuration: `apps/admin.ts` configures platform assignments per site

**Environment:**
- Purpose: Represents deployment environment configuration
- Location: `sdk/environments.ts`, `environments/`
- Types: deco, tunnel, knative environments
- Used by: Actions and loaders for environment-specific operations

**Storage Providers:**
- Purpose: Unified asset storage abstraction
- Implementations: AWS S3, GCP Storage, Supabase Storage
- Location: `sdk/storage.ts`
- Pattern: Strategy pattern - select provider by URL, site, or explicitly

**Git Operations:**
- Purpose: Repository management abstraction
- Location: `sdk/git.ts`
- Pattern: Wraps git operations with auth handling
- Used by: Site creation, deployment, code sync actions

## Entry Points

**HTTP Server:**
- Location: `main.ts`
- Triggers: `deno task start` or deployment
- Responsibilities: Initializes Fresh framework with Deco config, starts HTTP listener

**Fresh Routes:**
- Location: `routes/` with Fresh file-based routing
- Patterns:
  - `routes/index.tsx`: Landing page
  - `routes/[spaceId]/index.tsx`: Workspace hub
  - `routes/admin/[site]/[...catchall].tsx`: Site admin dashboard
  - `routes/api/[site]/*`: API endpoints for site operations
  - `routes/oauth/*`: OAuth callback handlers

**Middleware Chain:**
- Location: `routes/_middleware.ts`
- Order: metrics → redirects → supabase → auth → deco-state → i18n
- Each middleware processes request and calls `ctx.next()`

**App Initialization:**
- Location: `apps/admin.ts`
- Exports: Deco App with state, manifest, dependencies
- Responsibilities: Configure platforms, clients, storage providers, permissions

## Error Handling

**Strategy:** Try-catch in actions/loaders with typed error responses

**Patterns:**

- Validation: Chain of Responsibility validators throw early (e.g., `SiteNameLengthValidator`)
- Database: Supabase errors propagated with context
- Auth: Middleware throws 401/403 for auth failures
- Async Operations: Try-finally in action steps for cleanup
- User Feedback: Actions return `{ error: string }` Step for UI error messages

## Cross-Cutting Concerns

**Logging:** `@deco/deco/o11y` logger used throughout; observability/metrics.ts collects Prometheus metrics

**Validation:**
- Zod schemas for runtime validation
- Chain of Responsibility pattern for multi-step validation (see `actions/sites/create.ts`)
- Auth context exports in loaders specify permission requirements

**Authentication:**
- JWT tokens with Supabase session
- `AuthContext` binding for elevated operations
- Middleware validates on protected routes

**Authorization:**
- Role-based policies via `permissions/` system
- Policy checks in middleware and loaders via `authContext`
- Server can run operations as admin via `dangerouslyRunAsAdmin()`

**Metrics & Observability:**
- Prometheus client for application metrics
- HyperDX integration for error tracking
- Route patterns tracked in `ctx.state.routePattern`

---

*Architecture analysis: 2026-02-14*
