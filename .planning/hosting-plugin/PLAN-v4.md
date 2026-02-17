# Hosting Plugin v4 — Two-Tier Product + Graceful Migration

> "Open adapters for those who want control. Managed orchestration for those who want to sleep."

## What Changed from v3

v3 was "port & simplify, kill admin-cx." Two problems:

1. **It threw away the orchestration value.** Deco already coordinates multi-CDN failover, multi-cloud redundancy, 24/7 agents + human engineers. That's not legacy cruft — that's a real product differentiator. v3 dropped multi-platform composition as "unnecessary complexity." Wrong. It's unnecessary for self-hosters, but it IS the product for Deco Cloud customers.

2. **"Clean cut" from admin-cx is unrealistic.** Real users have real sites running on admin-cx right now. The transition is a migration with coexistence, not a demolition. Users will gradually prefer mesh, and eventually admin-cx sunsets — but that's a process, not a switch.

---

## Philosophy (Updated)

Mesh was built from the ground up to be:
- **Self-hostable**: Docker compose, 1 required env var, SQLite by default
- **Enterprise-friendly**: Bring your own GCP/AWS, Postgres, SSO
- **Solo-hacker friendly**: Works on a laptop, tool-builder's dream
- **Agent-native**: Everything is MCP tools, agents operate your infra

The hosting plugin follows the same principles — AND adds a managed tier:
- **BYO Provider** (free): Plug in your Deno Deploy token, your K8s cluster, your Cloudflare. You own everything.
- **Deco Cloud** (paid): We manage multi-CDN, multi-cloud, automatic failover, 24/7 monitoring with agents + human engineers. You deploy, we keep it running.
- **Agent dev environments**: Summon a full dev environment in seconds. Let Claude or any coding agent vibecode your site, test changes, iterate — then deploy to hardened production infra. Environments are first-class, not an afterthought.

Both paths use the same plugin UI. The difference is the provider adapter.

---

## Architecture: Two-Tier Provider Model

```
┌──────────────────────────────────────────────────────────┐
│  mesh-plugin-hosting                                      │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Hosting UI (React)                                 │  │
│  │  Sites · Deploys · Envs · Domains · Monitoring      │  │
│  └──────────┬──────────────────────────────────────────┘  │
│             │ usePluginContext → toolCaller                │
│  ┌──────────▼──────────────────────────────────────────┐  │
│  │  Server Plugin (MCP Tools)                          │  │
│  │  hosting:deploy, hosting:list-sites, etc.           │  │
│  └──────────┬──────────────────────────────────────────┘  │
│             │                                             │
│  ┌──────────▼──────────────────────────────────────────┐  │
│  │  Provider Adapters                                   │  │
│  │                                                      │  │
│  │  BYO (self-hosted)           Deco Cloud (managed)    │  │
│  │  ┌──────────┐ ┌─────────┐   ┌────────────────────┐  │  │
│  │  │ Deno     │ │ K8s +   │   │ Deco Orchestrator  │  │  │
│  │  │ Deploy   │ │ Knative │   │                    │  │  │
│  │  └──────────┘ └─────────┘   │ Multi-CDN failover │  │  │
│  │  ┌──────────┐ ┌─────────┐   │ Multi-cloud deploy │  │  │
│  │  │Cloudflare│ │ Docker  │   │ Agent monitoring   │  │  │
│  │  │DNS + CDN │ │ (future)│   │ 24/7 humans        │  │  │
│  │  └──────────┘ └─────────┘   │ Auto SSL + DNS     │  │  │
│  │                              │ Env pool (K8s)     │  │  │
│  │                              └────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Hosting DB (Kysely, mesh's own DB)                 │  │
│  │  sites · deployments · envs · domains · incidents   │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Key Insight: The Deco Cloud Adapter

For BYO users, adapters talk directly to provider APIs (Deno Deploy, K8s, Cloudflare).

For Deco Cloud users, the adapter talks to **Deco's orchestration API** — which internally manages multi-CDN routing, multi-cloud deployment, failover logic, health checks, and incident response. This orchestration layer is the value. It's what justifies the paid tier.

The Deco Cloud adapter implements the exact same `HostingProvider` interface. From the plugin's perspective, it's just another provider. But behind it is:
- Deno Deploy + K8s (multi-cloud)
- Cloudflare + Fastly/Akamai (multi-CDN, failover capable)
- Agent-driven health monitoring
- Automatic CDN failover when one provider degrades
- Automatic cloud failover when one region goes down
- 24/7 human engineers as escalation
- Managed SSL, managed DNS

```typescript
class DecoCloudProvider implements HostingProvider {
  // Talks to Deco's orchestration API
  // Which internally coordinates multiple providers
  // User doesn't need to know about the complexity

  async deploy(opts: DeployOpts): Promise<Deployment> {
    // Deploys to Deco's managed infra
    // Multi-region, multi-CDN automatically
    return this.api.post(`/sites/${opts.siteId}/deploy`, opts);
  }

  async getIncidents(siteId: string): Promise<Incident[]> {
    // Unique to Deco Cloud — incident history
    // Shows CDN switches, failovers, agent interventions
    return this.api.get(`/sites/${siteId}/incidents`);
  }
}
```

---

## What the Orchestration Layer Actually Does

This is the "Deco Cloud magic" — the stuff you DON'T get with BYO:

### Multi-CDN Failover
- Sites are served through multiple CDNs simultaneously (primary + standby)
- Health checks run every 30 seconds per edge region
- If primary CDN degrades (latency spike, 5xx rate), traffic shifts to standby CDN
- Agent detects the issue, executes the switch, logs the incident
- Human engineer is notified and monitors recovery
- When primary recovers, traffic gradually shifts back

### Multi-Cloud Deployment
- Production deployments go to multiple cloud regions (not just one Deno Deploy project)
- If a cloud region goes down, DNS routes traffic to healthy regions
- Build artifacts are stored redundantly

### Agent-Driven Incident Response
- Monitoring agents watch error rates, latency, availability
- When thresholds are breached, agents can:
  - Switch CDN routing
  - Scale up replicas
  - Rollback to last known good deployment
  - Create an incident ticket
  - Page the on-call engineer
- All actions are logged as MCP tool calls — full audit trail

### 24/7 Human Engineering
- On-call rotation for Deco Cloud customers
- Agents handle the first response, humans handle escalations
- Customers see incident timeline in their dashboard

### Agent Dev Environments (The CloudRouter Play)

Inspired by [CloudRouter.dev](https://cloudrouter.dev/) — which gives coding agents their own VMs/GPUs to work in — but deeper, because we own the hosting stack.

**The idea**: Every site has on-demand dev environments that agents (Claude, Codex, any MCP-compatible agent) can summon to do real work. Not just a preview deploy — a full, writable, live environment where agents can:
- Edit code and see changes instantly
- Run tests against real infrastructure
- Iterate on a feature branch with hot reload
- Access the site's databases, APIs, secrets (scoped)
- Collaborate with other agents or humans simultaneously

When the work is done, you promote the environment to production on Deco's hardened multi-CDN/multi-cloud infra.

**How it works (Deco Cloud tier)**:

```
Agent: "I need an environment for site acme-store, branch feat/new-checkout"
  ↓
HOSTING_CREATE_ENVIRONMENT tool
  ↓
Deco Cloud Orchestrator:
  1. Pulls from env pool (pre-warmed K8s pods, <5 second spin-up)
  2. Checks out branch, installs deps, starts dev server
  3. Returns URL: https://feat-new-checkout--acme-store.env.deco.site
  4. Mounts site secrets (scoped read-only by default)
  ↓
Agent works: edits files, runs tests, iterates
  ↓
Agent: "Deploy this to production"
  ↓
HOSTING_PROMOTE tool → multi-CDN, multi-cloud production deploy
  ↓
HOSTING_DELETE_ENVIRONMENT → pod returns to pool
```

**The Env Pool (K8s)**:

This is already being built in admin-cx. Pre-warmed Kubernetes pods sitting ready:

```
┌─────────────────────────────────────────┐
│  Env Pool (K8s cluster)                  │
│                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│  │ warm │ │ warm │ │ warm │ │ warm │   │  ← Pre-provisioned pods
│  │ pod  │ │ pod  │ │ pod  │ │ pod  │   │    Base image ready
│  └──────┘ └──────┘ └──────┘ └──────┘   │    Node deps cached
│                                          │    <5s to claim
│  ┌──────┐ ┌──────┐                      │
│  │active│ │active│  ← Claimed by agents │    Running dev servers
│  │agent │ │agent │    doing work         │    Full environment
│  └──────┘ └──────┘                      │
│                                          │
│  Pool auto-scales based on demand        │
│  Idle envs scale to zero after timeout   │
│  Pool refills when pods are claimed      │
└─────────────────────────────────────────┘
```

- **Pool size** auto-scales based on demand patterns (more pods warm during work hours)
- **Claim time**: <5 seconds (pod is already running, just needs branch checkout + deps)
- **Idle timeout**: Environments scale to zero after configurable idle period
- **Pod recycling**: When an env is deleted, pod is cleaned and returned to pool
- **Resource limits**: Per-env CPU/memory limits, configurable per plan tier

**Comparison to CloudRouter.dev**:

| | CloudRouter | Deco Cloud Envs |
|---|---|---|
| **What** | Generic VMs/GPUs for any agent | Site-specific dev environments |
| **Spin-up** | ~30-60s (fresh VM) | <5s (pre-warmed pool) |
| **Context** | Blank VM, upload your files | Already has your site, deps, secrets |
| **After dev** | Manual deploy elsewhere | One-command promote to production |
| **Infra** | E2B, Modal (third-party) | Deco's own K8s (first-party) |
| **Scope** | General compute | Web site/app hosting |

We're not competing with CloudRouter — we're complementary. CloudRouter is "give my agent a computer." Deco Cloud envs are "give my agent my site's dev environment, ready to code."

**BYO users** can still create environments (preview deployments on Deno Deploy, Knative services on K8s), but without the pool optimization. The env pool is a Deco Cloud differentiator — it requires managed K8s infrastructure.

**Not just sites — everything runs in envs**:

Environments aren't scoped to "websites." They're general-purpose execution contexts for anything in the deco stack:
- **Sites**: Frontend apps, SSR pages, APIs
- **Automations**: Scheduled jobs, cron tasks, data pipelines
- **Workflows**: Multi-step agent workflows (mesh workflow plugin)
- **Triggers**: Webhook handlers, event processors
- **Integrations**: MCP servers, API adapters

An agent summons an env to work on ANY of these. The env has the full runtime context — code, deps, secrets, connected services. When done, promote to production.

**Use cases**:
- **Vibecoding a site**: "Claude, redesign the checkout page" → agent gets env, iterates, you review, promote
- **Building an automation**: "Create a workflow that syncs inventory from Shopify every hour" → agent builds + tests in env → deploy
- **Automated testing**: CI creates env per PR, runs e2e tests against real infra, tears down
- **Content editing**: Non-technical user edits content in a preview env, publishes when ready
- **Agent workflows**: Scheduled agent tasks (SEO audits, perf optimization, A/B test setup) that need a writable environment
- **Trigger development**: "Add a webhook handler for Stripe events" → agent codes + tests with real webhook payloads in env
- **Pair programming**: Human + agent both working in the same env, seeing each other's changes

---

## Provider Adapter Interface (Updated)

```typescript
interface HostingProvider {
  id: string;
  name: string;
  tier: "byo" | "managed";  // NEW: distinguishes BYO from Deco Cloud

  // Sites
  createSite(opts: CreateSiteOpts): Promise<Site>;
  deleteSite(siteId: string): Promise<void>;

  // Deployments
  deploy(opts: DeployOpts): Promise<Deployment>;
  listDeployments(siteId: string, opts?: PaginationOpts): Promise<Deployment[]>;
  getDeploymentLogs(deploymentId: string): Promise<LogEntry[]>;
  promoteDeployment(siteId: string, deploymentId: string): Promise<void>;

  // Environments (dev-time, agent-accessible, not just previews)
  createEnvironment(opts: CreateEnvOpts): Promise<Environment>;
  deleteEnvironment(siteId: string, envName: string): Promise<void>;
  listEnvironments(siteId: string): Promise<Environment[]>;
  scaleEnvironment?(siteId: string, envName: string, scale: ScaleOpts): Promise<void>;
  getEnvironmentLogs?(siteId: string, envName: string): Promise<LogEntry[]>;
  getEnvironmentAccess?(siteId: string, envName: string): Promise<EnvAccessInfo>;

  // Domains (optional — can use separate DNS provider)
  addDomain?(siteId: string, domain: string): Promise<DomainStatus>;
  removeDomain?(siteId: string, domain: string): Promise<void>;
  validateDomain?(siteId: string, domain: string): Promise<DomainValidation>;

  // Managed-tier features (optional, only Deco Cloud implements these)
  getIncidents?(siteId: string): Promise<Incident[]>;
  getHealthStatus?(siteId: string): Promise<HealthStatus>;
  getFailoverConfig?(siteId: string): Promise<FailoverConfig>;
  setFailoverConfig?(siteId: string, config: FailoverConfig): Promise<void>;

  // Env pool (Deco Cloud only — pre-warmed environments)
  getEnvPoolStatus?(): Promise<EnvPoolStatus>;
  configureEnvPool?(config: EnvPoolConfig): Promise<void>;
}

interface DNSProvider {
  createRecord(opts: DNSRecordOpts): Promise<void>;
  deleteRecord(recordId: string): Promise<void>;
  listRecords(domain: string): Promise<DNSRecord[]>;
  createCustomHostname?(hostname: string): Promise<CustomHostnameStatus>;
}

// NEW: Managed-tier types
interface Incident {
  id: string;
  siteId: string;
  type: "cdn_failover" | "cloud_failover" | "rollback" | "scale_up" | "manual";
  status: "active" | "resolved" | "monitoring";
  description: string;
  timeline: IncidentEvent[];
  startedAt: Date;
  resolvedAt?: Date;
}

interface HealthStatus {
  overall: "healthy" | "degraded" | "down";
  cdnPrimary: { provider: string; status: string; latencyMs: number };
  cdnStandby: { provider: string; status: string; latencyMs: number };
  regions: { region: string; status: string; latencyMs: number }[];
  lastCheckedAt: Date;
}

interface FailoverConfig {
  cdnFailoverEnabled: boolean;
  cloudFailoverEnabled: boolean;
  autoRollbackEnabled: boolean;
  latencyThresholdMs: number;
  errorRateThreshold: number;
  notificationChannels: string[];
}

// Environment types (all tiers)
interface CreateEnvOpts {
  siteId: string;
  name: string;
  branch?: string;
  commitSha?: string;
  type: "site" | "automation" | "workflow" | "trigger" | "integration";
  agentAccess?: boolean;  // enable agent-writable access (file editing, command execution)
  ttlMinutes?: number;    // auto-destroy after idle period
}

interface EnvAccessInfo {
  url: string;            // live preview URL
  sshEndpoint?: string;   // for agents that need shell access
  filesEndpoint?: string; // for agents that need file read/write
  secrets: string[];      // available secret names (not values)
  status: "provisioning" | "ready" | "idle" | "expired";
}

// Env pool types (Deco Cloud only)
interface EnvPoolStatus {
  warmPods: number;
  activePods: number;
  totalCapacity: number;
  avgClaimTimeMs: number;
  poolAutoScaling: boolean;
}

interface EnvPoolConfig {
  minWarmPods: number;        // minimum pre-warmed pods
  maxTotalPods: number;       // hard cap
  idleTimeoutMinutes: number; // scale to zero after idle
  autoScale: boolean;         // scale pool based on demand patterns
  baseImage?: string;         // custom base image for envs
}
```

---

## Configuration: Two Paths in One Settings UI

```
Plugin Settings UI:
┌─────────────────────────────────────────────────────────┐
│  Hosting Mode                                            │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ● Deco Cloud (Recommended)                          │ │
│  │   Managed hosting with multi-CDN, multi-cloud,      │ │
│  │   automatic failover, and 24/7 support.             │ │
│  │   → Linked to your Deco account. Billing via        │ │
│  │     mesh wallet.                                    │ │
│  │                                                     │ │
│  │ ○ Bring Your Own Provider                           │ │
│  │   Configure your own hosting provider.              │ │
│  │   Full control, your infra, your costs.             │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  [When BYO is selected:]                                 │
│                                                          │
│  Hosting Provider                                        │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ○ Deno Deploy                                       │ │
│  │   API Token: [••••••••••••••••] [Test]               │ │
│  │   Organization ID: [______________]                  │ │
│  │                                                     │ │
│  │ ○ Kubernetes + Knative                              │ │
│  │   Kubeconfig: [Upload / Paste]                      │ │
│  │   Namespace prefix: [______________]                │ │
│  │                                                     │ │
│  │ ○ Docker (Coming soon)                              │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  DNS Provider (Optional for BYO)                         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ○ Cloudflare                                        │ │
│  │ ○ None (manual DNS)                                 │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  [When Deco Cloud is selected:]                          │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ✓ Connected to Deco Cloud                           │ │
│  │   Organization: acme-corp                           │ │
│  │   Plan: Pro ($49/mo)                                │ │
│  │   CDN: Cloudflare (primary) + Fastly (standby)     │ │
│  │   Cloud: Deno Deploy + K8s (multi-region)           │ │
│  │   Failover: Enabled                                 │ │
│  │   Support: 24/7 engineering team                    │ │
│  │                                                     │ │
│  │   [Manage Plan]  [View Incidents]                   │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## What to Port from admin-cx (Revised)

### PORT (essential logic, available to all tiers)

| Component | Source | Lines | Why Port |
|---|---|---|---|
| **HostingPlatform interface** | `hosting/platform.ts` | ~80 | Clean abstraction, defines the contract |
| **Deno Deploy adapter** | `clients/deno.ts` + `hosting/denodeploy/` | ~400 | HTTP calls to Deno Deploy API. BYO path. |
| **Cloudflare DNS/CDN** | `clients/cloudflare.ts` (subset) | ~300 | DNS records, custom hostnames, SSL. BYO path. |
| **Domain validation** | `actions/domains/verify*.ts` | ~200 | CNAME/CAA/apex validation. Standard DNS logic. |
| **Environment model** | `sdk/environments.ts` + `environments/platform.ts` | ~150 | Clean interface: create(opts) → url, delete(opts) |
| **K8s/Knative adapter** | `hosting/kubernetes/` (core) | ~800 | Enterprise BYO. Port essentials, rewrite K8s parts. |

### KEEP as orchestration value (Deco Cloud tier)

| Component | Why it matters |
|---|---|
| **Multi-platform composition** | Multi-CDN failover, multi-cloud deployment — the Deco Cloud product |
| **Health check / monitoring infra** | Agent-driven incident detection and response |
| **CDN switching logic** | Automatic failover between CDN providers |
| **Incident management** | Timeline, escalation, notification |
| **Env pool (K8s)** | Pre-warmed pods for <5s agent env spin-up — already being built in admin-cx |
| **Agent env access layer** | SSH, file API, exec endpoints for agent-writable environments |

This logic stays in Deco's orchestration API (backend). The mesh plugin's `DecoCloudProvider` adapter calls it. We don't port this into the OSS plugin — it IS the paid product.

### KILL (admin-cx framework coupling only)

| Component | Why Kill |
|---|---|
| Supabase client/types | Use mesh's own Kysely DB |
| withAuth middleware chain | Use mesh's Better Auth |
| deco-sites/admin imports | Decouple from old admin UI |
| Fresh framework specifics | Mesh uses Hono + React |
| PostHog analytics | Not needed in OSS plugin |
| R2 storage client | Separate concern |
| Legacy keda/tunnel env platforms | Dead code |

### SIMPLIFY (same as v3)

| Concept | admin-cx | mesh-plugin |
|---|---|---|
| Site metadata | Supabase `sites` table with giant metadata JSON | Typed Kysely table with proper columns |
| Deployment tracking | Supabase + in-memory | Plugin DB table |
| Environment state | Filesystem volumes + JSON patches | Plugin DB + provider state |
| Build logs | S3 + streaming | Provider API |
| Domain status | Supabase + Cloudflare polling | Plugin DB + on-demand validation |

---

## Database Schema (Updated)

```sql
-- 001-hosting-sites.sql
CREATE TABLE hosting_sites (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,  -- 'deco-cloud' | 'deno-deploy' | 'kubernetes' | 'docker'
  provider_project_id TEXT,  -- provider-specific ID
  github_repo_url TEXT,
  github_owner TEXT,
  github_repo TEXT,
  production_domain TEXT,
  -- admin-cx migration fields
  admin_cx_site_id TEXT,  -- original admin-cx site ID, NULL for new sites
  admin_cx_synced_at DATETIME,  -- last sync timestamp
  metadata JSON DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, name)
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
  status TEXT NOT NULL DEFAULT 'creating',  -- creating | ready | idle | scaled_to_zero | expired | error
  type TEXT NOT NULL DEFAULT 'site',  -- site | automation | workflow | trigger | integration
  platform TEXT,  -- knative | deno | content
  is_production BOOLEAN DEFAULT FALSE,
  agent_access BOOLEAN DEFAULT FALSE,  -- writable by agents (file edit, shell)
  ttl_minutes INTEGER,  -- auto-destroy after idle period, NULL = no expiry
  pool_pod_id TEXT,  -- Deco Cloud: which pool pod is backing this env
  claimed_by TEXT,  -- agent ID or user ID that claimed this env
  last_activity_at DATETIME,
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
  provider_hostname_id TEXT,
  validated_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 005-hosting-provider-config.sql
CREATE TABLE hosting_provider_config (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  org_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,  -- 'deco-cloud' | 'deno-deploy' | 'kubernetes' | 'cloudflare' | 'github'
  config_encrypted TEXT NOT NULL,  -- encrypted via CredentialVault
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, provider_type)
);

-- 006-hosting-incidents.sql (Deco Cloud only, but schema exists for all)
CREATE TABLE hosting_incidents (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  site_id TEXT NOT NULL REFERENCES hosting_sites(id),
  type TEXT NOT NULL,  -- 'cdn_failover' | 'cloud_failover' | 'rollback' | 'scale_up' | 'manual'
  status TEXT NOT NULL DEFAULT 'active',  -- active | resolved | monitoring
  description TEXT,
  timeline JSON DEFAULT '[]',  -- array of { timestamp, action, actor, details }
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);
```

Note: `admin_cx_site_id` and `admin_cx_synced_at` on `hosting_sites` — these exist to support the migration period. When a site is imported from admin-cx, we keep track of the original ID so both systems can reference the same underlying infra.

---

## MCP Tools (Updated)

```typescript
const hostingTools: ServerPluginTool[] = [
  // === Sites ===
  { name: "HOSTING_LIST_SITES", handler: listSites },
  { name: "HOSTING_GET_SITE", handler: getSite },
  { name: "HOSTING_CREATE_SITE", handler: createSite },
  { name: "HOSTING_DELETE_SITE", handler: deleteSite },
  { name: "HOSTING_IMPORT_FROM_ADMIN", handler: importFromAdminCx },  // NEW: migration

  // === Deployments ===
  { name: "HOSTING_DEPLOY", handler: deploy },
  { name: "HOSTING_LIST_DEPLOYMENTS", handler: listDeployments },
  { name: "HOSTING_GET_DEPLOYMENT_LOGS", handler: getDeploymentLogs },
  { name: "HOSTING_PROMOTE", handler: promoteDeployment },
  { name: "HOSTING_ROLLBACK", handler: rollbackDeployment },  // NEW: quick rollback

  // === Environments (the CloudRouter play — agent dev sandboxes) ===
  { name: "HOSTING_LIST_ENVIRONMENTS", handler: listEnvironments },
  { name: "HOSTING_CREATE_ENVIRONMENT", handler: createEnvironment },  // claims from pool on Deco Cloud
  { name: "HOSTING_DELETE_ENVIRONMENT", handler: deleteEnvironment },  // returns pod to pool
  { name: "HOSTING_SCALE_ENVIRONMENT", handler: scaleEnvironment },
  { name: "HOSTING_GET_ENV_ACCESS", handler: getEnvironmentAccess },  // URL, SSH, file endpoints
  { name: "HOSTING_ENV_EXEC", handler: envExec },  // run command in env (agent shell access)
  { name: "HOSTING_ENV_WRITE_FILE", handler: envWriteFile },  // write file in env (agent editing)
  { name: "HOSTING_ENV_READ_FILE", handler: envReadFile },  // read file in env

  // === Domains ===
  { name: "HOSTING_LIST_DOMAINS", handler: listDomains },
  { name: "HOSTING_ADD_DOMAIN", handler: addDomain },
  { name: "HOSTING_VALIDATE_DOMAIN", handler: validateDomain },
  { name: "HOSTING_REMOVE_DOMAIN", handler: removeDomain },

  // === Config ===
  { name: "HOSTING_GET_CONFIG", handler: getProviderConfig },
  { name: "HOSTING_SET_CONFIG", handler: setProviderConfig },
  { name: "HOSTING_TEST_CONNECTION", handler: testProviderConnection },

  // === Deco Cloud only (noop for BYO) ===
  { name: "HOSTING_GET_HEALTH", handler: getHealthStatus },
  { name: "HOSTING_LIST_INCIDENTS", handler: listIncidents },
  { name: "HOSTING_GET_FAILOVER_CONFIG", handler: getFailoverConfig },
  { name: "HOSTING_SET_FAILOVER_CONFIG", handler: setFailoverConfig },
  { name: "HOSTING_GET_ENV_POOL_STATUS", handler: getEnvPoolStatus },
  { name: "HOSTING_CONFIGURE_ENV_POOL", handler: configureEnvPool },
];
```

---

## Migration Strategy: admin-cx → mesh (Revised)

This is NOT a clean cut. It's a gradual, respectful migration where both systems coexist.

### Phase A — Read-only bridge (first)

The mesh hosting plugin can **read** sites already managed by admin-cx:

```typescript
// HOSTING_IMPORT_FROM_ADMIN tool
async function importFromAdminCx(ctx: ToolContext, opts: { adminCxToken: string }) {
  // 1. Call admin-cx API to list user's sites
  const sites = await fetch("https://admin.deco.cx/api/sites", {
    headers: { Authorization: `Bearer ${opts.adminCxToken}` }
  });

  // 2. Import each site into mesh hosting DB
  for (const site of sites) {
    await db.insertInto("hosting_sites").values({
      name: site.name,
      provider: site.platform,  // map admin-cx platform to provider type
      provider_project_id: site.projectId,
      admin_cx_site_id: site.id,  // keep reference
      admin_cx_synced_at: new Date(),
      // ... other fields
    }).execute();
  }

  // 3. Import domains, environments
  // ...
}
```

Users see their existing sites in mesh. They can view status, deployments, logs. But management still happens in admin-cx initially.

### Phase B — Write-through (next)

The mesh plugin can now **manage** sites:
- Deploy from mesh → same infra admin-cx uses
- Create environments from mesh → same K8s clusters
- Manage domains from mesh → same Cloudflare zones

Both dashboards work. Same underlying infra. Users choose their preferred UI.

For Deco Cloud users, the mesh plugin's `DecoCloudProvider` adapter calls the same orchestration API that admin-cx calls. Same multi-CDN, same failover — just a better UI.

### Phase C — Preference shift (organic)

Users naturally migrate because:
- Mesh UX is better (modern React, real-time, responsive)
- Agents work through mesh MCP tools (not admin-cx)
- New features ship in mesh first
- Admin-cx enters maintenance mode

### Phase D — Sunset admin-cx hosting (eventually)

- Admin-cx hosting UI shows "Manage in Mesh" banner
- New site creation disabled in admin-cx
- Eventually, admin-cx hosting code removed
- `admin_cx_site_id` column becomes historical reference

### What this means for the plugin code

The `DecoCloudProvider` adapter needs to work with admin-cx's existing API during the transition:

```typescript
class DecoCloudProvider implements HostingProvider {
  tier: "managed" = "managed";

  // During migration: calls admin-cx orchestration API
  // After migration: calls new Deco orchestration API (same logic, cleaner endpoints)
  private baseUrl: string;  // starts as admin-cx API, migrates to new API

  async listSites() {
    // Works with both admin-cx API and future Deco API
    return this.api.get("/sites");
  }

  async deploy(opts) {
    // Same deploy endpoint, whether admin-cx or new API
    return this.api.post(`/sites/${opts.siteId}/deploy`, opts);
  }
}
```

The BYO adapters (Deno Deploy, K8s, Cloudflare) are independent — they don't need admin-cx at all.

---

## Phased Build Plan (Updated)

### Phase 0: Plugin Skeleton + DB Schema + Settings (2 days)

Create the plugin package, register it, add migrations, settings UI.

- `mesh-plugin-hosting/` with client + server
- All 6 migration files (including incidents table)
- Plugin registered in mesh
- Settings page with "Deco Cloud" vs "BYO" toggle
- Provider credential forms for BYO path
- "Configure Hosting" empty state

**Deliverable**: Plugin exists, DB ready, user can choose hosting mode and enter credentials.

### Phase 1: Deco Cloud Adapter + Site Import (1 week)

Wire up the Deco Cloud adapter to admin-cx API. Import existing sites.

- `DecoCloudProvider` adapter calling admin-cx orchestration API
- HOSTING_IMPORT_FROM_ADMIN tool
- HOSTING_LIST_SITES, HOSTING_GET_SITE tools
- Sites grid UI with status badges
- Site detail page (header + overview)
- Import wizard: "Connect your Deco account → import sites"

**Deliverable**: Deco Cloud users see their existing sites in mesh. Read-only initially.

**Why start here (not Deno Deploy BYO)**: Most users ARE Deco Cloud users already. They need to see their existing sites in mesh ASAP. This validates the migration path.

### Phase 2: BYO Deno Deploy Adapter + Site CRUD (1 week)

Port Deno Deploy client for BYO users. Full site management.

- `DenoDeployProvider` class (~400 lines, ported from admin-cx)
- HOSTING_CREATE_SITE, HOSTING_DELETE_SITE tools
- "Create Site" wizard (name + GitHub repo)
- Test connection button in settings

**Deliverable**: BYO users can create/manage sites on their own Deno Deploy. Solo hackers get started.

### Phase 3: Deployments + Logs (1 week)

Full deployment workflow for both tiers.

- HOSTING_DEPLOY, HOSTING_LIST_DEPLOYMENTS, HOSTING_GET_DEPLOYMENT_LOGS, HOSTING_PROMOTE, HOSTING_ROLLBACK tools
- Deployment timeline UI
- Log viewer
- Deploy from branch action
- Promote to production action
- GitHub webhook handler (push → deploy)
- For Deco Cloud: deploy calls orchestration API (multi-region automatic)
- For BYO: deploy calls provider directly

**Deliverable**: Full deploy lifecycle. Both tiers can deploy, view logs, promote, rollback.

### Phase 4: Agent Dev Environments — The CloudRouter Play (2 weeks)

The killer feature. Not just preview deploys — full agent-accessible dev sandboxes.

**Week 1: Core environment lifecycle**
- HOSTING_CREATE_ENVIRONMENT, HOSTING_DELETE_ENVIRONMENT, HOSTING_LIST_ENVIRONMENTS tools
- Environment cards UI (status, URL, claimed-by, type, idle time)
- Create from branch for any type: site, automation, workflow, trigger, integration
- Preview URLs + environment status tracking
- BYO Deno Deploy: environments = preview deployments
- BYO K8s: environments = Knative services with scale-to-zero

**Week 2: Agent access + env pool (Deco Cloud)**
- HOSTING_GET_ENV_ACCESS, HOSTING_ENV_EXEC, HOSTING_ENV_WRITE_FILE, HOSTING_ENV_READ_FILE tools
- Agent can claim an env, edit files, run commands, see live preview
- Deco Cloud: env pool integration (pre-warmed pods, <5s claim)
- HOSTING_GET_ENV_POOL_STATUS, HOSTING_CONFIGURE_ENV_POOL tools
- Env pool dashboard (warm/active pods, claim latency, auto-scale config)
- TTL-based auto-cleanup (idle envs expire)
- Promote-to-production flow (env → deploy → done)

**Deliverable**: Agents can summon a dev environment in seconds, do real work (edit code, run commands, test against real infra), and promote to production. The "vibecoding → deploy" loop is seamless.

### Phase 5: Domains + Cloudflare (1 week)

Custom domains with DNS management.

- `CloudflareDNSProvider` class (~300 lines, BYO path)
- Port domain validation logic (~200 lines)
- Domain tools (add, validate, remove)
- Add domain wizard UI
- For Deco Cloud: domains managed automatically (DNS + SSL handled)
- For BYO: step-by-step DNS instructions

**Deliverable**: Custom domains work for both tiers.

### Phase 6: Deco Cloud Health + Incidents Dashboard (1 week)

The Deco Cloud differentiator UI.

- HOSTING_GET_HEALTH, HOSTING_LIST_INCIDENTS, HOSTING_GET/SET_FAILOVER_CONFIG tools
- Health status dashboard (CDN status, latency by region, error rates)
- Incident timeline (CDN failover events, rollbacks, agent actions)
- Failover configuration UI (enable/disable auto-failover, set thresholds)
- This section only renders for Deco Cloud sites

**Deliverable**: Deco Cloud users see why they're paying — visibility into the orchestration that keeps them online.

### Phase 7: K8s Adapter + Enterprise BYO (1-2 weeks)

For enterprise users who bring their own cluster.

- `KubernetesProvider` class (~800 lines)
- Knative service creation + management
- Build job orchestration
- Scale-to-zero for environments
- Kubeconfig upload in settings

**Deliverable**: Enterprise BYO users can use their own K8s clusters.

### Phase 8: Billing + Upgrade Flow (1 week)

Monetization.

- Credit card modal (reuse mesh wallet)
- Usage tracking per site
- Upgrade prompts: "Get multi-CDN failover with Deco Cloud →"
- Pricing display (free BYO vs paid Deco Cloud tiers)
- Create site from template wizard

**Deliverable**: Clear monetization path. Free to start, pay for managed.

### Phase 9: Landing Page + Go-to-Market (1 week)

Sell the product.

- Public landing page in decocms/ (sections for hosting product)
- Hero: agent-native hosting that deploys anywhere
- Deco Cloud story: multi-CDN, failover, 24/7 support
- Self-hosted story: open adapters, full control
- Pricing: free BYO vs Deco Cloud tiers
- "Get started" flow

**Deliverable**: The hosting product has a face.

---

## User Paths (Updated)

### Solo hacker (BYO, free)
```
1. docker compose up -d  (mesh is running)
2. Enable hosting plugin
3. Choose "Bring Your Own Provider"
4. Enter Deno Deploy API token
5. Create site → deployed to YOUR Deno Deploy
6. Point domain manually or add Cloudflare token
```

### Enterprise (BYO, free)
```
1. Deploy mesh to their infra (K8s/VM)
2. Enable hosting plugin
3. Choose "Bring Your Own Provider"
4. Configure K8s adapter (kubeconfig)
5. Configure Cloudflare for DNS
6. Teams create sites → deployed to THEIR cluster
```

### Startup/agency (Deco Cloud, paid)
```
1. Sign up at mesh cloud (or self-host mesh + connect Deco Cloud)
2. Enable hosting plugin
3. Choose "Deco Cloud" (default)
4. Import existing sites from admin-cx (or create new)
5. Deploy → multi-CDN, multi-cloud, automatic failover
6. Sleep well → agents + humans monitoring 24/7
7. Billing via mesh wallet
```

### Existing deco user (migration path)
```
1. Already using admin-cx to manage sites
2. Install mesh, enable hosting plugin
3. "Import from Deco" → sees all their sites in mesh
4. Gradually starts managing from mesh instead of admin-cx
5. Eventually admin-cx sunsets
6. No disruption — same infra, same sites, better UI
```

---

## Pricing Model

| Tier | Price | What you get |
|---|---|---|
| **BYO** | Free | Plugin UI + adapters. You bring provider, you pay provider directly. Envs = preview deploys. |
| **Deco Cloud Starter** | $0/mo | 1 site, shared CDN, no failover, 2 concurrent agent envs, community support |
| **Deco Cloud Pro** | ~$49/mo | Unlimited sites, multi-CDN failover, agent monitoring, 10 concurrent agent envs, env pool (<5s), email support |
| **Deco Cloud Enterprise** | Custom | Multi-cloud, dedicated infra, 24/7 human engineers, unlimited agent envs, custom env pool, SLA, SSO |

The upgrade prompt is contextual:
- BYO user creates 5+ sites → "Tired of managing providers? Try Deco Cloud"
- Deco Cloud Starter has a CDN issue → "Upgrade to Pro for automatic failover"
- Any incident → "This was resolved in 30 seconds by our agents. [View incident →]"

---

## File Structure (Updated)

```
mesh/packages/mesh-plugin-hosting/
├── client/
│   ├── index.tsx                    # ClientPlugin
│   ├── lib/
│   │   ├── router.ts
│   │   ├── query-keys.ts
│   │   └── types.ts
│   ├── components/
│   │   ├── sites/
│   │   │   ├── site-grid.tsx
│   │   │   ├── site-detail.tsx
│   │   │   └── create-site-wizard.tsx
│   │   ├── deployments/
│   │   │   ├── deployment-timeline.tsx
│   │   │   ├── log-viewer.tsx
│   │   │   └── deploy-actions.tsx
│   │   ├── environments/
│   │   │   ├── env-cards.tsx
│   │   │   ├── create-env-modal.tsx
│   │   │   ├── env-access-panel.tsx    # Agent access info (URL, SSH, files)
│   │   │   ├── env-terminal.tsx        # In-browser terminal for env (agent/human)
│   │   │   └── env-pool-dashboard.tsx  # Deco Cloud: pool status + config
│   │   ├── domains/
│   │   │   ├── domain-list.tsx
│   │   │   └── add-domain-wizard.tsx
│   │   ├── health/                   # NEW: Deco Cloud only
│   │   │   ├── health-dashboard.tsx
│   │   │   ├── incident-timeline.tsx
│   │   │   └── failover-config.tsx
│   │   ├── settings/
│   │   │   ├── hosting-mode.tsx      # Deco Cloud vs BYO toggle
│   │   │   ├── provider-config.tsx   # BYO credential forms
│   │   │   └── import-admin.tsx      # Migration import wizard
│   │   └── billing/
│   │       ├── upgrade-prompt.tsx
│   │       └── usage-display.tsx
│   └── hooks/
├── server/
│   ├── index.ts
│   ├── providers/
│   │   ├── interface.ts             # HostingProvider + DNSProvider + managed types
│   │   ├── deco-cloud.ts            # NEW: Deco Cloud orchestration API adapter
│   │   ├── deno-deploy.ts           # BYO: ported from admin-cx
│   │   ├── kubernetes.ts            # BYO: ported from admin-cx
│   │   ├── cloudflare-dns.ts        # BYO: ported from admin-cx
│   │   └── factory.ts              # Resolve provider from config
│   ├── tools/
│   │   ├── sites.ts
│   │   ├── deployments.ts
│   │   ├── environments.ts          # env CRUD + agent access (exec, read, write)
│   │   ├── env-pool.ts              # Deco Cloud: pool status + config
│   │   ├── domains.ts
│   │   ├── config.ts
│   │   ├── health.ts                # Deco Cloud: health/incidents
│   │   └── migration.ts             # import from admin-cx
│   ├── domain-validation/
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
│       ├── 005-hosting-provider-config.ts
│       └── 006-hosting-incidents.ts  # NEW
├── shared.ts
└── package.json
```

---

## Why This is Better Than v3

| Aspect | v3 (port only) | v4 (two-tier + migration) |
|---|---|---|
| Existing users | "Export from admin-cx, import, done" | Gradual migration, both UIs work |
| Orchestration value | Dropped as "unnecessary" | Core product differentiator (Deco Cloud) |
| Multi-CDN failover | Not supported | Deco Cloud tier — automatic failover |
| Revenue model | Vague "billing later" | Clear: free BYO vs paid managed tiers |
| Migration risk | Hard cut, potential data loss | Coexistence, zero disruption |
| Agent monitoring | Not planned | Deco Cloud: agents + humans 24/7 |
| Agent dev envs | Basic preview deploys | Full agent sandboxes: exec, file edit, <5s pool, promote to prod |
| Env scope | Sites only | Sites + automations + workflows + triggers + integrations |
| Self-hosted story | Same (good) | Same (good) — BYO path unchanged |
| Enterprise value prop | "Bring your K8s" | "Bring your K8s" OR "let us manage it" |

---

## Open Decisions (Updated)

1. **Deco Cloud orchestration API — does it already exist?**
   admin-cx has the multi-platform logic internally. We need to decide: expose admin-cx as an API that the mesh plugin calls (short-term), or build a clean orchestration API service (long-term).
   → **Recommendation**: Short-term, the `DecoCloudProvider` calls admin-cx API endpoints directly. Long-term, extract orchestration into its own service.

2. **Import mechanism — API token or OAuth?**
   To import sites from admin-cx, the mesh plugin needs to authenticate. Options: user pastes an admin-cx API key, or OAuth flow.
   → **Recommendation**: API key for now (admin-cx already supports them). OAuth later if needed.

3. **Incident data — stored in mesh DB or fetched from Deco API?**
   Incidents could be stored locally (plugin DB) or always fetched from Deco's orchestration API.
   → **Recommendation**: Fetched from API, cached locally. Incidents are owned by the orchestration layer, not the plugin.

4. **When does admin-cx hosting UI show "Manage in Mesh" banner?**
   → **Recommendation**: After Phase 3 (deployments work in mesh). At that point, the mesh UX is genuinely better for the core workflow.

5. **How do BYO users get monitoring?**
   BYO users don't get Deco Cloud's multi-CDN monitoring. But they should still see basic deployment status and environment health.
   → **Recommendation**: Phase 9-ish. BYO monitoring via provider APIs (Deno Deploy analytics, K8s metrics). Good enough, not the selling point.
