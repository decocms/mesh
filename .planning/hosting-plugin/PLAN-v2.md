# Hosting Plugin v2 — UX-First Plan

> "We already have the infra. We need a great UX and a credit card modal."

## TL;DR

The deco platform already has: K8s env spinning, multi-platform deploys (K8s + Deno Deploy), domain management, SSL, monitoring, GitHub push-to-deploy, and a credit-based billing system in mesh.

What's missing is a **beautiful, standalone-feeling hosting product UI** in mesh that:
1. Wraps the existing admin-cx APIs as an MCP server
2. Gives it a CloudRouter-like product feel
3. Integrates with mesh's existing wallet/credits for billing
4. Has a landing page that sells hosting as an independent product

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│  mesh (Studio)                               │
│  ┌─────────────────────────────────────────┐ │
│  │  mesh-plugin-hosting (client)           │ │
│  │  - Sites dashboard                      │ │
│  │  - Deploy timeline                      │ │
│  │  - Env manager                          │ │
│  │  - Domain wizard                        │ │
│  │  - Monitoring dashboard                 │ │
│  │  - Credit card / upgrade modal          │ │
│  └──────────────┬──────────────────────────┘ │
│                 │ MCP tool calls              │
│  ┌──────────────▼──────────────────────────┐ │
│  │  Hosting MCP Server                     │ │
│  │  (installed per user, OAuth to admin)   │ │
│  │  - Wraps admin-cx APIs                  │ │
│  │  - Caches aggressively                  │ │
│  │  - Agents can use these tools too       │ │
│  └──────────────┬──────────────────────────┘ │
│                 │                             │
│  ┌──────────────▼──────────────────────────┐ │
│  │  mesh billing (existing)                │ │
│  │  - Wallet balance                       │ │
│  │  - Stripe checkout                      │ │
│  │  - Credit system                        │ │
│  └─────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────┘
                   │ HTTPS + OAuth token
┌──────────────────▼──────────────────────────┐
│  admin-cx (existing, unchanged)              │
│  - Hosting APIs (deploy, envs, domains...)   │
│  - Supabase auth                             │
│  - Cloudflare, K8s, Deno Deploy              │
│  - Prometheus, HyperDX, ClickHouse           │
└──────────────────────────────────────────────┘
```

---

## What We're Building (Scope)

### NOT building
- New hosting infrastructure (already exists)
- New billing backend (mesh already has wallet + Stripe)
- New auth system (OAuth bridge to admin-cx)

### Building
1. **Hosting MCP Server** — wraps admin-cx APIs for mesh consumption + agent use
2. **Plugin UI** — beautiful dashboard for all hosting operations
3. **Billing integration** — credit card modal when user needs to pay/upgrade
4. **Landing page** — public route that sells hosting as a product
5. **Connect flow** — OAuth to link admin.deco.cx account

---

## Phase 1: MCP Server + Connect Flow

**Goal**: User can connect admin.deco.cx account and see their sites.

### 1.1 Hosting MCP Server

A standalone MCP server package that wraps admin-cx hosting APIs.

**Authentication**: OAuth flow
- User authorizes in admin.deco.cx
- MCP server receives scoped token (team-level)
- Token stored in MCP connection config (standard mesh pattern)
- Auto-refresh on expiry

**Initial Tools** (read-only to start):
```
hosting:list-sites        → { name, status, productionDomain, platform, lastDeploy }[]
hosting:get-site          → Full site detail (domains, envs, metadata)
hosting:list-deployments  → Paginated deployment history
hosting:list-environments → Environments with status, URLs, branches
hosting:list-domains      → Domains with DNS status, SSL status
hosting:get-metrics       → Request count, bandwidth, cache ratio, error rate
```

**Where it runs**: Sidecar endpoint in admin-cx initially (direct DB/API access, no network hop). Later can be extracted to standalone service.

### 1.2 Plugin Shell + Connect Flow

```
mesh-plugin-hosting/
├── client/index.tsx          # Plugin registration
├── client/lib/router.ts      # Routes
├── client/components/
│   ├── connect-hosting.tsx   # "Connect your hosting account" CTA
│   └── sites-list.tsx        # Sites grid/list
├── server/index.ts           # Server plugin with OAuth routes
├── server/routes/
│   └── auth.ts               # OAuth callback handler
└── shared.ts                 # PLUGIN_ID = "hosting"
```

**Connect Flow UX**:
1. User enables hosting plugin in project settings
2. Sees "Connect your deco hosting account" empty state
3. Clicks "Connect" → redirected to admin.deco.cx OAuth consent
4. Approves → redirected back to mesh with token
5. MCP connection auto-created
6. Sites list loads immediately

**Deliverable**: Sites are visible in mesh. Connection works.

---

## Phase 2: Sites Dashboard + Deploy Timeline

**Goal**: The "wow" UI. Users should look at this and think "this is better than admin-cx."

### 2.1 Sites Overview Page

**Layout**: Grid of site cards (like Vercel dashboard)

Each card shows:
- Site name + favicon
- Production domain (clickable)
- Status indicator (green = live, yellow = building, red = error)
- Last deploy timestamp + commit message
- Platform badge (K8s / Deno Deploy)
- Quick actions: Deploy, Open, Settings

**Features**:
- Search/filter by name, status
- Sort by name, last deploy, creation date
- Skeleton loading states
- Empty state with "Create your first site" CTA

### 2.2 Site Detail Page

**Layout**: Header + tab navigation

**Header**:
- Site name (large)
- Production URL (with copy + open link)
- GitHub repo link
- Platform badge
- Quick deploy button
- Status badge

**Tabs**: Overview | Deployments | Environments | Domains | Monitoring | Settings

**Overview Tab**:
- Last 5 deployments (mini timeline)
- Active environments count
- Key metrics (requests/day, error rate, cache ratio)
- Quick links to common actions

### 2.3 Deployments Tab

**Layout**: Timeline / table view

Each deployment row:
- Commit hash (short) + message + author avatar
- Branch name
- Timestamp (relative + absolute on hover)
- Status: Building → Deploying → Live / Failed
- Domains served
- Actions: Promote | View Logs | Rollback

**Deploy Logs Viewer**:
- Expandable inline or slide-over panel
- Build phase + deploy phase tabs
- ANSI color support
- Auto-scroll with pause on scroll-up
- Search within logs
- Copy logs button

**New Deploy Action**:
- Trigger deploy from branch selector
- Show progress in real-time
- Toast notification on completion

**New MCP tools for this phase**:
```
hosting:deploy              → Trigger deploy (branch + commit)
hosting:promote-deployment  → Promote to production
hosting:get-deployment-logs → Stream build + deploy logs
hosting:get-build-logs      → Build-specific logs
```

**Deliverable**: Full deployment workflow in mesh. Better than admin-cx.

---

## Phase 3: Environments + Domains

### 3.1 Environments Page

**Layout**: Cards for each environment

Each card:
- Name (staging, preview, PR-123, etc.)
- URL (clickable)
- Branch + commit hash
- Created at / updated at
- Status: Running / Scaled to Zero / Creating / Error
- Scale controls: "Wake up" / "Scale to zero"

**Actions**:
- Create environment: branch picker, name, type (staging/preview/content)
- Delete environment (with confirmation)
- View environment logs (streaming)
- Open in new tab

**Key insight for agents**: Environments are perfect agent sandboxes. An agent can:
- `hosting:create-environment` for a feature branch
- Test changes in the preview URL
- `hosting:delete-environment` when done

**New MCP tools**:
```
hosting:create-environment   → Create from branch
hosting:delete-environment   → Tear down
hosting:scale-environment    → Scale to/from zero
hosting:get-environment-logs → Stream logs
```

### 3.2 Domains Page

**Layout**: Table with status badges

Each domain row:
- Domain name
- Type: Production / Preview / Apex Redirect
- Status badge: Active (green) / Pending DNS (yellow) / SSL Pending (orange) / Error (red)
- SSL certificate info (authority, expiry)
- Actions: Validate | Remove

**Add Domain Wizard** (step-by-step):
1. Enter domain name
2. Show DNS records to configure (CNAME / A records)
3. Check button to validate DNS propagation
4. SSL provisioning status
5. Success + domain is live

**Apex Domain Setup**:
- Detect apex vs subdomain
- Show appropriate instructions (A record for apex, CNAME for subdomain)
- CAA record guidance

**New MCP tools**:
```
hosting:add-domain        → Add custom domain
hosting:remove-domain     → Remove domain
hosting:validate-domain   → Check DNS + SSL status
```

**Deliverable**: Complete domain management. No need to go to admin-cx.

---

## Phase 4: Monitoring Dashboard

### 4.1 Metrics Dashboard

**Layout**: Time range selector + metric cards + charts

**Time ranges**: Last 1h | 24h | 7d | 30d

**Metric Cards** (top row):
- Total Requests (with trend arrow)
- Bandwidth (formatted: GB/MB)
- Cache Hit Ratio (percentage with color)
- Average Latency (ms)
- Error Rate (percentage)

**Charts** (below cards):
- Requests over time (area chart)
- Status code distribution (stacked bar or donut)
- Bandwidth over time
- Latency p50/p95/p99 over time

**Tables**:
- Top Paths (path, hits, avg latency, error rate)
- Top Countries (country flag + name, requests, bandwidth)
- Error Patterns (from HyperDX: pattern, count, last seen)

**Chart library**: Use whatever mesh already uses, or lightweight option like Recharts / Chart.js.

**New MCP tools**:
```
hosting:get-metrics-summary   → Aggregate metrics for time range
hosting:get-status-codes      → Status code breakdown
hosting:get-top-paths         → Most accessed paths
hosting:get-top-countries     → Traffic by geography
hosting:get-error-patterns    → Error patterns from HyperDX
hosting:get-usage-timeline    → Time series data
hosting:get-resource-usage    → CPU, memory, pod count (K8s)
```

**Deliverable**: Beautiful monitoring dashboard. Better visibility than admin-cx.

---

## Phase 5: Billing Integration + Credit Card Modal

### 5.1 Usage Tracking

The hosting plugin needs to show and charge for usage. Mesh already has the wallet/credit system.

**What costs money**:
- Active environments (compute time)
- Bandwidth consumed
- Build minutes
- Domain/SSL provisioning

**Integration with existing mesh billing**:
- Use mesh's existing `wallet` API for balance checks
- Use mesh's existing Stripe Checkout for "Add Credits" flow
- Show usage costs per-site in the hosting UI

### 5.2 Credit Card / Upgrade Modal

**When it appears**:
- User tries to create a site but has insufficient credits
- User tries to create an environment but is at plan limit
- Monthly usage exceeds free tier

**Modal design**:
```
┌─────────────────────────────────────────────┐
│  ⚡ Upgrade to continue                     │
│                                              │
│  You need credits to [action].               │
│                                              │
│  Current balance: $2.40                      │
│  Estimated cost: $5.00/mo                    │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │  Add $10.00 to wallet                   │ │
│  │  Add $25.00 to wallet (Recommended)     │ │
│  │  Add $50.00 to wallet                   │ │
│  │  Custom amount...                        │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  [Add Credits →]  [Cancel]                   │
│                                              │
│  💳 Secure checkout via Stripe               │
└─────────────────────────────────────────────┘
```

**Implementation**: Reuse mesh's existing `createCheckoutSession` mutation and wallet components. The hosting plugin just wraps them with context about what the user is trying to do.

### 5.3 Usage Display in Plugin

**Per-site usage card** (in site detail → overview):
- Current month compute hours
- Bandwidth used
- Build minutes used
- Estimated monthly cost

**Billing link**: Direct link to mesh's existing `/billing` page for full history.

**Deliverable**: Users can pay for hosting. Self-serve. No manual billing.

---

## Phase 6: Landing Page + Product Polish

### 6.1 Landing Page

**Route**: Public route via `publicRoutes()` in server plugin.

**Sections**:
1. **Hero**: "Deploy at the edge, instantly" — tagline + CTA
2. **Features grid**: Preview envs, custom domains, monitoring, scale-to-zero, GitHub integration, agent-ready
3. **How it works**: Connect repo → Push → Live in seconds
4. **Pricing**: Free tier + pay-as-you-go credits
5. **Agent-native**: "Your AI agents can deploy too" — show MCP tool examples
6. **CTA**: "Get started free" → mesh signup

### 6.2 Create Site Wizard

**For new users coming from landing page**:
1. Choose: "Import from GitHub" or "Start from template"
2. If GitHub: repo picker (with GitHub App install if needed)
3. If template: template gallery (starter sites)
4. Configure: site name, framework detection, env vars
5. Deploy: watch first build in real-time
6. Done: site is live, show production URL

### 6.3 Agent Integration Story

Document and showcase:
- "Deploy my site" → agent calls `hosting:deploy`
- "Create a staging environment for branch feature-x" → agent calls `hosting:create-environment`
- "What's my error rate?" → agent calls `hosting:get-metrics-summary`
- "Add a custom domain example.com" → agent calls `hosting:add-domain`

This is the CloudRouter angle — hosting is agent-operable, not just UI-operable.

---

## Key Design Decisions

### 1. MCP Server Location
**Decision**: Start as an endpoint in admin-cx (path: `/mcp/hosting`)
**Why**: Direct access to Supabase, Cloudflare, K8s clients. No new service to deploy. Migrate to standalone later if needed.

### 2. Auth Bridge
**Decision**: OAuth2 flow from mesh to admin-cx
**Why**: Standard, secure, user-controlled. Admin-cx already has OAuth infrastructure (`routes/oauth/`).

### 3. Billing Model
**Decision**: Use mesh's existing credit/wallet system
**Why**: Already built, Stripe integrated, has add-credits flow. Just need usage metering and gating.

### 4. Real-time Logs
**Decision**: Start with polling (5s interval), upgrade to SSE later
**Why**: Polling is simple and reliable. SSE through MCP is possible but adds complexity. Ship fast.

### 5. Chart Library
**Decision**: Match whatever mesh billing already uses (appears to use custom components)
**Why**: Consistency. Don't introduce a new dependency if one exists.

---

## File Structure

```
mesh/packages/mesh-plugin-hosting/
├── client/
│   ├── index.tsx                    # ClientPlugin export
│   ├── lib/
│   │   ├── router.ts               # Plugin router (TanStack)
│   │   ├── query-keys.ts           # React Query cache keys
│   │   └── schemas.ts              # Shared Zod schemas
│   ├── components/
│   │   ├── plugin-header.tsx        # Connection selector header
│   │   ├── plugin-empty-state.tsx   # "Connect hosting" CTA
│   │   ├── sites/
│   │   │   ├── sites-grid.tsx       # Site cards grid
│   │   │   ├── site-card.tsx        # Individual site card
│   │   │   └── create-site-wizard.tsx
│   │   ├── site-detail/
│   │   │   ├── site-header.tsx      # Site name + actions
│   │   │   ├── site-tabs.tsx        # Tab navigation
│   │   │   ├── overview-tab.tsx
│   │   │   ├── deployments-tab.tsx
│   │   │   ├── environments-tab.tsx
│   │   │   ├── domains-tab.tsx
│   │   │   ├── monitoring-tab.tsx
│   │   │   └── settings-tab.tsx
│   │   ├── deployments/
│   │   │   ├── deployment-timeline.tsx
│   │   │   ├── deployment-row.tsx
│   │   │   ├── log-viewer.tsx
│   │   │   └── deploy-button.tsx
│   │   ├── environments/
│   │   │   ├── env-cards.tsx
│   │   │   ├── env-card.tsx
│   │   │   ├── create-env-dialog.tsx
│   │   │   └── env-logs.tsx
│   │   ├── domains/
│   │   │   ├── domain-table.tsx
│   │   │   ├── add-domain-wizard.tsx
│   │   │   └── dns-instructions.tsx
│   │   ├── monitoring/
│   │   │   ├── metrics-cards.tsx
│   │   │   ├── charts.tsx
│   │   │   ├── top-paths-table.tsx
│   │   │   └── error-patterns.tsx
│   │   ├── billing/
│   │   │   ├── upgrade-modal.tsx    # Credit card / add credits
│   │   │   └── usage-card.tsx       # Per-site usage display
│   │   └── landing/
│   │       ├── hero.tsx
│   │       ├── features.tsx
│   │       ├── pricing.tsx
│   │       └── agent-native.tsx
│   └── hooks/
│       ├── use-sites.ts
│       ├── use-deployments.ts
│       ├── use-environments.ts
│       ├── use-domains.ts
│       ├── use-monitoring.ts
│       └── use-billing.ts          # Wraps mesh wallet APIs
├── server/
│   ├── index.ts                     # ServerPlugin export
│   ├── routes/
│   │   ├── auth.ts                  # OAuth callback from admin-cx
│   │   └── landing.ts               # Public landing page route
│   ├── tools/
│   │   ├── connect.ts               # HOSTING_CONNECT tool
│   │   └── status.ts                # HOSTING_STATUS tool
│   └── migrations/
│       └── 001-hosting-settings.ts  # Per-project hosting preferences
├── shared.ts
└── package.json
```

---

## Implementation Priority

The order optimizes for **visible impact per unit of effort**:

| Priority | What | Why | Effort |
|---|---|---|---|
| P0 | MCP server (read tools) + connect flow | Foundation, everything else depends on it | 1 week |
| P1 | Sites grid + site detail (overview tab) | First "wow" moment, proves the concept | 1 week |
| P2 | Deployments tab + log viewer + deploy action | Core hosting UX, daily use | 1 week |
| P3 | Environments management | Key differentiator, agent sandbox story | 1 week |
| P4 | Domains wizard + SSL | Table stakes for production hosting | 1 week |
| P5 | Monitoring dashboard | Premium feel, data visualization | 1 week |
| P6 | Billing modal + usage tracking | Monetization, credit card acceptance | 3 days |
| P7 | Landing page + create site wizard | Go-to-market, acquisition | 1 week |
| P8 | Agent integration docs + examples | CloudRouter-style positioning | 2 days |

Total estimate: ~7-8 weeks for full product, but P0-P2 (3 weeks) gives you a usable MVP.

---

## Open Questions

1. **Should we build the MCP server in the admin-cx repo or as a new repo?**
   - Recommendation: In admin-cx initially (direct access to clients), extract later

2. **OAuth scoping**: Per-team or per-user token?
   - Recommendation: Per-team (a user picks which team to connect)

3. **Should environments show up as "MCP-connectable" in mesh?**
   - i.e., can you connect mesh to a preview environment's MCP endpoint?
   - Would be powerful: spin up env → connect MCP → edit content → deploy

4. **Free tier limits**: What's included without paying?
   - Need to define: X deploys/month, Y bandwidth, Z environments

5. **Existing admin-cx users migration**: Do current users automatically see their sites?
   - Recommendation: Yes, via OAuth. Connect once → all team sites visible.
