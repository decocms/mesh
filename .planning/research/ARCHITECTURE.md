# Architecture Patterns: Storefront Onboarding Integration

**Domain:** Pre-auth to post-auth onboarding flow for an existing authenticated platform
**Researched:** 2026-02-25
**Confidence:** HIGH — all findings from direct codebase inspection

---

## Recommended Architecture

The onboarding flow crosses the auth boundary. The cleanest integration follows how the existing codebase handles other pre-auth concerns: register dedicated Hono routes **before** the MeshContext injection middleware, use the same database access layer directly without auth, and store state in a new `onboarding_sessions` table that carries forward through login.

```
Pre-auth phase                         Post-auth phase
─────────────────────────────────      ──────────────────────────────────
Browser → /onboard (public route)      Browser → /$org/$project/onboarding
            ↓                                          ↓
POST /api/onboarding/diagnose          GET /api/onboarding/session/:token
(no MeshContext needed)                (requires auth, claims session → org)
            ↓                                          ↓
Diagnostic services run in parallel    Chat interview → agent recommendations
(PageSpeed API, HTML crawl, etc.)      → Connection setup wizard
            ↓
DB: onboarding_sessions table
(token as primary key, 24h TTL)
            ↓
GET /report/:token (public route)
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `/api/onboarding/*` Hono routes | Public API: accepts URL, runs diagnostics, returns token | Diagnostic services, DB direct |
| Diagnostic services (`src/tools/onboarding/`) | Each diagnostic as a standalone async function (not MCP tool) | External APIs (PageSpeed, HTML fetch), DB |
| `onboarding_sessions` DB table | Stores pre-auth diagnostic results, associates with org after login | Read by claim endpoint and public report route |
| `/report/:token` Hono route | Serves public shareable report as JSON (SSR or JSON for SPA) | `onboarding_sessions` table |
| `/onboard` React route (public, in TanStack Router) | URL input form + polling for diagnostic progress | `/api/onboarding/*` |
| `/report/:token` React route (public) | Renders formatted report, login CTA | `/api/onboarding/report/:token` |
| Claim endpoint `/api/onboarding/claim` | Post-login: associates session with org, creates org if needed | `onboarding_sessions`, Better Auth org API |
| Onboarding interview React route (post-auth) | Chat wizard with structured questions (not freeform) | Existing decopilot stream endpoint |
| Agent recommendation logic | Matches diagnostic results + goals to agents | `onboarding_sessions` + virtual MCP registry |

---

## Detailed Answers to Integration Questions

### 1. Pre-auth API Routes: How to Add Public Hono Endpoints

**Pattern:** Add routes **before** the MeshContext injection middleware at line 531 of `apps/mesh/src/api/app.ts`.

The existing code already has this pattern for public endpoints:
- `/health` and `/metrics` — registered before the context middleware
- `/api/config` — registered before the context middleware (`app.route("/api/config", publicConfigRoutes)`)
- `/api/auth/*` — skip MeshContext via `shouldSkipMeshContext()` in `paths.ts`

The `shouldSkipMeshContext()` function at `apps/mesh/src/api/utils/paths.ts` controls which paths skip context injection. Paths starting with `/api/auth/` are already excluded.

**Implementation:**

```typescript
// In apps/mesh/src/api/app.ts — add BEFORE the MeshContext middleware block
import onboardingPublicRoutes from "./routes/onboarding-public";

// After publicConfigRoutes registration (~line 268):
app.route("/api/onboarding", onboardingPublicRoutes);
```

```typescript
// In apps/mesh/src/api/utils/paths.ts — extend shouldSkipMeshContext
export function shouldSkipMeshContext(path: string): boolean {
  return (
    path === "/" ||
    path.startsWith(PATH_PREFIXES.API_AUTH) ||
    path.startsWith("/api/onboarding/") || // ADD THIS
    isSystemPath(path) ||
    isStaticFilePath(path)
  );
}
```

The onboarding public routes get direct database access via the shared `database.db` Kysely instance passed through the route creation — the same pattern as how `public-config.ts` and `auth.ts` routes work.

**Pattern for direct DB access in public routes:**

```typescript
// apps/mesh/src/api/routes/onboarding-public.ts
import { Hono } from "hono";
import type { Env } from "../env";

// db passed at construction time, same pattern as auth routes
export function createOnboardingRoutes(db: Kysely<Database>) {
  const app = new Hono<Env>();

  app.post("/diagnose", async (c) => {
    const { url } = await c.req.json();
    const token = crypto.randomUUID();

    // Insert session immediately, run diagnostics async
    await db.insertInto("onboarding_sessions").values({
      id: token,
      url,
      status: "pending",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).execute();

    // Fire diagnostics in background, do not await
    runDiagnosticsAsync(token, url, db);

    return c.json({ token });
  });

  app.get("/session/:token", async (c) => {
    // Returns current diagnostic status + partial results
    ...
  });

  return app;
}
```

### 2. Diagnostic Tool Architecture: MCP Tools vs. Standalone Functions

**Recommendation: Standalone async functions, NOT MCP tools.**

MCP tools via `defineTool()` require MeshContext which requires auth. Creating a "system-level" MeshContext without auth is possible (the factory accepts `req?: Request` — passing `undefined` creates an unauthenticated context) but it creates a misleading pattern that bypasses the auth design.

The right design: diagnostics are **services called by the API route**, not MCP tools called by agents. They become MCP tools only if a post-auth agent needs to re-run them on demand.

Each diagnostic is an independent async function:

```typescript
// apps/mesh/src/tools/onboarding/diagnostics/pagespeed.ts
export async function runPagespeedDiagnostic(url: string): Promise<PagespeedResult> { ... }

// apps/mesh/src/tools/onboarding/diagnostics/html-crawl.ts
export async function runHtmlCrawl(url: string): Promise<HtmlCrawlResult> { ... }

// apps/mesh/src/tools/onboarding/diagnostics/tech-detect.ts
export async function runTechDetect(url: string): Promise<TechStackResult> { ... }

// apps/mesh/src/tools/onboarding/diagnostics/company-context.ts
export async function runCompanyContext(url: string): Promise<CompanyContextResult> { ... }
```

**Parallel execution in the route handler:**

```typescript
async function runDiagnosticsAsync(token: string, url: string, db: Kysely<Database>) {
  const [pagespeed, html, tech, company] = await Promise.allSettled([
    runPagespeedDiagnostic(url),
    runHtmlCrawl(url),
    runTechDetect(url),
    runCompanyContext(url),
  ]);

  // Write results to onboarding_sessions
  await db.updateTable("onboarding_sessions")
    .set({
      status: "complete",
      results: JSON.stringify({ pagespeed, html, tech, company }),
      updated_at: new Date().toISOString(),
    })
    .where("id", "=", token)
    .execute();
}
```

**If post-auth re-run is needed:** wrap the functions in `defineTool()` at `apps/mesh/src/tools/onboarding/index.ts` so they can be exposed via a Virtual MCP agent. The underlying functions remain the same; the MCP tool is just a thin wrapper.

### 3. Report Storage: Pre-auth and Post-auth

**New table: `onboarding_sessions`**

```sql
CREATE TABLE onboarding_sessions (
  id TEXT PRIMARY KEY,               -- UUID, serves as the public token
  url TEXT NOT NULL,                  -- Storefront URL
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | complete | failed
  results TEXT,                       -- JSON blob of all diagnostic results
  organization_id TEXT,               -- NULL until claimed post-login
  user_id TEXT,                       -- NULL until claimed post-login
  created_at TEXT NOT NULL,
  updated_at TEXT,
  expires_at TEXT NOT NULL            -- 24h TTL for unclaimed sessions
);
```

Migration: `apps/mesh/migrations/035-onboarding-sessions.ts`

**Pre-auth:** Session row is created at POST /api/onboarding/diagnose, `organization_id` is NULL.

**Post-auth claim:** After login, client calls `POST /api/onboarding/claim` with `{ token, orgId }`. This endpoint:
1. Requires auth (runs through MeshContext middleware — it is NOT in the public routes)
2. Updates the session row: sets `organization_id` and `user_id`
3. Optionally creates the org if first-time signup (via `ctx.boundAuth.organization.create()`)
4. Returns the org slug and project to redirect to

**After claim:** The diagnostic results in `onboarding_sessions` are available to the post-auth interview via an authenticated endpoint. This avoids re-running expensive diagnostics.

### 4. Pre-auth → Post-auth Handoff: How the Transition Works

**Recommended: URL-based token passed through login flow, stored briefly in sessionStorage.**

The existing login route (`/login`) already accepts a `next` query param (see `loginRoute.validateSearch` in `apps/mesh/src/web/index.tsx`). Use this same mechanism.

Flow:

```
1. User completes onboarding diagnostic at /report/:token
2. User clicks "Get Started" → navigate to /login?next=/onboarding/claim/:token
3. Login completes → Better Auth redirects to ?next value
4. /onboarding/claim/:token React route:
   - Calls POST /api/onboarding/claim with { token }
   - Server creates/joins org, returns orgSlug
   - Client redirects to /$orgSlug/org-admin/onboarding
```

**Why not localStorage:** The token is transient (claim once, done). The `next` param in the URL is cleaner, survives OAuth redirects (which is the hard case), and aligns with the existing pattern. If OAuth is used for login, Better Auth preserves the `next` param through the OAuth flow via the `state` parameter.

**Fallback if token is lost:** Store token in sessionStorage as backup before navigating to login. On the claim route, read from URL param first, sessionStorage second.

```typescript
// Before navigating to login:
sessionStorage.setItem("mesh:onboarding:token", token);

// On claim route: read from URL or sessionStorage
const token = params.token ?? sessionStorage.getItem("mesh:onboarding:token");
```

### 5. Public Report Page: Route Pattern and SEO

**Two-part solution: a public React route + a public Hono JSON endpoint.**

**Frontend route (React / TanStack Router):**

```typescript
// In apps/mesh/src/web/index.tsx — add alongside other public routes
const reportRoute = createRoute({
  getParentRoute: () => rootRoute, // NOT shellLayout — no auth required
  path: "/report/$token",
  component: lazyRouteComponent(() => import("./routes/onboarding/report.tsx")),
});
```

This route lives outside `shellLayout` (which wraps with `RequiredAuthLayout`), exactly like `loginRoute`, `connectRoute`, and `storeInviteRoute`. It will not redirect to login.

**Backend JSON endpoint:**

```typescript
// apps/mesh/src/api/routes/onboarding-public.ts
app.get("/report/:token", async (c) => {
  const session = await db
    .selectFrom("onboarding_sessions")
    .select(["url", "status", "results", "created_at"])
    .where("id", "=", c.req.param("token"))
    .executeTakeFirst();

  if (!session) return c.json({ error: "Not found" }, 404);

  return c.json({ session });
});
```

**SEO:** The report page is React SPA — not SSR. For a diagnostic tool, this is acceptable (share-by-link use case). If SEO matters for report discovery, add Open Graph meta tags via `<title>` and `<meta>` in the React component using TanStack Router's `head` API (React 19 supports `<title>` directly in components). For true crawler indexing, this is a v2 concern; for v1.4, the link share is sufficient.

**URL pattern:** `/report/:token` (UUIDs) rather than `/report/:domain` — token is safer (no enumeration, unique per diagnostic run). A redirect from domain to latest token can be added later.

### 6. Chat Interview Integration: Structured Interview vs. Freeform

**Recommendation: Use the existing decopilot streaming endpoint with a structured system prompt and a new "interview" Virtual MCP that guides the conversation.**

The existing chat (`POST /api/:org/decopilot/stream`) supports `systemMessages` as an array prepended to the conversation. The interview is implemented by:

1. Creating a dedicated Virtual MCP in the database for the onboarding interview agent
2. Configuring it with a system prompt that enforces structured questioning
3. The UI restricts input until the interview is complete (disables freeform, shows structured buttons)

**System prompt approach (server side):**

```typescript
// The interview Virtual MCP's instructions field:
`You are an onboarding assistant. Your goal is to understand the user's e-commerce
objectives through a structured interview. Ask questions one at a time.
Required questions:
1. What is the primary challenge you are trying to solve?
2. Which platforms do you currently use? (VTEX, Shopify, LGPD compliance, etc.)
3. What is your team size working on this initiative?
4. What does success look like in 90 days?
After collecting all answers, output a structured JSON summary: { goals, platforms, team_size, success_criteria }
Then say INTERVIEW_COMPLETE.`
```

**Frontend changes:** The onboarding interview route renders the same `<Chat>` component tree but passes `interviewMode: true` to the chat context. In interview mode:
- Input is replaced with suggested-response chips until all questions are answered
- The chat detects `INTERVIEW_COMPLETE` in the stream and transitions to the recommendation phase

**Why not a custom wizard UI:** The decopilot stream handles persistence, model selection, and streaming out of the box. A custom multi-step form duplicates this infrastructure and loses the conversational UX.

**Thread association:** The interview creates a thread (same as normal chat). After claim, the thread ID is linked to the `onboarding_sessions` row for later reference.

### 7. Agent Recommendation Engine: Matching Diagnostics to Agents

**Recommendation: Server-side matching function — not LLM-based initially.**

The recommendation engine reads the completed `onboarding_sessions` record after the interview and returns scored agent suggestions.

**Data inputs to the match function:**
- `tech_stack` from diagnostics (identifies VTEX, Shopify, GA4, etc.)
- `interview.platforms` from chat interview (user-declared)
- `interview.goals` from chat interview
- `available_agents` from `ctx.storage.virtualMcps.list(orgId)`

**Implementation location:** `apps/mesh/src/tools/onboarding/recommend.ts`

```typescript
export interface AgentRecommendation {
  agentId: string;
  score: number;               // 0-100, for ordering
  reason: string;              // Human-readable explanation
  requiredConnections: string[]; // Connection types needed
}

export function recommendAgents(
  diagnostics: DiagnosticResults,
  interview: InterviewSummary,
  availableAgents: VirtualMCP[],
): AgentRecommendation[] {
  // Rule-based scoring:
  // - VTEX agent +50 if tech_stack includes VTEX
  // - GA4 agent +30 if tech_stack includes Google Analytics
  // - Performance agent +40 if pagespeed score < 50
  // etc.
}
```

**API endpoint:** `POST /api/:org/onboarding/recommend` (authenticated, after claim)

```typescript
// Returns ordered list of AgentRecommendation[]
// Client renders as "suggested next steps" with one-click connection setup
```

**Connection setup driven by recommendations:** The recommended agents each declare `requiredConnections`. The UI shows a checklist of connections to set up, with pre-filled configuration from diagnostic results (e.g., VTEX store domain pre-filled from `tech_stack.vtex_store_id`).

---

## Data Flow

```
1. User visits /onboard (public React route)

2. Submits URL
   → POST /api/onboarding/diagnose
   ← { token: "uuid" }
   → Diagnostics run in background (parallel Promise.allSettled)

3. Client polls GET /api/onboarding/session/:token
   ← { status: "running" | "complete", partial_results: {...} }

4. User views /report/:token (public React route)
   → GET /api/onboarding/report/:token
   ← { url, status, results: { pagespeed, html, tech, company } }

5. User clicks "Get Started"
   → sessionStorage.setItem("mesh:onboarding:token", token)
   → navigate("/login?next=/onboarding/claim/"+token)

6. Login completes → navigate("/onboarding/claim/:token")
   → POST /api/onboarding/claim { token }
     (authenticated, creates org from email domain if new user)
   ← { orgSlug, projectSlug }
   → navigate("/${orgSlug}/${projectSlug}/onboarding")

7. Chat interview at /$org/$project/onboarding (authenticated route)
   → uses existing POST /api/:org/decopilot/stream
   → interview Virtual MCP with structured system prompt
   ← streams structured interview

8. Interview completes (detects INTERVIEW_COMPLETE signal)
   → POST /api/:org/onboarding/recommend { sessionToken }
   ← AgentRecommendation[]
   → UI shows recommended agents + connection setup wizard
```

---

## New vs. Modified Components

### New Files

| File | Type | What It Does |
|------|------|--------------|
| `apps/mesh/src/api/routes/onboarding-public.ts` | NEW | Public Hono routes (diagnose, session status, report) |
| `apps/mesh/src/api/routes/onboarding-auth.ts` | NEW | Authenticated Hono routes (claim, recommend) |
| `apps/mesh/src/tools/onboarding/diagnostics/pagespeed.ts` | NEW | PageSpeed API diagnostic |
| `apps/mesh/src/tools/onboarding/diagnostics/html-crawl.ts` | NEW | HTML crawl + meta extraction |
| `apps/mesh/src/tools/onboarding/diagnostics/tech-detect.ts` | NEW | Tech stack detection (Wappalyzer patterns or similar) |
| `apps/mesh/src/tools/onboarding/diagnostics/company-context.ts` | NEW | AI-based company context extraction |
| `apps/mesh/src/tools/onboarding/recommend.ts` | NEW | Agent recommendation scoring function |
| `apps/mesh/migrations/035-onboarding-sessions.ts` | NEW | DB migration for onboarding_sessions table |
| `apps/mesh/src/web/routes/onboarding/landing.tsx` | NEW | Public URL input page (/onboard) |
| `apps/mesh/src/web/routes/onboarding/report.tsx` | NEW | Public report page (/report/:token) |
| `apps/mesh/src/web/routes/onboarding/claim.tsx` | NEW | Post-login claim handler (/onboarding/claim/:token) |
| `apps/mesh/src/web/routes/onboarding/interview.tsx` | NEW | Structured chat interview page |
| `apps/mesh/src/web/routes/onboarding/recommendations.tsx` | NEW | Agent recommendation + connection setup |

### Modified Files

| File | Change | Why |
|------|--------|-----|
| `apps/mesh/src/api/app.ts` | Add `app.route("/api/onboarding", onboardingPublicRoutes)` before MeshContext middleware | Register public routes |
| `apps/mesh/src/api/app.ts` | Add `app.route("/api", onboardingAuthRoutes)` after MeshContext middleware | Register authenticated routes |
| `apps/mesh/src/api/utils/paths.ts` | Add `/api/onboarding/` to `shouldSkipMeshContext()` | Skip auth context for public diagnostic routes |
| `apps/mesh/src/web/index.tsx` | Add `reportRoute`, `landingRoute`, `claimRoute` to route tree (outside shellLayout) | Public frontend routes |
| `apps/mesh/src/web/index.tsx` | Add `interviewRoute`, `recommendationsRoute` inside projectLayout | Post-auth onboarding routes |

---

## Patterns to Follow

### Pattern 1: Public Hono Route (Before MeshContext Middleware)

**What:** Register routes before `app.use("*", ...)` that injects MeshContext.
**When:** Any endpoint that must work without authentication.
**How:** Pass `database.db` at route construction time in `createApp()`.

```typescript
// In createApp() — BEFORE the MeshContext middleware block
const onboardingPublic = createOnboardingPublicRoutes(database.db);
app.route("/api/onboarding", onboardingPublic);
```

```typescript
// apps/mesh/src/api/routes/onboarding-public.ts
export function createOnboardingPublicRoutes(db: Kysely<Database>) {
  const app = new Hono();
  // routes use db directly, no MeshContext
  return app;
}
```

### Pattern 2: System-Level DB Access Without Auth

**What:** Access the database directly in public routes without creating MeshContext.
**When:** Pre-auth read/write to tables that don't require permission checks.
**Example in codebase:** `auth.ts` route uses `authConfig` directly without MeshContext; `public-config.ts` uses no DB at all.

Key insight: MeshContext's `storage.*` adapters are just wrappers around `Kysely<Database>`. For the onboarding table (which has no org-level RBAC), calling Kysely directly is correct. Do not create a fake MeshContext.

### Pattern 3: Parallel Diagnostics with `Promise.allSettled`

**What:** Run all diagnostics concurrently, capture each result or error independently.
**When:** Multiple independent external API calls.

```typescript
const [pagespeed, html, tech, company] = await Promise.allSettled([
  runPagespeedDiagnostic(url),
  runHtmlCrawl(url),
  runTechDetect(url),
  runCompanyContext(url),
]);

// Each result: { status: "fulfilled", value: T } | { status: "rejected", reason: unknown }
// Store all in JSON — partial results are fine (one failing diagnostic shouldn't fail the whole report)
```

### Pattern 4: Adding Public Frontend Routes

**What:** Add routes outside `shellLayout` (which requires auth).
**When:** Pages that must render without login.

```typescript
// In apps/mesh/src/web/index.tsx
const landingRoute = createRoute({
  getParentRoute: () => rootRoute, // NOT shellLayout
  path: "/onboard",
  component: lazyRouteComponent(() => import("./routes/onboarding/landing.tsx")),
});

// Add to routeTree:
const routeTree = rootRoute.addChildren([
  shellRouteTree,
  loginRoute,
  resetPasswordRoute,
  betterAuthRoutes,
  oauthCallbackRoute,
  connectRoute,
  storeInviteRoute,
  landingRoute,    // ADD
  reportRoute,     // ADD
  claimRoute,      // ADD
]);
```

### Pattern 5: Interview Mode in Chat

**What:** Restrict the chat UI to structured questions during onboarding.
**When:** The onboarding interview route is active.

The chat `context.tsx` exposes `useChat()`. The interview route uses `<Chat.Provider>` with a pre-configured agent (the interview Virtual MCP) and renders custom input components instead of the freeform Tiptap editor. The `useChat()` hook's `sendMessage()` is called programmatically when users select suggested responses.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Creating Unauthenticated MeshContext for Pre-auth Diagnostics

**What:** Calling `ContextFactory.create(undefined)` to get a context without a request, then running diagnostic MCP tools through it.
**Why bad:** It produces a context with `auth.user = undefined` and `organization = undefined`. Tools that call `ctx.access.check()` will throw. Tools that don't check access create an implicit privileged path with no audit trail, and it couples diagnostic logic to the MCP tool execution pipeline unnecessarily.
**Instead:** Standalone async functions called from the Hono route handler, accessing the DB directly.

### Anti-Pattern 2: Storing Diagnostic State Only in LocalStorage

**What:** Running diagnostics client-side (browser) or storing results only in `localStorage`.
**Why bad:** Crawler-unfriendly (report page can't be pre-rendered), not shareable across devices, lost on browser clear, cannot be associated with org post-login.
**Instead:** Server-side `onboarding_sessions` table as the source of truth. LocalStorage holds only the token as a fallback.

### Anti-Pattern 3: Blocking the POST /diagnose Response on Diagnostic Completion

**What:** Awaiting all diagnostic calls before responding to the client.
**Why bad:** PageSpeed API + HTML crawl + LLM company context can take 10-30 seconds total. The client will time out or the user will leave.
**Instead:** Respond immediately with a token, run diagnostics in background, client polls for status.

### Anti-Pattern 4: Adding Interview Logic to the Existing ChatPanel Component

**What:** Modifying `ChatPanel` or `side-panel-chat.tsx` to add interview mode behavior.
**Why bad:** Those components are the global chat panel used across all authenticated routes. Adding onboarding-specific logic pollutes a shared component and breaks separation of concerns.
**Instead:** Create a new `OnboardingChat` component at the interview route level that uses `<Chat.Provider>` and `<Chat>` building blocks but composes them differently.

### Anti-Pattern 5: Hardcoding Agent Recommendations

**What:** Hardcoding a list of agents in the recommendation logic.
**Why bad:** Agents are created dynamically in the database as Virtual MCPs. New agents added by operators won't be recommended.
**Instead:** Query `ctx.storage.virtualMcps.list(orgId)` and score against that list. For pre-configured "well-known" agents (VTEX, GA4), check by name or tag, not hardcoded ID.

---

## Build Order (Phase Dependencies)

```
Phase A: DB migration (035-onboarding-sessions)
  ↓
Phase B: Diagnostic service functions (standalone, no Hono/React)
  ↓
Phase C: Public Hono API routes (/api/onboarding/diagnose, /session/:token, /report/:token)
  ↓
Phase D: Public React routes (/onboard, /report/:token) — UI over Phase C
  ↓
Phase E: Authenticated claim endpoint (/api/onboarding/claim) — needs auth middleware
  ↓
Phase F: Interview Virtual MCP configuration + interview React route
  ↓
Phase G: Recommendation engine + recommendations React route
  ↓
Phase H: Connection setup wizard (final step, depends on agent data)
```

Each phase is independently testable and releasable. Phases A-D deliver the "show value before login" user story. Phases E-H deliver the full onboarding funnel.

---

## Scalability Considerations

| Concern | At 100 users/day | At 10K users/day | At 1M users/day |
|---------|-----------------|-----------------|-----------------|
| Diagnostic concurrency | Synchronous OK | Background job queue (BullMQ or similar) | Worker pool, rate limit per IP |
| `onboarding_sessions` size | No issue | Add TTL cleanup cron | Partition by date |
| PageSpeed API rate limit | Google allows 25K/day free | Add API key, or cache by domain | Cache aggressively, pro plan |
| Report page traffic | SPA, CDN cacheable | CDN cache JSON response | Edge compute |
| Claim endpoint contention | No issue | No issue (one claim per token) | No issue (PK lookup) |

For v1.4, synchronous diagnostics with `Promise.allSettled` are sufficient. Rate limit POST /api/onboarding/diagnose at the Hono middleware level (1 request/minute per IP) to prevent abuse.

---

## Sources

- `apps/mesh/src/api/app.ts` — full app setup, middleware ordering (HIGH confidence)
- `apps/mesh/src/api/utils/paths.ts` — `shouldSkipMeshContext()` implementation (HIGH confidence)
- `apps/mesh/src/api/routes/public-config.ts` — existing public route pattern (HIGH confidence)
- `apps/mesh/src/core/context-factory.ts` — MeshContext creation, auth flow (HIGH confidence)
- `apps/mesh/src/core/define-tool.ts` — tool execution pipeline (HIGH confidence)
- `apps/mesh/src/web/index.tsx` — full route tree, public vs. authenticated route structure (HIGH confidence)
- `apps/mesh/src/web/layouts/shell-layout.tsx` — `RequiredAuthLayout` wrapping (HIGH confidence)
- `apps/mesh/src/web/layouts/required-auth-layout.tsx` — auth redirect behavior (HIGH confidence)
- `apps/mesh/src/api/routes/decopilot/routes.ts` — existing chat stream endpoint (HIGH confidence)
- `apps/mesh/src/web/hooks/use-local-storage.ts` — LocalStorage via TanStack Query (HIGH confidence)
- `apps/mesh/src/web/lib/localstorage-keys.ts` — existing key naming conventions (HIGH confidence)
- `packages/mesh-plugin-reports/REPORTS_BINDING.md` — Reports binding contract (HIGH confidence)
- `apps/mesh/src/core/plugin-loader.ts` — plugin route mounting patterns (HIGH confidence)
