# Hosting Plugin v3 — Port & Simplify

> "No love for admin-cx. Port the logic, kill the dependency, own it in mesh."

## Philosophy

Mesh was built from the ground up to be:
- **Self-hostable**: Docker compose, 1 required env var, SQLite by default
- **Enterprise-friendly**: Bring your own GCP/AWS, Postgres, SSO
- **Solo-hacker friendly**: Works on a laptop, tool-builder's dream
- **Agent-native**: Everything is MCP tools, agents operate your infra

The hosting plugin must follow the same principles. No proxy to admin-cx. No OAuth bridge. The hosting logic lives IN mesh, configured by the user, talking directly to infrastructure providers.

---

## Architecture: Provider Adapters

The core idea: hosting is a **set of provider adapters** that the user configures via MCP connections or plugin settings. Like how mesh lets you plug in any MCP server, the hosting plugin lets you plug in your infrastructure.

```
┌──────────────────────────────────────────────┐
│  mesh-plugin-hosting                          │
│                                               │
│  ┌─────────────────────────────────────────┐  │
│  │  Hosting UI (React)                     │  │
│  │  Sites · Deploys · Envs · Domains · Mon │  │
│  └──────────┬──────────────────────────────┘  │
│             │ usePluginContext → toolCaller    │
│  ┌──────────▼──────────────────────────────┐  │
│  │  Server Plugin (MCP Tools)              │  │
│  │  hosting:deploy, hosting:list-sites...  │  │
│  └──────────┬──────────────────────────────┘  │
│             │                                 │
│  ┌──────────▼──────────────────────────────┐  │
│  │  Provider Adapters (ported, simplified)  │  │
│  │                                         │  │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ │  │
│  │  │ Deno     │ │ K8s +    │ │ Docker  │ │  │
│  │  │ Deploy   │ │ Knative  │ │ (future)│ │  │
│  │  └──────────┘ └──────────┘ └─────────┘ │  │
│  │                                         │  │
│  │  ┌──────────┐ ┌──────────┐             │  │
│  │  │Cloudflare│ │ GitHub   │             │  │
│  │  │DNS + CDN │ │ Webhooks │             │  │
│  │  └──────────┘ └──────────┘             │  │
│  └─────────────────────────────────────────┘  │
│                                               │
│  ┌─────────────────────────────────────────┐  │
│  │  Hosting DB (Kysely, mesh's own DB)     │  │
│  │  sites · deployments · envs · domains   │  │
│  └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

**Key difference from v2**: No admin-cx dependency at all. The hosting plugin owns its own:
- Database tables (via plugin migrations in mesh's SQLite/Postgres)
- Provider adapters (ported from admin-cx, simplified)
- Configuration (via plugin settings, not env vars)

---

## What to Port from admin-cx (and What to Kill)

### PORT (essential logic, ~2000 lines total)

| Component | Source | Lines | Why Port |
|---|---|---|---|
| **HostingPlatform interface** | `hosting/platform.ts` | ~80 | Clean abstraction, defines the contract |
| **Deno Deploy adapter** | `clients/deno.ts` + `hosting/denodeploy/` | ~400 | Just HTTP calls to Deno Deploy API. Simplest path. |
| **Cloudflare DNS/CDN** | `clients/cloudflare.ts` (subset) | ~300 | DNS records, custom hostnames, SSL. Pure REST. |
| **Domain validation** | `actions/domains/verify*.ts` | ~200 | CNAME/CAA/apex validation. Standard DNS logic. |
| **Environment model** | `sdk/environments.ts` + `environments/platform.ts` | ~150 | Clean interface: create(opts) → url, delete(opts) |
| **K8s/Knative adapter** | `hosting/kubernetes/` (core) | ~800 | Enterprise-grade. Port the essentials, drop the cruft. |

### KILL (admin-cx coupling, legacy, unnecessary complexity)

| Component | Why Kill |
|---|---|
| Supabase client/types | Use mesh's own Kysely DB |
| withAuth middleware chain | Use mesh's Better Auth |
| deco-sites/admin imports | Decouple completely |
| Fresh framework specifics | Mesh uses Hono + React |
| GCP Tasks integration | Replace with mesh events |
| PostHog analytics | Not needed in OSS plugin |
| Multi-platform composition (`kubernetes+denodeploy`) | Start simple, one platform at a time |
| R2 storage client | Separate concern (object storage plugin) |
| HyperDX/Prometheus/ClickHouse clients | Phase 2 — monitoring is optional |
| Legacy keda/tunnel env platforms | Dead code |
| Build callback webhooks (K8s-specific) | Simplify with polling or mesh events |

### SIMPLIFY (keep concept, rewrite cleaner)

| Concept | admin-cx | mesh-plugin |
|---|---|---|
| Site metadata | Supabase `sites` table with giant metadata JSON | Typed Kysely table with proper columns |
| Deployment tracking | Supabase + in-memory | Plugin DB table |
| Environment state | Filesystem volumes + JSON patches | Plugin DB + provider state |
| Build logs | S3 + streaming | Provider API (Deno Deploy already has logs endpoint) |
| Domain status | Supabase + Cloudflare polling | Plugin DB + on-demand validation |

---

## Provider Adapter Interface

The clean contract that all hosting providers implement:

```typescript
interface HostingProvider {
  id: string;
  name: string;

  // Sites
  createSite(opts: CreateSiteOpts): Promise<Site>;
  deleteSite(siteId: string): Promise<void>;

  // Deployments
  deploy(opts: DeployOpts): Promise<Deployment>;
  listDeployments(siteId: string, opts?: PaginationOpts): Promise<Deployment[]>;
  getDeploymentLogs(deploymentId: string): Promise<LogEntry[]>;
  promoteDeployment(siteId: string, deploymentId: string): Promise<void>;

  // Environments
  createEnvironment(opts: CreateEnvOpts): Promise<Environment>;
  deleteEnvironment(siteId: string, envName: string): Promise<void>;
  listEnvironments(siteId: string): Promise<Environment[]>;
  scaleEnvironment?(siteId: string, envName: string, scale: ScaleOpts): Promise<void>;
  getEnvironmentLogs?(siteId: string, envName: string): Promise<LogEntry[]>;

  // Domains (optional — can use separate DNS provider)
  addDomain?(siteId: string, domain: string): Promise<DomainStatus>;
  removeDomain?(siteId: string, domain: string): Promise<void>;
  validateDomain?(siteId: string, domain: string): Promise<DomainValidation>;
}

interface DNSProvider {
  createRecord(opts: DNSRecordOpts): Promise<void>;
  deleteRecord(recordId: string): Promise<void>;
  listRecords(domain: string): Promise<DNSRecord[]>;
  createCustomHostname?(hostname: string): Promise<CustomHostnameStatus>;
}
```

**Solo hacker path**: Configure Deno Deploy adapter (just need a Deno Deploy API token)
**Enterprise path**: Configure K8s adapter (kubeconfig) + Cloudflare DNS adapter (API token)
**Self-hosted path**: Future Docker adapter (deploy to local/remote Docker)

---

## Configuration: Plugin Settings, Not Env Vars

Following mesh philosophy — the hosting plugin is configured through the UI, stored in the plugin's DB (encrypted via mesh's CredentialVault).

```
Plugin Settings UI:
┌─────────────────────────────────────────────┐
│  Hosting Provider                            │
│  ┌─────────────────────────────────────────┐ │
│  │ ○ Deno Deploy (Recommended for start)   │ │
│  │   API Token: [••••••••••••••••] [Test]   │ │
│  │   Organization ID: [______________]      │ │
│  │                                          │ │
│  │ ○ Kubernetes + Knative                   │ │
│  │   Kubeconfig: [Upload / Paste]           │ │
│  │   Namespace prefix: [______________]     │ │
│  │   Builder image: [______________]        │ │
│  │   Runner image: [______________]         │ │
│  │                                          │ │
│  │ ○ Docker (Coming soon)                   │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  DNS Provider (Optional)                     │
│  ┌─────────────────────────────────────────┐ │
│  │ ○ Cloudflare                             │ │
│  │   API Token: [••••••••••••••••]          │ │
│  │   Zone ID: [______________]              │ │
│  │                                          │ │
│  │ ○ None (manual DNS)                      │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  GitHub Integration (Optional)               │
│  ┌─────────────────────────────────────────┐ │
│  │   GitHub App ID: [______________]        │ │
│  │   Private Key: [Upload]                  │ │
│  │   Webhook Secret: [••••••••••••••••]     │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

All credentials stored encrypted in mesh's DB via CredentialVault.

---

## Database Schema (Plugin Migrations)

```sql
-- 001-hosting-sites.sql
CREATE TABLE hosting_sites (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  org_id TEXT NOT NULL,
  name TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,  -- 'deno-deploy' | 'kubernetes' | 'docker'
  provider_project_id TEXT,  -- provider-specific ID
  github_repo_url TEXT,
  github_owner TEXT,
  github_repo TEXT,
  production_domain TEXT,
  metadata JSON DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 002-hosting-deployments.sql
CREATE TABLE hosting_deployments (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES hosting_sites(id),
  provider_deployment_id TEXT,
  commit_sha TEXT,
  commit_message TEXT,
  commit_author TEXT,
  branch TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | building | deploying | live | failed
  is_production BOOLEAN DEFAULT FALSE,
  domains JSON DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- 003-hosting-environments.sql
CREATE TABLE hosting_environments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  site_id TEXT NOT NULL REFERENCES hosting_sites(id),
  name TEXT NOT NULL,
  url TEXT,
  branch TEXT,
  commit_sha TEXT,
  status TEXT NOT NULL DEFAULT 'creating',  -- creating | running | scaled_to_zero | error
  platform TEXT,  -- knative | deco | content
  is_production BOOLEAN DEFAULT FALSE,
  metadata JSON DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_id, name)
);

-- 004-hosting-domains.sql
CREATE TABLE hosting_domains (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  site_id TEXT NOT NULL REFERENCES hosting_sites(id),
  domain TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom',  -- production | preview | custom | apex-redirect
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | validating | active | error
  ssl_status TEXT DEFAULT 'pending',
  dns_records JSON DEFAULT '[]',  -- records user needs to create
  provider_hostname_id TEXT,  -- Cloudflare custom hostname ID
  validated_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 005-hosting-provider-config.sql
CREATE TABLE hosting_provider_config (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  org_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,  -- 'deno-deploy' | 'kubernetes' | 'cloudflare' | 'github'
  config_encrypted TEXT NOT NULL,  -- encrypted via CredentialVault
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, provider_type)
);
```

---

## MCP Tools (Server Plugin)

These are SELF tools — they run inside mesh, not via external MCP connection. Agents and UI both call them.

```typescript
const hostingTools: ServerPluginTool[] = [
  // === Sites ===
  { name: "HOSTING_LIST_SITES", handler: listSites },
  { name: "HOSTING_GET_SITE", handler: getSite },
  { name: "HOSTING_CREATE_SITE", handler: createSite },
  { name: "HOSTING_DELETE_SITE", handler: deleteSite },

  // === Deployments ===
  { name: "HOSTING_DEPLOY", handler: deploy },
  { name: "HOSTING_LIST_DEPLOYMENTS", handler: listDeployments },
  { name: "HOSTING_GET_DEPLOYMENT_LOGS", handler: getDeploymentLogs },
  { name: "HOSTING_PROMOTE", handler: promoteDeployment },

  // === Environments ===
  { name: "HOSTING_LIST_ENVIRONMENTS", handler: listEnvironments },
  { name: "HOSTING_CREATE_ENVIRONMENT", handler: createEnvironment },
  { name: "HOSTING_DELETE_ENVIRONMENT", handler: deleteEnvironment },
  { name: "HOSTING_SCALE_ENVIRONMENT", handler: scaleEnvironment },

  // === Domains ===
  { name: "HOSTING_LIST_DOMAINS", handler: listDomains },
  { name: "HOSTING_ADD_DOMAIN", handler: addDomain },
  { name: "HOSTING_VALIDATE_DOMAIN", handler: validateDomain },
  { name: "HOSTING_REMOVE_DOMAIN", handler: removeDomain },

  // === Config ===
  { name: "HOSTING_GET_CONFIG", handler: getProviderConfig },
  { name: "HOSTING_SET_CONFIG", handler: setProviderConfig },
  { name: "HOSTING_TEST_CONNECTION", handler: testProviderConnection },
];
```

Each tool handler:
1. Gets org context from `ServerPluginToolContext`
2. Loads provider config from `hosting_provider_config` table
3. Instantiates the appropriate adapter
4. Calls the adapter method
5. Updates the local DB
6. Returns result

---

## Deno Deploy Adapter (Port Priority #1)

The simplest and most complete path. Port from `admin-cx/clients/deno.ts`.

**What it is**: HTTP calls to `https://api.deno.com/v1/`. That's it.

**What to port** (~400 lines, clean HTTP client):

```typescript
class DenoDeployProvider implements HostingProvider {
  private token: string;
  private orgId: string;

  // Sites = Deno Deploy "projects"
  async createSite(opts) {
    return fetch(`https://api.deno.com/v1/organizations/${this.orgId}/projects`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ name: opts.name }),
    });
  }

  // Deployments
  async deploy(opts) {
    // Upload files + create deployment via Deno Deploy API
    // Or trigger via GitHub Actions (for repo-based deploys)
  }

  async listDeployments(siteId) {
    return fetch(`https://api.deno.com/v1/projects/${siteId}/deployments`, ...);
  }

  async getDeploymentLogs(deploymentId) {
    return fetch(`https://api.deno.com/v1/deployments/${deploymentId}/app_logs`, ...);
  }

  async promoteDeployment(siteId, deploymentId) {
    return fetch(`https://api.deno.com/v1/projects/${siteId}/deployments/${deploymentId}`, {
      method: "PATCH",
      body: JSON.stringify({ traffic: [{ percent: 100 }] }),
    });
  }

  // Domains
  async addDomain(siteId, domain) {
    return fetch(`https://api.deno.com/v1/projects/${siteId}/domains`, {
      method: "POST",
      body: JSON.stringify({ domain }),
    });
  }

  // Environments = separate Deno Deploy projects or playground deployments
  async createEnvironment(opts) {
    // Create a new deployment from a specific branch
  }
}
```

**Why start here**: Deno Deploy is what most deco sites use. Zero infra to manage. Just an API token. Perfect for solo hackers AND for deco's own hosted offering.

---

## Kubernetes + Knative Adapter (Port Priority #2)

For enterprise users who bring their own cluster.

**What to port** (~800 lines, but much of it is K8s YAML generation):

```typescript
class KubernetesProvider implements HostingProvider {
  private kubeConfig: KubeConfig;

  async createSite(opts) {
    // Create namespace
    // Create Knative service (initial, scaled to zero)
    // Create PVC for build cache
  }

  async deploy(opts) {
    // Create build Job (source → container image)
    // Create Knative revision
    // Route traffic to new revision
  }

  async createEnvironment(opts) {
    // Create Knative service for the environment
    // Configure auto-scale-to-zero
  }

  async scaleEnvironment(siteId, envName, scale) {
    // Patch Knative service annotations for min/maxScale
  }
}
```

**Simplifications from admin-cx**:
- Drop multi-cloud (AWS + GCP) builder image logic → let user configure their builder image
- Drop deco-specific PostHog tracking
- Drop Supabase state management → use plugin DB
- Drop legacy keda/tunnel platforms
- Use standard `@kubernetes/client-node` instead of deco's wrapped k8s deps

---

## Cloudflare DNS Adapter (Port Priority #3)

For custom domains. Pure REST API.

```typescript
class CloudflareDNSProvider implements DNSProvider {
  private token: string;
  private zoneId: string;

  async createRecord(opts) {
    return fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}/dns_records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: JSON.stringify(opts),
    });
  }

  async createCustomHostname(hostname) {
    return fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}/custom_hostnames`, {
      method: "POST",
      body: JSON.stringify({ hostname, ssl: { method: "http", type: "dv" } }),
    });
  }
}
```

---

## Phased Build Plan

### Phase 0: Plugin Skeleton + DB Schema (2 days)

Create the plugin package, register it, add migrations.

- `mesh-plugin-hosting/` with client + server
- All 5 migration files
- Plugin registered in mesh
- Empty sidebar shows "Configure Hosting" empty state
- Provider config settings page (UI for entering API tokens)

**Deliverable**: Plugin exists, DB ready, user can enter provider credentials.

### Phase 1: Deno Deploy Adapter + Sites (1 week)

Port Deno Deploy client, wire up site CRUD.

- `DenoDeployProvider` class (~400 lines)
- HOSTING_CREATE_SITE, HOSTING_LIST_SITES, HOSTING_GET_SITE, HOSTING_DELETE_SITE tools
- Sites grid UI with status badges
- Site detail page (header + overview)
- "Create Site" wizard (name + optional GitHub repo)
- Test connection button in settings

**Deliverable**: Users can create/manage sites on Deno Deploy from mesh.

### Phase 2: Deployments + Logs (1 week)

Full deployment workflow.

- HOSTING_DEPLOY, HOSTING_LIST_DEPLOYMENTS, HOSTING_GET_DEPLOYMENT_LOGS, HOSTING_PROMOTE tools
- Deployment timeline UI
- Log viewer (polling-based, upgrade to streaming later)
- Deploy from branch action
- Promote to production action
- GitHub webhook handler (receives push → triggers deploy)

**Deliverable**: Full deploy lifecycle from mesh. Push to GitHub → see it deploy.

### Phase 3: Environments (1 week)

The killer feature. Agent sandboxes.

- HOSTING_CREATE_ENVIRONMENT, HOSTING_DELETE_ENVIRONMENT, HOSTING_LIST_ENVIRONMENTS tools
- Environment cards UI
- Create from branch
- Environment URLs (preview links)
- For Deno Deploy: environments = preview deployments
- For K8s (future): environments = separate Knative services with scale-to-zero

**Deliverable**: Spin up/down environments. Agents can create sandboxes.

### Phase 4: Domains + Cloudflare (1 week)

Custom domains with DNS management.

- `CloudflareDNSProvider` class (~300 lines)
- Port domain validation logic (~200 lines: CNAME, CAA, apex checks)
- HOSTING_ADD_DOMAIN, HOSTING_VALIDATE_DOMAIN, HOSTING_REMOVE_DOMAIN tools
- Add domain wizard UI (step-by-step DNS instructions)
- Domain status badges (pending → validating → active)
- SSL provisioning status

**Deliverable**: Full custom domain management.

### Phase 5: Kubernetes Adapter (1-2 weeks)

For enterprise / bring-your-own-infra.

- `KubernetesProvider` class (~800 lines)
- Knative service creation + management
- Build job orchestration
- Scale-to-zero for environments
- Kubeconfig upload in settings UI

**Deliverable**: Enterprise users can use their own K8s clusters.

### Phase 6: Billing + Landing Page (1 week)

Monetization and go-to-market.

- Credit card modal (reuse mesh wallet components)
- Usage tracking per site
- Landing page (public route)
- Create site from template wizard
- Pricing display

**Deliverable**: Hosting is a product you can buy.

### Phase 7: Monitoring (1 week, optional)

Nice-to-have dashboard.

- For Deno Deploy: use their analytics API
- For K8s: optional Prometheus integration
- Metrics cards + charts
- Error rate, latency, traffic

**Deliverable**: Monitoring dashboard.

---

## Self-Hosting Story

### Solo hacker (simplest path)
```
1. docker compose up -d  (mesh is running)
2. Enable hosting plugin
3. Enter Deno Deploy API token
4. Create site → deployed to Deno Deploy
5. Point domain → Cloudflare or manual DNS
```

### Enterprise
```
1. Deploy mesh to their infra (K8s/VM)
2. Enable hosting plugin
3. Configure K8s adapter (kubeconfig)
4. Configure Cloudflare for DNS (optional)
5. Configure GitHub App for push-to-deploy (optional)
6. Teams create sites → deployed to their own cluster
```

### Deco hosted (our SaaS)
```
1. User signs up at mesh cloud
2. Hosting plugin pre-configured (our Deno Deploy org, our Cloudflare, our K8s)
3. User creates site → we handle everything
4. Billing via mesh wallet
```

All three paths use the exact same code. Just different provider configs.

---

## Migration Strategy: admin-cx → mesh

**Phase A** (now): Build the mesh plugin with Deno Deploy. It works independently.

**Phase B** (soon): For existing admin-cx users, create a one-time migration:
- Export site list from admin-cx Supabase
- Import into mesh hosting plugin DB
- Map Deno Deploy project IDs
- User switches their workflow to mesh

**Phase C** (later): Port K8s adapter. Enterprise users migrate.

**Phase D** (eventually): Turn off admin-cx hosting code. Plugin owns everything.

No OAuth bridge. No proxy. Clean cut.

---

## File Structure

```
mesh/packages/mesh-plugin-hosting/
├── client/
│   ├── index.tsx                    # ClientPlugin (no binding — SELF tools)
│   ├── lib/
│   │   ├── router.ts
│   │   ├── query-keys.ts
│   │   └── types.ts                 # Shared UI types
│   ├── components/
│   │   ├── sites/
│   │   ├── deployments/
│   │   ├── environments/
│   │   ├── domains/
│   │   ├── monitoring/
│   │   ├── settings/
│   │   │   └── provider-config.tsx   # Provider credential forms
│   │   └── billing/
│   └── hooks/
├── server/
│   ├── index.ts                     # ServerPlugin with tools
│   ├── providers/
│   │   ├── interface.ts             # HostingProvider + DNSProvider interfaces
│   │   ├── deno-deploy.ts           # Ported from admin-cx/clients/deno.ts
│   │   ├── kubernetes.ts            # Ported from admin-cx/hosting/kubernetes/
│   │   ├── cloudflare-dns.ts        # Ported from admin-cx/clients/cloudflare.ts
│   │   └── factory.ts               # Resolve provider from config
│   ├── tools/
│   │   ├── sites.ts
│   │   ├── deployments.ts
│   │   ├── environments.ts
│   │   ├── domains.ts
│   │   └── config.ts
│   ├── domain-validation/           # Ported from admin-cx/actions/domains/
│   │   ├── cname.ts
│   │   ├── caa.ts
│   │   └── apex.ts
│   ├── routes/
│   │   ├── webhooks.ts              # GitHub webhook handler
│   │   └── landing.ts               # Public landing page
│   └── migrations/
│       ├── 001-hosting-sites.ts
│       ├── 002-hosting-deployments.ts
│       ├── 003-hosting-environments.ts
│       ├── 004-hosting-domains.ts
│       └── 005-hosting-provider-config.ts
├── shared.ts
└── package.json
```

Total new code estimate: ~3000 lines (providers + tools + migrations + UI), of which ~1500 is ported/simplified from admin-cx.

---

## Why This is Better Than v2

| Aspect | v2 (proxy to admin-cx) | v3 (port into mesh) |
|---|---|---|
| Self-hostable | No — needs admin-cx running | Yes — just mesh |
| Auth | OAuth bridge, two auth systems | Mesh's own Better Auth |
| Data | Split across Supabase + mesh | All in mesh's DB |
| Config | Env vars + OAuth tokens | UI settings, encrypted in vault |
| Agent story | Agent calls proxy → admin-cx | Agent calls native tools directly |
| Solo hacker | Complex setup | `docker compose up` + API token |
| Enterprise | Depends on our admin-cx | Bring your own infra |
| Code ownership | Depends on admin-cx codebase | We own everything |
| Latency | Extra hop through admin-cx | Direct to provider |
| admin-cx coupling | Permanent dependency | Clean break |

---

## Open Decisions

1. **Binding or no binding?**
   Since hosting tools are SELF tools (server plugin), no external MCP connection needed. Plugin could use empty binding `[]` like Workflows, or we could create a HOSTING_BINDING for external hosting providers to implement.
   → **Recommendation**: Empty binding initially. The plugin uses its own server tools. Later, HOSTING_BINDING could let someone plug in their own hosting provider as an MCP server.

2. **Where does monitoring data come from?**
   - Deno Deploy has an analytics API → use it
   - K8s: optionally configure Prometheus endpoint
   - Or just link out to external dashboards initially
   → **Recommendation**: Start with Deno Deploy analytics API. K8s monitoring as separate optional config.

3. **GitHub integration: GitHub App or personal tokens?**
   - GitHub App: proper, supports org repos, webhook events
   - Personal tokens: simpler, solo-hacker friendly
   → **Recommendation**: Support both. Personal token for solo, GitHub App for teams.

4. **Build system for K8s: bring your own builder or built-in?**
   - admin-cx uses custom Docker builder images
   - Could use Buildpacks, Nixpacks, or custom Dockerfiles
   → **Recommendation**: Let user configure builder image. Provide sensible defaults for Deno and Bun.
