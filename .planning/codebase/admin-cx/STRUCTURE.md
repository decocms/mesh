# Codebase Structure

**Analysis Date:** 2026-02-14

## Directory Layout

```
admin-cx/
├── actions/                    # Server-side mutations (40+ subdirectories)
├── components/                 # Preact components (server and shared)
├── clients/                    # External service integrations
├── environments/               # Environment platform implementations
├── hosting/                    # Deployment platform abstractions
├── islands/                    # Interactive Preact components (client hydration)
├── loaders/                    # Server-side data fetchers (50+ subdirectories)
├── middlewares/                # Fresh middleware chain
├── routes/                     # Fresh page routes and API endpoints
├── sections/                   # Composable page sections
├── sdk/                        # Core utilities and abstractions
├── i18n/                       # Translation files (en-US.ts, pt-BR.ts, es-AR.ts)
├── static/                     # Static assets (images, fonts, scripts)
├── tests/                      # Test suites (component, cypress, rls)
├── utils/                      # Shared utilities by concern
├── observability/              # Metrics and monitoring
├── permissions/                # Authorization policy definitions
├── main.ts                     # Server entry point
├── fresh.config.ts             # Fresh framework configuration
├── deno.json                   # Deno dependencies and tasks
└── manifest.gen.ts             # Auto-generated Deco manifest
```

## Directory Purposes

**actions/**
- Purpose: Server-side mutations following Deco pattern
- Contains: Business logic for site creation, deployment, team management, etc.
- Pattern: Organized by domain (sites/, hosting/, teams/, etc.)
- Returns: `AsyncIterableIterator<Step>` for progress tracking
- Key dirs: `actions/sites/`, `actions/hosting/`, `actions/deployments/`, `actions/teams/`

**components/**
- Purpose: Reusable Preact components for server and client
- Contains: UI building blocks, layouts, forms, charts
- Subdirs: `ui/` (basic components), `layout/` (page structure), `charts/` (visualizations)
- Pattern: Functional components with props interfaces
- Key files: `components/layout/BaseLayout.tsx`, `components/ui/Button.tsx`

**clients/**
- Purpose: External API integrations and service wrappers
- Contains: GitHub, Supabase, Cloudflare, OpenAI, analytics clients
- Key files:
  - `clients/github.ts`: GitHub API wrapper with caching
  - `clients/supabase/index.ts`: Supabase client initialization
  - `clients/stripe.ts`: Stripe integration
  - `clients/hyperdx.ts`: Error tracking client

**environments/**
- Purpose: Environment platform-specific implementations
- Contains: Knative, Tunnel, Deco, content environment handlers
- Pattern: Each environment provides deployment/runtime abstraction
- Key file: `environments/platform.ts` - base platform interface

**hosting/**
- Purpose: Deployment platform abstractions
- Contains: Kubernetes, Deno Deploy, Denocluster implementations
- Each platform implements: loaders, actions, manifest for deployment ops
- Key dirs:
  - `hosting/kubernetes/`: Primary Kubernetes platform (supports AWS/GCP)
  - `hosting/denodeploy/`: Deno Deploy integration
  - `hosting/denocluster/`: Deno cluster management

**islands/**
- Purpose: Interactive Preact components that hydrate on client
- Contains: Forms, dialogs, real-time data visualizations
- Pattern: Island components receive `signal` state for reactivity
- Examples: `islands/CreateSite.tsx`, `islands/Chart.tsx`, `islands/DataTable.tsx`

**loaders/**
- Purpose: Server-side data fetchers following Deco pattern
- Contains: Database queries, API calls, computations
- Pattern: Organized by domain (sites/, analytics/, hosting/, etc.)
- Export `authContext` to specify permission requirements
- Key dirs:
  - `loaders/sites/`: Site data (list, metadata, assets)
  - `loaders/analytics/`: Query analytics from various sources
  - `loaders/monitor/`: Real-time monitoring data
  - `loaders/admin/`: Admin dashboard data

**middlewares/**
- Purpose: Fresh middleware for request processing
- Files:
  - `withAuth.ts`: Session and auth validation
  - `withDecoState.ts`: Deco state preparation
  - `withMetrics.ts`: Request metrics collection
  - `withRedirects.ts`: Static redirects
  - `app.withAuthorization.ts`: App-level authorization
- Pattern: Middleware chain processes request sequentially

**routes/**
- Purpose: Fresh page routes and API endpoints
- Pattern: File-based routing matching Fresh conventions
- Key routes:
  - `routes/index.tsx`: Landing/home
  - `routes/[spaceId]/index.tsx`: Workspace hub
  - `routes/admin/[...catchall].tsx`: Admin dashboard catch-all
  - `routes/admin/[site]/analytics.tsx`: Site analytics page
  - `routes/api/`: API endpoints (site operations, webhooks)
  - `routes/oauth/`: OAuth callback handlers
  - `routes/_middleware.ts`: Global middleware chain

**sections/**
- Purpose: Composable page sections for complex layouts
- Contains: Page composition blocks (views, sidebars, login sections)
- Dirs: `sections/views/`, `sections/sidebar/`, `sections/login/`
- Pattern: Sections composed into routes for page construction

**sdk/**
- Purpose: Core utilities and abstractions
- Key files:
  - `sdk/fs.ts`: Filesystem abstraction (read, write, delete)
  - `sdk/git.ts`: Git operations wrapper
  - `sdk/storage.ts`: Storage provider abstraction (AWS, GCP, Supabase)
  - `sdk/environments.ts`: Environment configuration
  - `sdk/decofile.json.ts`: Decofile parsing
  - `sdk/manifest.ts`: Manifest utilities
  - `sdk/admin.ts`: Admin-specific utilities
  - `sdk/auth.tsx`: Auth context and hooks

**i18n/**
- Purpose: Internationalization translations
- Files: `en-US.ts`, `pt-BR.ts`, `es-AR.ts`
- Pattern: `t("key")` or `t("key", { param: value })`
- Pluralization: Use `count` param for pluralized strings

**static/**
- Purpose: Static assets served directly
- Subdirs: `fonts/`, `images/`, `scripts/`, `third-party/`
- Not committed changes; versioned in Git

**tests/**
- Purpose: Test suites
- Dirs:
  - `tests/components/`: Component tests with Puppeteer
  - `tests/cypress/`: E2E tests
  - `tests/rls/`: Row-level security tests
- Pattern: Deno test format with `Puppeteer` for component testing

**utils/**
- Purpose: Shared utilities organized by concern
- Subdirs:
  - `utils/github/`: GitHub utilities
  - `utils/loaders/`: Loader utilities
  - `utils/routes/`: Routing utilities
  - `utils/statistics/`: Statistics utilities
- Key files: `utils/auth.ts`, `utils/errors.ts`, `utils/constants.ts`

**observability/**
- Purpose: Metrics and monitoring
- Key files: `observability/metrics.ts` (Prometheus), `observability/measure.ts` (timing)

**permissions/**
- Purpose: Authorization policy definitions
- Files: `permissions/checkPolicies.ts`, policy validation logic

## Key File Locations

**Entry Points:**
- `main.ts`: Deno/Fresh server entry point
- `fresh.config.ts`: Fresh framework configuration with Deco bindings
- `apps/admin.ts`: Deco app initialization (platforms, clients, state)

**Configuration:**
- `deno.json`: Deno tasks, imports, compiler options
- `fresh.gen.ts`: Auto-generated route/island registry (do not edit)
- `manifest.gen.ts`: Auto-generated Deco manifest (do not edit)

**Core Logic:**
- `loaders/sites/list.ts`: Fetch site list
- `actions/sites/create.ts`: Multi-step site creation
- `clients/supabase/index.ts`: Database client
- `clients/github.ts`: GitHub API wrapper
- `hosting/kubernetes/mod.ts`: Kubernetes platform app

**Testing:**
- `tests/components/select_test.ts`: Component test example
- `tests/components/test_utils.ts`: Test utilities
- `tests/rls/test_supa_rls.ts`: RLS test examples

## Naming Conventions

**Files:**
- Loaders: `loaders/[domain]/[operation].ts` (e.g., `loaders/sites/list.ts`)
- Actions: `actions/[domain]/[operation].ts` (e.g., `actions/sites/create.ts`)
- Components: `components/[Category]/ComponentName.tsx` (PascalCase)
- Islands: `islands/ComponentName.tsx` (PascalCase, interactive)
- Utils: `utils/[concern]/functionName.ts` (camelCase)
- Routes: `routes/[pattern]/index.tsx` or `routes/api/[...catchall].ts`

**Functions:**
- Loaders/Actions: camelCase with defaults exported
- Components: PascalCase (Preact convention)
- Utilities: camelCase
- Handlers: `handleEventName` or `onEventName`

**Types/Interfaces:**
- PascalCase (e.g., `Props`, `CreateContext`, `HostingPlatform`)
- Props always named `Props` for consistency
- Context types suffix with `Context` (e.g., `AppContext`, `CreateContext`)

**Variables:**
- Constants: UPPER_SNAKE_CASE
- State: camelCase
- Booleans prefix with `is` or `has` (e.g., `isLoading`, `hasError`)

**Directories:**
- kebab-case or camelCase based on domain
- Subdirectories group by feature/concern
- Example: `actions/sites/`, `loaders/analytics/`, `components/billing/`

## Where to Add New Code

**New Feature (e.g., new dashboard page):**
- Primary code: `routes/admin/[site]/newfeature.tsx`
- Loader: `loaders/sites/newfeatureData.ts`
- Action: `actions/sites/newfeatureAction.ts`
- Components: `components/newfeature/ComponentName.tsx`
- Tests: `tests/components/newfeature_test.ts`

**New Component/Module:**
- Server component: `components/[Category]/NewComponent.tsx`
- Interactive island: `islands/NewIsland.tsx`
- Styled with TailwindCSS + DaisyUI classes

**Utilities:**
- Shared helpers: `utils/[concern]/helperName.ts`
- Domain-specific: Create subdirectory under `utils/`
- Export functions, types in barrel files

**New External Integration:**
- Client wrapper: `clients/newservice.ts`
- Loaders: `loaders/newservice/[operation].ts`
- Actions: `actions/newservice/[operation].ts`
- Include environment variables in app initialization

**New Deployment Platform:**
- Create `hosting/newplatform/` directory
- Implement platform interface from `hosting/kubernetes/mod.ts`
- Export manifest, loaders, actions
- Register in `apps/admin.ts` platform assignments

## Special Directories

**manifest.gen.ts & fresh.gen.ts:**
- Purpose: Auto-generated by Deco and Fresh frameworks
- Generated: Yes - do not commit manually
- Committed: Yes - commit after generation
- Regenerate: `deno task gen`

**.planning/codebase/**
- Purpose: GSD planning documents (this directory)
- Committed: Yes
- Contains: Architecture, structure, conventions analysis

**.deco/blocks/**
- Purpose: Deco block definitions and metadata
- Generated: No
- Contains: Block manifest for Deco CMS

**.github/workflows/**
- Purpose: GitHub Actions CI/CD
- Contains: Build, test, deploy workflows
- Key workflow: Type checking, formatting on PRs

**static/**
- Purpose: Served directly as assets
- Not tracked in codebase analysis
- Examples: Tailwind fonts, third-party scripts

---

*Structure analysis: 2026-02-14*
