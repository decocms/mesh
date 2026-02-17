# Hosting Plugin for Mesh — Research & Plan

## Context

We're unbundling deco features into separate products (CMS, Hosting, Stack) as mesh plugins. The goal is to gradually replace admin-cx with mesh plugins. Hosting is the next opportunity.

**Inspiration**: [CloudRouter.dev](https://cloudrouter.dev/) — agent-driven cloud sandbox management, installed as a skill, spins up VMs/GPUs on demand. Key insight: hosting as a composable tool that agents can operate.

**Architecture from diagram**: Studio (mesh) → Plugins → "Agentic Admin site hosting" → Production Automations + Production Site. The control plane for projects lives in the same deploy as mesh, with physically separate deploys for the data plane.

---

## What admin-cx Hosting Currently Does

### Core Capabilities (to replicate as plugin)

| Capability | admin-cx Location | Complexity |
|---|---|---|
| **Site CRUD** | `actions/sites/create.ts`, `delete.ts`, `duplicate.ts` | Medium |
| **Deployments** | `actions/hosting/deploy.ts`, `loaders/sites/deployments/list.ts` | High |
| **Deployment Promotion** | `routes/api/promote/[site].ts` | Medium |
| **Deployment Logs** | `loaders/sites/deployments/logs.ts` (streaming) | Medium |
| **Build Logs** | `loaders/build/logs.ts` | Low |
| **Environments** | `actions/environments/create.ts`, `delete.ts`, `update.ts`, `rebase.ts` | High |
| **Environment Scaling** | K8s scale-to-zero/from-zero | Medium |
| **Domain Management** | `actions/domains/*` (apex, CNAME, CAA validation) | High |
| **SSL Certificates** | `certificates/` (cert-manager, LetsEncrypt, AWS ACM) | Medium |
| **Custom Hostnames** | Cloudflare custom hostname API | Medium |
| **Monitoring** | `loaders/monitor/*` (requests, bandwidth, cache, latency, status codes) | High |
| **HyperDX Observability** | `loaders/hyperdx/*` (error patterns, time series) | Medium |
| **Cloudflare Analytics** | `loaders/cloudflare/*` (realtime, per-interval, cache, latencies) | Medium |
| **Resource Usage** | `loaders/infra/resourceUsage.ts` (Prometheus + Deno metrics) | Medium |
| **GitHub Integration** | Webhooks, PR previews, push-to-deploy, status checks | High |
| **Self-Hosting** | `actions/github/connectSelfHosting.ts` | Medium |
| **Env Variables** | `actions/sites/setEnvVars.ts` | Low |
| **Platform Abstraction** | `hosting/platform.ts` (K8s, Deno Deploy, Deno Cluster) | High |

### Infrastructure Clients (backend services to call)

- **Deno Deploy Client** (`clients/deno.ts`) — project CRUD, domain management, certificates, deployment promotion, logs
- **Cloudflare Client** (`clients/cloudflare.ts`) — DNS records, custom hostnames, SSL, page rules, load balancers, R2, analytics
- **Kubernetes** (`hosting/kubernetes/`) — Knative services, HPA, volumes, build jobs
- **Prometheus** (`clients/prometheus.ts`) — infrastructure metrics
- **HyperDX** (`clients/hyperdx.ts`) — error tracking, time series
- **ClickHouse** (`clients/clickhouseAnalytics.ts`) — real-time analytics
- **GitHub** (`clients/github.ts`) — webhooks, status, PRs, installation tokens

### Auth System (separate from mesh)

- **Supabase Auth** with cookie-based JWT sessions
- **Database**: Supabase PostgreSQL with tables: `profiles`, `teams`, `members`, `roles`, `member_roles`, `permissions`, `api_key`, `connections_admin`
- **RBAC**: Owner, Publisher, Collaborator, Admin roles with policy-based statements
- **Auth methods**: Magic link, GitHub OAuth, API keys, MCP connection tokens, impersonation

---

## Mesh Plugin Architecture (what we have to work with)

### Plugin Structure
- **Client Plugin**: `id`, `description`, `binding`, `setup()`, `renderHeader()`, `renderEmptyState()`
- **Server Plugin**: `id`, `description`, `tools[]`, `routes()`, `publicRoutes()`, `migrations[]`, `createStorage()`, `onEvents`, `onStartup()`
- **Registration**: client in `apps/mesh/src/web/plugins.ts`, server in `apps/mesh/src/server-plugins.ts`

### Key Patterns
- **Bindings**: Type-safe tool definitions (Zod schemas) that MCPs must implement
- **Plugin Router**: TanStack Router integration with `createPluginRouter()`
- **Plugin Context**: `usePluginContext<TBinding>()` provides typed `toolCaller`, `connection`, `org`, `session`
- **Public Routes**: For landing pages, OAuth flows, webhooks — no mesh auth required
- **Server Tools**: MCP tools gated by org-level plugin enablement
- **Migrations**: Per-plugin database migrations via Kysely
- **Events**: Subscribe to event patterns, publish follow-up events

### Existing Plugin Examples
- **Site Editor**: Full client+server, SITE_BINDING, sidebar groups, 23 MCP tools
- **User Sandbox**: Public routes for connect flow, landing page components, OAuth
- **Object Storage**: Client-only, OBJECT_STORAGE_BINDING, file browser
- **Reports**: Client-only, REPORTS_BINDING, observability sidebar

---

## The Auth Bridge Problem

**Challenge**: admin-cx uses Supabase Auth (separate database). Mesh uses Better Auth. A user in mesh needs to prove they're a valid admin.deco.cx user to access hosting features.

### Proposed Solution: OAuth Bridge + MCP Connection

```
User in Mesh → "Connect Hosting" → OAuth flow to admin.deco.cx →
  admin-cx validates user → returns scoped token →
  Mesh stores as MCP connection → Plugin uses token to call hosting APIs
```

**Implementation Options**:

#### Option A: admin-cx as MCP Server (Recommended)
1. Build an MCP server that wraps admin-cx hosting APIs
2. User installs this MCP server in their mesh workspace, authenticating via OAuth to admin.deco.cx
3. Plugin UI calls tools through the MCP connection
4. **Pros**: Clean separation, composable, agents can also use the tools, follows mesh patterns
5. **Cons**: Need to build MCP server layer on admin-cx side

#### Option B: Direct API Proxy via Plugin Server Routes
1. Plugin server stores admin-cx auth tokens (from OAuth)
2. Plugin server routes proxy to admin-cx APIs
3. **Pros**: Simpler initially
4. **Cons**: Doesn't follow MCP pattern, not agent-accessible

#### Option C: Shared Token Exchange
1. Mesh and admin-cx share a token exchange endpoint
2. Mesh Better Auth session → exchange → admin-cx Supabase session
3. **Pros**: Seamless UX
4. **Cons**: Tight coupling, security complexity

**Recommendation**: Option A. It follows the mesh philosophy (everything is MCP), makes hosting tools available to agents, and cleanly separates concerns. The MCP server for admin-cx becomes the standard API for hosting — not just for mesh, but for any MCP client.

---

## Hosting MCP Server (new component)

A new MCP server that wraps admin-cx hosting APIs. This is the **data plane connector**.

### Tools to Expose

```
# Site Management
hosting:list-sites          → List user's sites with status
hosting:get-site            → Get site details (domains, platform, metadata)
hosting:create-site         → Create new site (from template or repo)
hosting:delete-site         → Delete site

# Deployments
hosting:list-deployments    → List deployments (with pagination)
hosting:get-deployment-logs → Stream deployment logs
hosting:deploy              → Trigger deployment (from commit or branch)
hosting:promote-deployment  → Promote deployment to production
hosting:get-build-logs      → Get build logs for a deployment

# Environments
hosting:list-environments   → List environments for a site
hosting:create-environment  → Create new environment (staging/preview)
hosting:delete-environment  → Delete environment
hosting:update-environment  → Update environment head/config
hosting:get-environment-logs → Stream environment logs

# Domains
hosting:list-domains        → List domains for a site
hosting:add-domain          → Add custom domain
hosting:validate-domain     → Validate domain DNS
hosting:remove-domain       → Remove domain
hosting:get-domain-status   → Check domain/SSL status

# Monitoring
hosting:get-metrics-summary → Requests, bandwidth, cache ratio, latency
hosting:get-status-codes    → Status code distribution
hosting:get-top-paths       → Most accessed paths
hosting:get-top-countries   → Traffic by country
hosting:get-error-patterns  → Top error patterns
hosting:get-usage-timeline  → Usage over time

# Configuration
hosting:get-env-vars        → Get environment variables
hosting:set-env-vars        → Set environment variables
hosting:get-scaling-config  → Get scaling parameters
hosting:set-scaling-config  → Set min/max scale
```

### Implementation
- Built as a standalone MCP server (TypeScript)
- Authenticates to admin-cx via OAuth tokens (scoped per user+team)
- Can be published to MCP registry
- Users install it in mesh with their credentials

---

## Plugin Design: `mesh-plugin-hosting`

### Plugin Identity
- **ID**: `hosting`
- **Description**: "Manage your deco hosting — sites, deployments, environments, domains, and monitoring"

### Binding: `HOSTING_BINDING`

```typescript
const HOSTING_BINDING = [
  // Sites
  { name: "LIST_SITES", input: z.object({ teamId: z.string().optional() }), output: z.array(SiteSchema) },
  { name: "GET_SITE", input: z.object({ siteName: z.string() }), output: SiteDetailSchema },
  { name: "CREATE_SITE", input: CreateSiteSchema, output: SiteSchema },
  { name: "DELETE_SITE", input: z.object({ siteName: z.string() }), output: z.boolean() },

  // Deployments
  { name: "LIST_DEPLOYMENTS", input: z.object({ siteName: z.string(), page: z.number().optional() }), output: DeploymentListSchema },
  { name: "DEPLOY", input: DeployInputSchema, output: DeploymentSchema },
  { name: "PROMOTE_DEPLOYMENT", input: z.object({ siteName: z.string(), deploymentId: z.string() }), output: z.boolean() },
  { name: "GET_DEPLOYMENT_LOGS", input: DeploymentLogsInputSchema, output: z.array(LogEntrySchema) },

  // Environments
  { name: "LIST_ENVIRONMENTS", input: z.object({ siteName: z.string() }), output: z.array(EnvironmentSchema) },
  { name: "CREATE_ENVIRONMENT", input: CreateEnvSchema, output: EnvironmentSchema },
  { name: "DELETE_ENVIRONMENT", input: z.object({ siteName: z.string(), envName: z.string() }), output: z.boolean() },

  // Domains
  { name: "LIST_DOMAINS", input: z.object({ siteName: z.string() }), output: z.array(DomainSchema) },
  { name: "ADD_DOMAIN", input: AddDomainSchema, output: DomainSchema },
  { name: "VALIDATE_DOMAIN", input: z.object({ siteName: z.string(), domain: z.string() }), output: DomainValidationSchema },

  // Monitoring
  { name: "GET_METRICS_SUMMARY", input: MetricsInputSchema, output: MetricsSummarySchema },
  { name: "GET_ERROR_PATTERNS", input: z.object({ siteName: z.string() }), output: z.array(ErrorPatternSchema) },
];
```

### UI Pages (Client Plugin)

#### Sidebar Structure
```
Hosting
├── Sites           → Site list with status badges
├── Deployments     → Deployment history with logs
├── Environments    → Environment management
├── Domains         → Domain & SSL management
└── Monitoring      → Dashboard with metrics
```

#### Page Designs

**1. Sites Overview** (`/`)
- Grid/list of sites with: name, status (live/building/error), production domain, last deploy time
- Quick actions: deploy, open site, view logs
- Create new site button
- Filter by team/status

**2. Site Detail** (`/sites/$siteName`)
- Header: site name, production URL, GitHub repo link, platform badge
- Tabs: Overview | Deployments | Environments | Domains | Settings
- Overview: recent deploys, current env status, quick metrics

**3. Deployments** (`/sites/$siteName/deployments`)
- Timeline of deployments with: commit hash, author, time, status, domains
- Expand to see build/deploy logs (streaming)
- "Promote to Production" button for preview deploys
- "Rollback" by promoting a previous deployment

**4. Environments** (`/sites/$siteName/environments`)
- Cards for each env: name, URL, branch, last updated, status
- Create new environment (branch-based or content-based)
- Scale controls (scale to zero / from zero)
- Environment logs viewer
- PR preview environments auto-listed

**5. Domains** (`/sites/$siteName/domains`)
- List of domains with status badges (Active, Pending DNS, SSL Pending)
- DNS record instructions (CNAME, TXT, A records)
- SSL certificate status and expiry
- Add custom domain flow with validation steps
- Apex domain redirect setup

**6. Monitoring Dashboard** (`/sites/$siteName/monitoring`)
- Time-range selector (1h, 24h, 7d, 30d)
- Metrics cards: Total Requests, Bandwidth, Cache Hit Ratio, Avg Latency, Error Rate
- Charts: Requests over time, Status code distribution, Top paths, Top countries
- Error patterns table (from HyperDX)

**7. Settings** (`/sites/$siteName/settings`)
- Environment variables editor (key-value with secret masking)
- Scaling configuration (min/max instances)
- Build configuration
- Platform info
- Danger zone: delete site

### Server Plugin

The server plugin is **lightweight** — it doesn't hold hosting logic itself. The MCP server does. But it provides:

1. **Public Routes** for:
   - OAuth callback from admin.deco.cx (`/api/hosting/auth/callback`)
   - GitHub webhook forwarding (`/api/hosting/webhooks/github`)
   - Landing page API (`/api/hosting/landing/*`)

2. **Server Tools** for:
   - `HOSTING_CONNECT` — Initiate OAuth flow to connect admin.deco.cx account
   - `HOSTING_STATUS` — Check connection status
   - `HOSTING_DISCONNECT` — Remove connection

3. **Migrations** for:
   - `hosting_connections` table — stores OAuth tokens per user/org
   - `hosting_settings` table — per-project hosting preferences

---

## Landing Page Strategy

The plugin should have a public-facing landing page that works as a standalone product page.

### Approach: Public Routes + Exported Components

Following the User Sandbox pattern:
1. **Public route** at `/hosting` serves the landing page (no mesh auth)
2. **React components** exported for embedding
3. **CTA**: "Get Started" → leads to mesh signup/login → plugin enablement

### Landing Page Content
- Hero: "Ship faster with deco hosting" — edge-native deployment platform
- Features: Instant deploys, preview environments, custom domains, monitoring, scale-to-zero
- Pricing tiers (pulled from a config)
- "Powered by mesh" branding
- Agent-ready: "Your AI agents can deploy too" angle (CloudRouter inspiration)

---

## Phased Implementation Plan

### Phase 1: Foundation (MCP Server + Basic Plugin Shell)

**Goal**: User can connect their admin.deco.cx account and see their sites in mesh.

1. **Create Hosting MCP Server** (standalone package)
   - OAuth flow for admin.deco.cx authentication
   - Implement core tools: `LIST_SITES`, `GET_SITE`, `LIST_DEPLOYMENTS`, `LIST_ENVIRONMENTS`, `LIST_DOMAINS`
   - Publish to MCP registry (or self-host)

2. **Create `mesh-plugin-hosting` package**
   - Client plugin with HOSTING_BINDING
   - Server plugin with connection management routes
   - Basic sidebar with "Sites" page
   - Connection flow: "Connect your deco hosting account"

3. **Sites Overview Page**
   - List sites from MCP connection
   - Status badges, production URLs
   - Basic site detail page

**Deliverable**: Users can browse their sites and basic info in mesh.

### Phase 2: Deployment & Environment Management

**Goal**: Full deployment workflow in mesh.

1. **Extend MCP Server** with deployment tools
   - `DEPLOY`, `PROMOTE_DEPLOYMENT`, `GET_DEPLOYMENT_LOGS`, `GET_BUILD_LOGS`
   - `CREATE_ENVIRONMENT`, `DELETE_ENVIRONMENT`, `GET_ENVIRONMENT_LOGS`

2. **Deployments UI**
   - Deployment history timeline
   - Log viewer (streaming)
   - Promote/rollback actions
   - Build log viewer

3. **Environments UI**
   - Environment cards with status
   - Create/delete environments
   - Scale controls
   - Log viewer

**Deliverable**: Users can deploy, manage environments, and view logs entirely from mesh.

### Phase 3: Domains & Configuration

**Goal**: Full domain and configuration management.

1. **Extend MCP Server** with domain + config tools
   - `ADD_DOMAIN`, `VALIDATE_DOMAIN`, `REMOVE_DOMAIN`, `GET_DOMAIN_STATUS`
   - `GET_ENV_VARS`, `SET_ENV_VARS`, `GET_SCALING_CONFIG`, `SET_SCALING_CONFIG`

2. **Domains UI**
   - Domain list with status
   - Add domain wizard (CNAME instructions, validation progress)
   - SSL status display
   - Apex domain setup

3. **Settings UI**
   - Env var editor
   - Scaling config
   - Platform info

**Deliverable**: Complete site configuration from mesh.

### Phase 4: Monitoring & Observability

**Goal**: Full monitoring dashboard.

1. **Extend MCP Server** with monitoring tools
   - All `GET_METRICS_*`, `GET_ERROR_PATTERNS`, `GET_USAGE_TIMELINE` tools

2. **Monitoring Dashboard UI**
   - Metrics summary cards
   - Time-series charts (using a charting library)
   - Status code breakdown
   - Top paths / top countries tables
   - Error patterns feed

**Deliverable**: Complete monitoring dashboard in mesh.

### Phase 5: Landing Page & Product Polish

**Goal**: Hosting as a standalone product.

1. **Landing Page**
   - Public route with product marketing
   - Pricing display
   - Getting started flow

2. **Create Site Flow**
   - Template gallery
   - GitHub repo connection
   - Wizard for new site creation

3. **Agent Integration Story**
   - Document how agents can use hosting tools
   - Example prompts: "Deploy my site", "Create a preview environment for branch X"
   - Integration with mesh assistant for hosting commands

4. **Polish**
   - Responsive design
   - Loading states, error handling
   - Keyboard shortcuts
   - Notification system (deploy success/failure)

**Deliverable**: Hosting is a complete, standalone product accessible through mesh.

---

## Key Decisions to Make

1. **MCP Server hosting**: Where does the hosting MCP server run? Options:
   - As a sidecar in admin-cx (simplest, direct DB access)
   - As a standalone service (cleaner separation)
   - As a Deno Deploy function (edge-native)

2. **Auth token storage**: Where to store the admin-cx OAuth tokens?
   - In mesh's database (plugin migration)
   - In the MCP connection config (standard mesh pattern)
   - Encrypted vault

3. **Real-time features**: Deployment logs and monitoring need streaming. Options:
   - SSE through MCP server
   - WebSocket from plugin server routes
   - Polling with smart intervals

4. **GitHub webhooks**: Who receives them?
   - Keep in admin-cx, forward events to mesh via MCP events
   - Move webhook handling to plugin server routes
   - Both (admin-cx primary, mesh subscribes)

5. **Monitoring data source**: Direct access or through admin-cx?
   - Through admin-cx APIs (simpler, already aggregated)
   - Direct ClickHouse/Prometheus queries from MCP server (faster, more flexible)

---

## File Structure

```
mesh/packages/mesh-plugin-hosting/
├── client/
│   ├── index.tsx                    # Client plugin export
│   ├── lib/
│   │   ├── router.ts               # Plugin router
│   │   ├── query-keys.ts           # React Query keys
│   │   └── schemas.ts              # Zod schemas for UI
│   ├── components/
│   │   ├── plugin-header.tsx
│   │   ├── plugin-empty-state.tsx
│   │   ├── sites/
│   │   │   ├── sites-list.tsx
│   │   │   ├── site-detail.tsx
│   │   │   └── create-site-dialog.tsx
│   │   ├── deployments/
│   │   │   ├── deployment-list.tsx
│   │   │   ├── deployment-logs.tsx
│   │   │   └── promote-dialog.tsx
│   │   ├── environments/
│   │   │   ├── environment-list.tsx
│   │   │   ├── create-env-dialog.tsx
│   │   │   └── env-logs.tsx
│   │   ├── domains/
│   │   │   ├── domain-list.tsx
│   │   │   ├── add-domain-wizard.tsx
│   │   │   └── domain-status.tsx
│   │   ├── monitoring/
│   │   │   ├── dashboard.tsx
│   │   │   ├── metrics-cards.tsx
│   │   │   ├── charts.tsx
│   │   │   └── error-patterns.tsx
│   │   └── settings/
│   │       ├── env-vars-editor.tsx
│   │       ├── scaling-config.tsx
│   │       └── danger-zone.tsx
│   └── hooks/
│       ├── use-sites.ts
│       ├── use-deployments.ts
│       ├── use-environments.ts
│       └── use-monitoring.ts
├── server/
│   ├── index.ts                     # Server plugin export
│   ├── routes/
│   │   ├── auth-callback.ts         # OAuth callback
│   │   ├── webhooks.ts              # GitHub webhook forwarding
│   │   └── landing.ts               # Landing page API
│   ├── tools/
│   │   ├── connect.ts               # Connection management tools
│   │   └── status.ts
│   └── migrations/
│       └── 001-hosting.ts
├── shared.ts                        # Plugin ID, constants
└── package.json
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| admin-cx API instability | Plugin breaks when admin-cx changes | Version the MCP server API, integration tests |
| Auth token expiry | Silent failures | Token refresh in MCP server, clear error states in UI |
| Streaming logs complexity | Poor UX | Start with polling, upgrade to SSE later |
| admin-cx deprecation timing | Features in limbo | Plugin reads from same data sources, gradual migration |
| Performance (MCP overhead) | Slow UI | Aggressive caching in MCP server, React Query in UI |

---

## CloudRouter Inspiration — Agent-Native Hosting

The key insight from CloudRouter: hosting should be **agent-operable**. This means:

1. Every hosting operation is an MCP tool (already planned above)
2. Agents can: create sites, deploy, manage environments, check monitoring
3. Natural language: "Deploy the latest commit to staging" → agent calls `DEPLOY` tool
4. Environments are perfect for agent sandboxes (spin up, test, tear down)
5. The hosting plugin becomes the agent's interface to production infrastructure

This positions deco hosting not just as a UI product, but as an **agent-native infrastructure layer** — something CloudRouter pioneered for VMs, but we do for full web hosting.
