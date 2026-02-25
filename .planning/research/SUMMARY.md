# Project Research Summary

**Project:** v1.4 — Storefront Onboarding Diagnostic
**Domain:** Pre-auth to post-auth onboarding funnel for an e-commerce MCP Mesh platform
**Researched:** 2026-02-25
**Confidence:** HIGH — architecture from direct codebase inspection; stack from official docs; pitfalls verified

## Executive Summary

The v1.4 onboarding feature adds a public-facing "instant diagnostic" flow to MCP Mesh: a user enters their storefront URL, receives a real Lighthouse/CrUX-powered performance report with tech stack detection and AI-generated company context, then hits a login gate to continue into a guided chat interview and agent recommendations. The key design principle is "value before credentials" — the complete diagnostic runs without authentication, with login triggered only after the user sees something meaningful. Research shows that every additional step before this "wow moment" reduces conversion by ~3%, so the target is under 2 minutes from URL entry to seeing real data.

The recommended approach builds entirely on existing Mesh infrastructure: the diagnostic agents run as standalone async functions (not MCP tools, since MeshContext requires auth), public Hono routes are registered before the MeshContext middleware using the existing `shouldSkipMeshContext()` pattern, diagnostic results are stored in a new `onboarding_sessions` table with a UUID token that survives the login redirect via the existing `?next=` query param mechanism, and the post-login interview reuses the decopilot streaming chat with a structured system prompt. The REPORTS_BINDING schema maps exactly onto diagnostic output sections (metrics for CWV, criteria for SEO checklist, markdown for AI context). The most novel piece is the agent recommendation engine — a rule-based scoring function that matches detected tech stack and interview goals to available Virtual MCPs.

The three non-negotiable risks to address before any user touches this feature are: SSRF validation on the crawl endpoint (public pre-auth URL fetch is a classic attack vector), fetch timeout management (unresponsive hosts will hang the Hono event loop without an AbortController), and pre-auth state preservation through the login redirect (if the onboarding token is lost on redirect, the funnel conversion collapses). These are all Day 1 concerns, not deferrable. The remaining pitfalls — PSI rate limits, SPA empty HTML, WAF blocking, AI hallucination — are real but can be handled gracefully with degraded states rather than requiring upfront blocking work.

---

## Key Findings

### Recommended Stack

The onboarding diagnostic requires zero new framework-level dependencies. Bun's native `fetch` handles crawling with `AbortSignal.timeout(15_000)`, `node-html-parser ^7.0.2` (pure TypeScript, no native bindings, 3-5x faster than cheerio for read-only traversal) handles HTML parsing, and the existing `ai ^6.0.1` SDK handles AI summarization. Both the Google PageSpeed Insights API v5 and CrUX API are called via plain REST with the same Google Cloud API key — no npm packages needed. `p-limit ^6.2.0` and `p-retry ^6.2.1` handle concurrency control and backoff against PSI's undocumented per-origin throttle.

**Core technologies (new additions only):**
- `node-html-parser ^7.0.2`: HTML DOM parsing for tech detection and SEO extraction — pure TS, Bun-compatible, no native modules
- `p-limit ^6.2.0`: Concurrency cap for PSI API calls — prevents hitting undocumented per-origin 500 errors
- `p-retry ^6.2.1`: Exponential backoff for PSI 500 responses — 3 retries with 2s base delay
- Google PageSpeed Insights API v5 (REST): Lighthouse scores + CrUX field data — 25K req/day free with API key
- Google CrUX API (REST): Real-user Core Web Vitals at origin level — same API key, 150 req/min
- Custom tech detector (50-line regex map): Platform fingerprinting for VTEX/Shopify/Magento/WooCommerce/Nuvemshop — `wappalyzer-core` is unmaintained and deprecated

**Critical version requirement:** `p-limit` and `p-retry` are ESM-only — apps/mesh is already `"type": "module"`, so compatible.

**What NOT to add:** `wappalyzer-core` (deprecated), `lighthouse` npm (requires Chrome binary, unsupported in Bun), `puppeteer`/`playwright` (200+ MB binary deps, unnecessary for HTML-level detection), `jsdom` (C++ bindings incompatible with Bun worker threads).

### Expected Features

**Must have (table stakes):**
- URL input with validation — entry point expectation set by PageSpeed Insights / GTmetrix
- Core Web Vitals (LCP, INP, CLS) — Google-mandated industry standard; every Shopify agency speaks in LCP
- Performance score 0–100 — single anchor number users can share and compare
- Mobile vs. desktop performance split — 60%+ of e-commerce traffic is mobile; this split is consistently surprising
- Platform detection (Shopify/VTEX/Magento/WooCommerce) — Wappalyzer has set this as a commodity expectation
- SEO basics: title tag, meta description, Open Graph — missing = users with any SEO awareness spot it immediately
- HTTPS and security header check — security baseline; every modern audit tool includes it
- Public shareable report URL — PageSpeed Insights/GTmetrix pattern; users want to forward to their developer
- Login gate after value delivery — show value first; the gate triggers after the "wow"

**Should have (differentiators):**
- AI company context extraction — LLM reads homepage and writes a plain-English paragraph about what the store sells; the "agency did their homework" moment
- Schema markup detection (Product, Review, BreadcrumbList) — e-commerce-specific SEO signal; generic tools skip it
- Social proof signal detection (Trustpilot, Judge.me, Yotpo) — trust = conversion; e-commerce specific
- Open Graph / social preview quality check — most store owners don't know their link preview is broken
- Post-login chat interview — conversational intake (70–90% completion) beats a 10-field wizard form
- Agent recommendations from diagnostic + goals — hiring metaphor; agents presented as specialists
- Diagnostic report stored as REPORTS_BINDING artifact — report lives in platform, not a one-time render

**Defer to v2+:**
- Competitor analysis (requires SimilarWeb/Semrush API, $$$ and out of scope)
- Full SEO keyword analysis (requires Ahrefs/DataForSEO, no free public API)
- Page-by-page audit (homepage scan is sufficient for pre-auth wow; post-login agents handle deeper audits)
- WhatsApp report sharing (shareable URL is sufficient; paste link anywhere)
- WCAG accessibility audit (requires headless browser rendering; out of scope for diagnostic)
- robots.txt / sitemap.xml checks (high value but not MVP-critical; defer to post-MVP)

### Architecture Approach

The flow crosses the authentication boundary exactly once, and the architecture is designed to make that transition seamless. Pre-auth: public Hono routes registered before the MeshContext middleware write to an `onboarding_sessions` table (UUID token, 24h TTL) and run diagnostics in the background with `Promise.allSettled` so one failing diagnostic doesn't block the others. Post-auth: the existing `?next=` param on the login route carries the token through OAuth redirects; a claim endpoint associates the session with the org; the decopilot stream endpoint runs the interview with a structured system prompt in a dedicated Virtual MCP. The recommendation engine is a rule-based scoring function that queries `ctx.storage.virtualMcps.list(orgId)` at runtime so it automatically discovers new agents added by operators.

**Major components:**
1. `apps/mesh/src/api/routes/onboarding-public.ts` — Public Hono routes (diagnose, session status, report endpoint); registered before MeshContext middleware; accesses Kysely directly without MeshContext
2. `apps/mesh/src/tools/onboarding/diagnostics/` — Four standalone async functions (pagespeed, html-crawl, tech-detect, company-context); NOT MCP tools (those require auth); run in parallel via `Promise.allSettled`
3. `apps/mesh/migrations/035-onboarding-sessions.ts` — New DB table: `id` (UUID/token), `url`, `status`, `results` (JSON), `organization_id` (NULL until claim), `expires_at`
4. `/onboard` and `/report/:token` React routes — Public TanStack Router routes parented to `rootRoute` (not `shellLayout`), matching the existing `loginRoute`/`connectRoute` pattern
5. `apps/mesh/src/api/routes/onboarding-auth.ts` — Authenticated routes (claim, recommend); uses MeshContext; wires session to org and runs scoring
6. `apps/mesh/src/tools/onboarding/recommend.ts` — Rule-based agent recommendation scoring; queries live Virtual MCP registry; never hardcodes agent IDs
7. Interview Virtual MCP — Configured in DB with structured system prompt; reuses existing decopilot stream; no new chat infrastructure needed

**Key patterns from codebase:**
- Add `/api/onboarding/` to `shouldSkipMeshContext()` in `apps/mesh/src/api/utils/paths.ts` — same day as creating the routes
- Use `Promise.allSettled` not `Promise.all` — partial results are fine; one failing diagnostic must not block the report
- Respond to POST /diagnose immediately with token, run diagnostics in background — never block on 10-30 second pipeline
- `sessionStorage.setItem("mesh:onboarding:token", token)` as fallback before login redirect — URL param is primary, storage is backup

### Critical Pitfalls

1. **SSRF via crawl endpoint** — Before any outbound fetch: resolve hostname, block private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16), block non-HTTP schemes, re-validate IP after redirects. This is a BLOCKER — must be in place before the endpoint goes live.

2. **Crawl fetch hanging the event loop** — Wrap every outbound `fetch()` with `AbortController` and a 5-second timeout. Without it, a single unresponsive host hangs the Hono request indefinitely. No exceptions.

3. **Pre-auth state lost on login redirect** — Store the diagnostic token in both the `?next=` URL param and `sessionStorage` before navigating to login. Better Auth preserves `?next=` through OAuth flows via the `state` parameter. Read from URL param first, sessionStorage second on the claim route. This is a BLOCKER for funnel conversion.

4. **PSI undocumented per-origin rate limit** — Google publishes 25K/day and 240/4-min, but the real constraint is ~1 req/sec sustained before getting 500 errors for ~5 minutes. Cache PSI results by normalized URL with a 24-hour TTL; deduplicate in-flight requests for the same URL; use `p-retry` with exponential backoff on 500 responses. Make PSI score optional enrichment — never block the report on it.

5. **AI hallucination on company context** — Ground the prompt strictly to HTML evidence only. Sanitize HTML before passing to LLM: strip scripts, styles, nav, footer, ads — pass only `<main>`, `<h1>`, `<meta>`, and OG tags. Show the user the generated context with an "Edit" affordance before persisting it. Never auto-save AI-generated content about someone's own business without letting them verify it.

---

## Implications for Roadmap

The architecture research identifies a clean 8-phase build order where each phase is independently testable and releasable. Phases A–D deliver the "show value before login" story (the core conversion hypothesis). Phases E–H deliver the full funnel through recommendations. The phases below map directly to that ordering with pitfall mitigations embedded at the right points.

### Phase 1: Database Foundation

**Rationale:** Everything downstream depends on the `onboarding_sessions` table. Zero risk to create this migration in isolation; it has no UI dependencies.

**Delivers:** Kysely migration `035-onboarding-sessions.ts` with `id`, `url`, `status`, `results`, `organization_id`, `user_id`, `created_at`, `updated_at`, `expires_at` columns.

**Addresses:** Storage foundation for all diagnostic results, pre/post-auth state handoff.

**Avoids:** Avoid adding org-level FK constraints at this stage — `organization_id` is nullable until claim.

### Phase 2: Diagnostic Service Functions

**Rationale:** Pure TypeScript functions with no Hono/React/DB dependencies are the safest starting point. Can be unit-tested in complete isolation. All downstream phases depend on these functions.

**Delivers:** Four standalone async functions: `runPagespeedDiagnostic`, `runHtmlCrawl`, `runTechDetect`, `runCompanyContext`. Custom tech detection regex map for VTEX/Shopify/Magento/WooCommerce/Nuvemshop/GTM/GA4/Meta Pixel.

**Uses:** `node-html-parser`, `p-limit`, `p-retry`, Google PSI API, Google CrUX API, `generateText` from AI SDK.

**Avoids:** Do NOT use `wappalyzer-core` (unmaintained). Do NOT use `defineTool()` here — MeshContext requires auth. Do NOT run headless browser.

**Pitfalls to address here:** SSRF validation before any fetch (BLOCKER), AbortController with 5s timeout on all outbound fetches (BLOCKER), HTML sanitization before LLM call, SPA empty-HTML detection and graceful degradation, WAF/Cloudflare challenge page detection.

### Phase 3: Public Hono API Routes

**Rationale:** Thin HTTP layer over Phase 2 functions. Establish the token-based async pattern (respond immediately with token, poll for results) before building any UI. Validates the end-to-end pipeline.

**Delivers:** `POST /api/onboarding/diagnose` (returns token), `GET /api/onboarding/session/:token` (status + partial results), `GET /api/onboarding/report/:token` (full results JSON). IP-rate-limiting middleware on diagnose endpoint.

**Implements:** Public Hono route pattern — register before MeshContext middleware in `app.ts`, add `/api/onboarding/` to `shouldSkipMeshContext()` in `paths.ts` in the same commit.

**Pitfalls to address here:** Add to `shouldSkipMeshContext()` immediately (LOW effort, catches Pitfall 8). Add per-IP rate limiting on the diagnose endpoint. Set `noindex` header on report endpoint responses.

### Phase 4: Public React Routes

**Rationale:** UI layer over Phase 3. `/onboard` and `/report/:token` are public routes that must render without auth — pattern is identical to the existing `loginRoute` and `connectRoute`.

**Delivers:** `/onboard` URL input page (public TanStack route under `rootRoute`), `/report/:token` report render page (reads from `GET /api/onboarding/report/:token`), progressive loading states ("Fetching site..." → "Analyzing..." → "Generating report..."), "Storefront Health Score" single anchor number at the top.

**Implements:** REPORTS_BINDING-style section rendering for metrics (CWV), criteria (SEO checklist), markdown (AI company context). Report page has `noindex` meta tag and UUID-based token URLs.

**Pitfalls to address here:** Edit affordance for AI-generated company context (Pitfall 6 — users must be able to correct wrong AI output before it's persisted). Specific error states for WAF blocking ("This site blocked our crawler") and SPA sparse HTML ("Limited data available").

### Phase 5: Auth Handoff (Claim Flow)

**Rationale:** The login gate and token preservation are the conversion-critical step. This phase connects Phases A–D (pre-auth value delivery) to Phases F–H (post-auth funnel). Must be done before any auth-dependent feature.

**Delivers:** `sessionStorage.setItem("mesh:onboarding:token", token)` before login redirect, login redirect to `/login?next=/onboarding/claim/:token`, `/onboarding/claim/:token` React route (reads token from URL param, falls back to sessionStorage), `POST /api/onboarding/claim` authenticated endpoint (associates session with org, uses existing `seedOrgDb` hook — does NOT duplicate org creation).

**Avoids:** Do NOT add a second org creation path — the existing `databaseHooks.user.create.after` hook in `apps/mesh/src/auth/index.ts` already handles this (Pitfall 7). Write storefront URL to org metadata as a post-creation operation with an explicit org ID, not inside the creation transaction.

**Pitfalls to address here:** Pre-auth state preservation through OAuth redirect (BLOCKER — full funnel test: URL entry → login → OAuth redirect → confirm token present on claim route).

### Phase 6: Post-Login Chat Interview

**Rationale:** The interview reuses existing decopilot infrastructure — this is primarily configuration and a new React route, not new infrastructure. Needs the claim flow (Phase 5) to exist first.

**Delivers:** Interview Virtual MCP configured in DB with structured system prompt (4 required questions, outputs JSON summary + `INTERVIEW_COMPLETE` signal), `/$org/$project/onboarding` React route using `<Chat.Provider>` with interview mode (suggested-response chips replace freeform input, chat detects `INTERVIEW_COMPLETE` and transitions to recommendation phase), interview results stored to `onboarding_sessions` row.

**Implements:** New `OnboardingChat` component at interview route level — NOT modifying the shared `ChatPanel` component (Pitfall 4 from architecture).

**Research flag:** Standard pattern — decopilot stream endpoint is well-documented in codebase. Skip research-phase.

### Phase 7: Agent Recommendation Engine

**Rationale:** The most novel piece; depends on having both diagnostic results (Phase 2) and interview goals (Phase 6). Rule-based scoring avoids LLM latency/cost for the recommendation step while remaining maintainable.

**Delivers:** `apps/mesh/src/tools/onboarding/recommend.ts` — rule-based scoring function that reads detected tech stack + interview goals and scores against `ctx.storage.virtualMcps.list(orgId)` at runtime. `POST /api/:org/onboarding/recommend` endpoint. `recommendations.tsx` React route with agent cards showing reason text and "Connect" CTA.

**Implements:** Dynamic agent matching against live Virtual MCP registry — never hardcodes agent IDs (Pitfall 5 from architecture). Pre-fills connection config from diagnostic results where possible (e.g., VTEX store domain pre-populated).

**Research flag:** Needs research-phase — the scoring/matching logic is novel. Specifically: how to represent agent capabilities as tags/metadata that the scorer can query without hardcoding; whether to weight diagnostic signals vs. interview signals differently.

### Phase 8: Connection Setup Surface

**Rationale:** The existing connection wizard already works. This phase only needs to surface it from recommendation cards and pre-populate connection type from agent requirements.

**Delivers:** "Connect" buttons on recommendation cards that navigate to the existing connection wizard with pre-populated connection type. Post-setup confirmation state ("You're set up. Here's your plan.").

**Research flag:** Standard pattern — connection wizard exists. Skip research-phase. Only the linking and pre-population is new work.

---

### Phase Ordering Rationale

The 8-phase order follows strict data dependencies: the DB table must exist before routes can write to it; service functions must exist before routes can call them; public routes must exist before the React UI can fetch from them; the claim flow must exist before post-auth features can access session data; the interview must complete before the recommendation engine has input data; recommendations must render before connection setup has a surface to link from.

The split between Phases A–D (pre-auth) and E–H (post-auth) is deliberate — Phases A–D are independently shippable as the "value before login" MVP. The conversion hypothesis (show a real diagnostic, then ask for login) can be validated before investing in the full funnel.

Pitfall mitigations are embedded in the earliest phase that touches the vulnerable code path: SSRF and timeout in Phase 2 (the service functions), rate limiting and `shouldSkipMeshContext` in Phase 3 (route creation), auth state preservation in Phase 5 (the handoff), org creation isolation in Phase 5 as well.

---

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 7 (Agent Recommendation Engine):** Novel scoring logic. Needs research into agent capability representation — how Virtual MCPs expose their requirements as queryable metadata. The `agent_search` tool exists but selects, it doesn't rank or recommend. Gap: is there already a tags/capabilities field on Virtual MCPs that can be matched against detected tech stack, or does this need a new metadata schema?

Phases with standard patterns (skip research-phase):

- **Phase 1 (DB Migration):** Kysely migration pattern is well-established and used in 34 prior migrations.
- **Phase 2 (Diagnostic Functions):** PSI API, CrUX API, and HTML parsing are well-documented. Custom regex detection is straightforward.
- **Phase 3 (Public Hono Routes):** Pattern copied from existing `public-config.ts` and `shouldSkipMeshContext` setup.
- **Phase 4 (Public React Routes):** Pattern copied from `loginRoute`/`connectRoute` — adding to `rootRoute` outside `shellLayout`.
- **Phase 5 (Auth Handoff):** `?next=` param mechanism is documented in the existing codebase.
- **Phase 6 (Chat Interview):** Decopilot stream endpoint, Virtual MCP configuration, and `<Chat.Provider>` composition are all existing patterns.
- **Phase 8 (Connection Setup Surface):** Connection wizard exists; only linking and pre-population is new.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Official docs for PSI/CrUX APIs (HIGH); `node-html-parser` version from npm search result (MEDIUM); PSI undocumented rate limit from single 2022 blog post corroborated by community reports (LOW-MEDIUM for that specific detail) |
| Features | HIGH | Feature expectations grounded in direct competitors (PageSpeed Insights, GTmetrix, Wappalyzer); REPORTS_BINDING schema read directly from source; decopilot and agent_search tools read directly from source |
| Architecture | HIGH | All patterns derived from direct codebase inspection: `app.ts`, `paths.ts`, `index.tsx` route tree, `context-factory.ts`, `public-config.ts`. No inferences — all stated patterns verified in source. |
| Pitfalls | HIGH | SSRF from OWASP (authoritative); PSI rate limit from 2022 post + community corroboration (MEDIUM for that specific number); auth state loss from Better Auth docs + codebase verification; crawl timeout from standard Bun/fetch behavior (HIGH) |

**Overall confidence:** HIGH

### Gaps to Address

- **PSI per-origin throttle specifics:** The 450–500 request ceiling and 5-minute timeout window come from a single 2022 blog post. The safe mitigation (cache by URL, `p-retry`, treat PSI as optional) is correct regardless of the exact numbers, but the threshold behavior should be validated empirically before setting final cache TTL and concurrency limits.

- **Virtual MCP capability metadata:** The recommendation engine design assumes Virtual MCPs have queryable capability tags or a declared `requiredConnections` field. Research did not verify whether this metadata already exists or needs to be added as part of Phase 7. This is the single largest unknown in the implementation plan.

- **`@ai-sdk/openai` transitive availability:** STACK.md notes that `@ai-sdk/openai` may be pulled in transitively via `ai ^6.0.1` but advises verifying with `bun pm ls | grep @ai-sdk/openai`. If absent, explicit installation is needed. Confirm before Phase 2 starts.

- **LLM provider for pre-auth summarization:** Two valid patterns exist — a hardcoded `ONBOARDING_LLM_API_KEY` for the public summarization step, or routing through `MeshContext` post-claim. The pre-auth case requires the env var approach (no session available). Phase 2 should implement graceful degradation (skip AI summary if key is absent) so this doesn't block deployment.

---

## Sources

### Primary (HIGH confidence)
- `apps/mesh/src/api/app.ts` — middleware ordering, public route registration pattern
- `apps/mesh/src/api/utils/paths.ts` — `shouldSkipMeshContext()` allowlist
- `apps/mesh/src/api/routes/public-config.ts` — existing public route pattern
- `apps/mesh/src/web/index.tsx` — full route tree, public vs. authenticated route structure
- `apps/mesh/src/auth/index.ts` — org creation hook, `databaseHooks.user.create.after`
- `packages/bindings/src/well-known/reports.ts` — REPORTS_BINDING schema
- `apps/mesh/src/api/routes/decopilot/routes.ts` — existing chat stream endpoint
- [Google CrUX API](https://developer.chrome.com/docs/crux/api) — endpoint, metrics, rate limits
- [AI SDK generateText](https://ai-sdk.dev/docs/ai-sdk-core/generating-text) — non-streaming server-side usage
- [Hono Combine Middleware](https://hono.dev/docs/middleware/builtin/combine) — route exclusion patterns
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — IP blocklist strategy
- [Google PageSpeed Insights API v5](https://developers.google.com/speed/docs/insights/v5/get-started) — rate limits, auth, response schema
- [Core Web Vitals 2025 Thresholds](https://uxify.com/blog/post/core-web-vitals) — LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1
- [wappalyzer-core npm](https://www.npmjs.com/package/wappalyzer-core) — deprecated status confirmed

### Secondary (MEDIUM confidence)
- [node-html-parser npm](https://www.npmjs.com/package/node-html-parser) — v7.0.2 current, Bun-compatible
- [BuiltWith vs Wappalyzer](https://www.crft.studio/blog/crft-lookup-vs-builtwith-vs-wappalyzer) — technology detection expectations
- [SaaS Onboarding Best Practices 2025](https://productled.com/blog/5-best-practices-for-better-saas-user-onboarding) — value-before-credentials, 3-question interview patterns
- [Ecommerce Checkout UX 2025](https://baymard.com/blog/current-state-of-checkout-ux) — trust signals, abandonment rates
- [Auth0: User Onboarding Strategies B2B SaaS](https://auth0.com/blog/user-onboarding-strategies-b2b-saas/) — pre-to-post-auth state handoff patterns
- [Web Scraping Challenges 2025](https://www.scrapingbee.com/blog/web-scraping-challenges/) — WAF fingerprinting, SPA rendering issues
- [LLM Hallucinations 2025 (Lakera)](https://www.lakera.ai/blog/guide-to-hallucinations-in-large-language-models) — grounding strategies

### Tertiary (LOW confidence)
- [PSI Undocumented Rate Limit (bjb.dev, 2022)](https://bjb.dev/log/20221009-pagespeed-api/) — 450–500 per-origin request ceiling, 5-minute penalty window. Single author, 4 years old; directionally correct but specific numbers need empirical validation.

---

*Research completed: 2026-02-25*
*Ready for roadmap: yes*
