# Pitfalls Research

**Domain:** Storefront onboarding added to auth-first MCP Mesh platform
**Researched:** 2026-02-25
**Confidence:** HIGH (codebase verified + external sources corroborated)

---

## Critical Pitfalls

### Pitfall 1: SSRF via the Crawl Endpoint

**What goes wrong:**
The "enter your storefront URL, we'll crawl it" input is a classic SSRF vector. A user submits `http://169.254.169.254/latest/meta-data/` (AWS metadata service), `http://localhost:5432/` (internal Postgres), or any internal network address. The server faithfully fetches it, returning cloud credentials or internal service data. SSRF attacks surged 452% between 2023–2024 per Vectra AI research — the pattern is extremely well-known to attackers.

**Why it happens:**
Developers treat the URL as "just a website URL the user owns" and skip allowlist enforcement. The crawl endpoint is public (pre-auth), so there is no user identity to hold accountable. MCP Mesh's current CORS config (`return origin` for all origins) and the lack of egress controls compound the risk.

**How to avoid:**
Before making any outbound fetch in the crawl handler:
1. Resolve the hostname to an IP via DNS
2. Block private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fc00::/7`
3. Block non-HTTP/HTTPS schemes (`file://`, `ftp://`)
4. Re-validate IP after any redirect (don't just check the original URL)
5. Set a hard egress allowlist if possible (production infra level)

**Warning signs:**
- Any crawl endpoint that accepts arbitrary URLs without IP validation
- Redirects followed server-side without re-checking destination IP
- Errors leaking internal hostnames in API responses

**Severity:** BLOCKER — must be fixed before the crawl endpoint goes live.

**Phase to address:** Phase 19 (crawl endpoint creation) — Day 1 of sprint.

---

### Pitfall 2: PageSpeed API's Undocumented Per-Origin Rate Limit

**What goes wrong:**
Google publishes 25,000 requests/day and 240 requests/4 minutes. These are not the actual limits. Empirical testing shows a hidden per-origin ceiling around 450–500 requests that, when hit, causes the API to return `500: Unable to process request` for ~5 minutes. With an API key, sustainable throughput is ~1 req/second, not 4. Without an API key, limits are far stricter and shared globally.

**Why it happens:**
Developers trust the documented limits. In an onboarding sprint, you hit this fast if multiple users simultaneously submit the same large retailer (e.g., Shopify, Amazon) or if the same URL is tested repeatedly during demo loops.

**How to avoid:**
- Cache PageSpeed results by normalized URL with a 24-hour TTL (most scores don't change hourly)
- Implement per-URL request deduplication: if a crawl is in-flight for a URL, return the same promise, don't fire a second API call
- Use exponential backoff on 500 errors with randomized 1–180 second jitter
- Treat PageSpeed as optional enrichment: if it times out or rate-limits, return the report without the score, don't block the user

**Warning signs:**
- Spike of 500 errors from PageSpeed API during demo
- Same URL submitted by multiple concurrent users during onboarding tests
- No cache layer between your API and Google's API

**Severity:** BLOCKER for production, can-defer for initial demo (handle gracefully and show placeholder).

**Phase to address:** Phase 19 (crawl/diagnostic phase) — implement cache before first real users.

---

### Pitfall 3: Losing Pre-Auth State on Login Redirect

**What goes wrong:**
User enters their storefront URL, sees the diagnostic report, clicks "Get Full Report" — gets redirected to login. After login, Better Auth creates a session and redirects to `/` or a hardcoded post-login URL. The storefront URL and all diagnostic context is gone. User lands on an empty dashboard with no connection to why they signed up. Conversion collapses here.

**Why it happens:**
Better Auth's `loginPage` in the MCP plugin config (`loginPage: "/login"`) redirects users back to a fixed route after login. The diagnostic report page's URL parameters are not preserved through the OAuth flow or magic link redirect.

**How to avoid:**
- Store the storefront URL in `localStorage`/`sessionStorage` before redirecting to login
- On post-login landing, read from storage and redirect to the onboarding completion flow
- Alternatively, encode the storefront URL as a `?return_to=` param on the login URL and ensure Better Auth's `callbackURL` propagates it
- Better Auth's `databaseHooks.user.create.after` already seeds an org — hook into this to pre-populate the org's storefront URL from the session

**Warning signs:**
- Login redirect does not include `?callbackUrl=` or equivalent
- Post-login landing page is a fixed route (`/`) not the diagnostic result
- No mechanism to restore pre-auth context after session establishment

**Severity:** BLOCKER for conversion. If state is lost, the funnel is broken.

**Phase to address:** Phase 19 (auth handoff design) — must be designed before building the login gate.

---

### Pitfall 4: SPA Storefronts Returning Empty HTML

**What goes wrong:**
A simple `fetch(url).then(r => r.text())` on a Shopify, Next.js, or headless commerce site returns a nearly-empty HTML shell with a `<script>` tag. No product info, no meta description with meaningful content, no visible text. The AI context generator has nothing to work with and either halluccinates or produces generic output ("This is an e-commerce company that sells products").

**Why it happens:**
Modern storefronts (Shopify 2.0, Next.js, Nuxt, Remix) deliver content via client-side JavaScript. Server-side HTML is often just the shell. Developers test with simple sites that return full HTML, miss the SPA case entirely.

**How to avoid:**
- Check `Content-Type` and presence of meaningful `<meta>` tags as a quick heuristic
- Use `<title>`, `<meta name="description">`, `og:*` tags, and `<h1>` text as signals — these are always server-rendered even in SPAs
- Fall back to the domain name + TLD parsing for basic context ("shop.brandname.com" → likely e-commerce)
- Do NOT attempt to run a headless browser (Puppeteer/Playwright) in the crawl endpoint during a 6-hour sprint — it adds enormous infrastructure complexity
- Display "limited data available" UI state gracefully rather than showing obviously wrong AI output

**Warning signs:**
- Response HTML is < 2KB
- No `<h1>` tag in the HTML
- `<div id="root"></div>` or `<div id="__next"></div>` present with no children

**Severity:** HIGH — affects data quality for a large portion of storefronts. Can-defer the fix, but must handle the empty-HTML state gracefully from day 1.

**Phase to address:** Phase 19 (crawl logic) — add HTML quality check before passing to AI.

---

### Pitfall 5: WAF / Cloudflare Blocking the Crawl

**What goes wrong:**
The server-side fetch to the storefront URL returns a 403, 429, or an HTML Cloudflare challenge page (often with `200 OK` status). The raw HTML contains "Just a moment..." or "Attention Required!". The AI reads this as the site content and generates context about security challenges rather than the actual business.

**Why it happens:**
Cloudflare, Akamai, and similar WAFs fingerprint server-side requests by missing browser headers (`User-Agent`, `Accept-Language`, `Accept-Encoding`). Raw `fetch()` with no headers is immediately flagged. Most large retailer sites (Shopify Plus, WooCommerce, Magento) are behind Cloudflare.

**How to avoid:**
- Set a legitimate browser `User-Agent` header on all crawl requests: `Mozilla/5.0 (compatible; MeshBot/1.0; +https://mesh.deco.cx/bot)`
- Include standard browser headers: `Accept`, `Accept-Language`, `Accept-Encoding`
- Detect Cloudflare challenge pages: check for `cf-ray` response header or "Just a moment" in body before passing to AI
- Return a specific error state ("We couldn't access this site's public data") rather than passing challenge HTML to AI
- Do not attempt to bypass WAFs (legal/ToS risk)

**Warning signs:**
- `cf-ray` header in crawl response
- HTML body contains "Checking your browser" or "Just a moment"
- HTTP 403 or 429 from the target site

**Severity:** MODERATE — affects maybe 30–50% of production storefronts. Handle the failure state gracefully; don't try to bypass.

**Phase to address:** Phase 19 (crawl error handling) — add WAF detection before AI handoff.

---

### Pitfall 6: AI Hallucination on Company Context

**What goes wrong:**
The AI generates company context from crawled HTML. For sparse or ambiguous HTML, the LLM confidently invents: wrong founding year, wrong product categories, geographic market it doesn't serve, inflated user claims. Worse, the crawled site contains adult content, offensive material, or a competitor's site (user entered wrong URL), and the AI summarizes that faithfully.

**Why it happens:**
LLMs are trained to produce confident, complete-sounding output. When given sparse input, they fill gaps from training data about similar brands. A user entering `shop.example.com` may accidentally crawl a parked domain or a different brand entirely.

**How to avoid:**
- Ground the prompt strictly: "Only describe what is explicitly stated in the following HTML. If insufficient data exists, say so."
- Sanitize HTML before passing to LLM: strip scripts, styles, nav, footer, ads — pass only `<main>`, `<article>`, product section text
- Validate domain ownership signal: check if the URL's domain appears in the extracted brand name (basic consistency check)
- Hard-cap the context generation to fields with actual evidence: don't generate `founded_year` if it's not in the HTML
- Show the user the AI-generated context before it's stored, with "Edit this" affordances — never treat it as ground truth

**Warning signs:**
- AI output references facts not present anywhere in the HTML
- AI generates context for a site that returned a 403 or was empty
- No "Edit" affordance shown to user on the generated context

**Severity:** HIGH for trust. Users who see confidently wrong information about their own business will not trust the platform. Must have a correction mechanism from day 1.

**Phase to address:** Phase 19/20 (AI context generation) — include correction UI in the same phase.

---

### Pitfall 7: Org Creation Race Condition on Signup

**What goes wrong:**
The `databaseHooks.user.create.after` hook in `apps/mesh/src/auth/index.ts` already auto-creates an organization. The onboarding flow may also attempt to create or configure an org. Two concurrent operations try to create/modify the same org simultaneously. One fails silently, leaving the user in a partially-initialized state (org exists but storefront URL not saved, or vice versa).

**Why it happens:**
The existing hook (`seedOrgDb`) runs after user creation with retry logic for slug conflicts. If onboarding adds a second write to org metadata in a separate flow triggered by the same signup event, both run concurrently without coordination.

**How to avoid:**
- Treat org creation as owned by `seedOrgDb` — do not duplicate org creation logic in the onboarding flow
- Store the storefront URL as a separate column/metadata field, not tied to the org creation transaction
- Use the existing org's `metadata` field (Better Auth organizations support metadata) to store onboarding state
- Write storefront URL as a post-creation operation with explicit org ID, not during the creation transaction

**Warning signs:**
- Onboarding flow calls `auth.api.createOrganization()` directly in addition to the existing hook
- Storefront URL is stored in a field that doesn't have a clear fallback if org creation fails
- No check for existing org before attempting creation

**Severity:** MODERATE — results in a broken onboarding state that requires manual recovery. Can-defer to Phase 20 if Phase 19 only stores URL in localStorage initially.

**Phase to address:** Phase 20 (auth handoff + org seeding with storefront context).

---

### Pitfall 8: Public Endpoints Absent from MeshContext Skip List

**What goes wrong:**
New pre-auth endpoints (e.g., `/api/onboarding/crawl`, `/api/onboarding/report/:id`) are added to the Hono router without updating `shouldSkipMeshContext()` in `apps/mesh/src/api/utils/paths.ts`. Every request to these routes attempts to create a `MeshContext`, which requires a valid session. Unauthenticated requests fail or slow down significantly because context creation resolves auth state from the database for every request.

**Why it happens:**
`shouldSkipMeshContext()` is a manual allowlist currently covering `/`, `/api/auth/*`, health, metrics, and static files. Adding a new public route category is easy to forget. The failure mode is subtle: the route may still work (MeshContext creation doesn't hard-fail on missing auth), but it adds unnecessary DB round-trips to every pre-auth request.

**How to avoid:**
- Add `/api/onboarding/` to `shouldSkipMeshContext()` immediately when creating the onboarding route group
- Alternatively, add a path prefix constant to `PATH_PREFIXES` in `paths.ts` for discoverability
- Add a comment in `app.ts` marking where public route groups must register their path prefix

**Warning signs:**
- Server logs show database queries on unauthenticated crawl requests
- `ContextFactory.create()` called for every public endpoint hit
- Response times on public endpoints are unexpectedly slow (>100ms when they should be <20ms)

**Severity:** LOW for correctness (won't break), MODERATE for performance. Fix it on day 1 when adding the route — costs nothing.

**Phase to address:** Phase 19 (route creation) — do it when adding the route.

---

### Pitfall 9: Crawl Timeouts Blocking the Request Lifecycle

**What goes wrong:**
The crawl handler `fetch()`es the storefront URL synchronously within the request. Slow sites (3–10 second response times are common for international storefronts) or unresponsive hosts (no TCP response at all — hangs for 30+ seconds) block the Hono request handler. With Bun's single-threaded event loop, a large number of concurrent hanging fetches can starve other requests.

**Why it happens:**
`fetch()` in Bun inherits the default system TCP timeout, which is long. Developers testing locally hit fast sites and never see this.

**How to avoid:**
- Add `AbortController` with a 5-second timeout to all outbound crawl fetches:
  ```typescript
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  ```
- Return a partial result (domain info only) if the fetch times out — don't return an error to the user
- Consider making the crawl async: accept the URL, return a job ID immediately, poll for results — this is the correct architecture for production but may be out of scope for a 6-hour sprint

**Warning signs:**
- No `AbortSignal` or `signal` parameter in crawl fetch calls
- Test suite only uses `localhost` or fast CDN URLs

**Severity:** BLOCKER for reliability. Without a timeout, a single slow site can hang the request indefinitely.

**Phase to address:** Phase 19 (crawl implementation) — Day 1 of sprint.

---

### Pitfall 10: Public Report Page Becoming an Abuse Vector

**What goes wrong:**
A shareable public report URL (`/report/:id`) that shows site performance data becomes:
- A **scraping tool**: competitors submit rival storefronts and collect diagnostic data at scale using the API
- **SEO spam**: bots create thousands of report pages to generate backlinks or indexed content
- A **liability surface**: the report shows data about a site the report-viewer doesn't own ("Your site has 47 broken links" displayed to someone who didn't request it could be legally sensitive in some jurisdictions)

**Why it happens:**
The report feels harmless because it only shows public data — but the aggregation and presentation creates new risks the source data doesn't have individually.

**How to avoid:**
- Rate limit report generation: per-IP, per-session (using a fingerprint cookie), not just per-auth
- Set `noindex` meta tag on all public report pages — you don't want these crawled by search engines
- Add a `robots.txt` rule disallowing `/report/`
- Expire report data: delete report records after 24 hours
- Do not expose the raw crawl data via API — only the processed summary
- If report IDs are sequential integers, use UUIDs to prevent enumeration

**Warning signs:**
- Report IDs are guessable (sequential or short)
- No rate limiting on report generation endpoint
- Report pages do not have `noindex` meta tag
- Report data is indefinitely persisted

**Severity:** MODERATE — not a day-1 blocker for a sprint, but must be addressed before any public launch.

**Phase to address:** Phase 21 (public report page) — implement rate limiting and noindex at the same time as the page.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Synchronous crawl in request handler | Simple implementation | Blocks Hono event loop on slow sites | Never — add AbortController timeout always |
| No PageSpeed cache | Zero infra overhead | Hits undocumented per-origin rate limit fast | Only in initial local testing |
| Store pre-auth state only in localStorage | No backend changes needed | State lost if user clears browser or switches device | Acceptable for 6-hour sprint, must fix for production |
| Pass raw crawled HTML to LLM | Simple prompt | Cloudflare challenge HTML, scripts, ads poisoning context | Never — always sanitize HTML first |
| Skip `noindex` on report pages | One less line of code | Report pages indexed, scraped, becomes abuse vector | Never — one meta tag costs nothing |
| No SSRF validation on crawl URL | Faster to build | Critical security vulnerability | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| PageSpeed Insights API | Trust published rate limits (25k/day, 240/min) | Assume ~1 req/sec sustained; cache all results 24h; handle 500s with backoff |
| PageSpeed Insights API | No API key in development | Always use an API key — keyless requests share global quota across all users |
| Better Auth post-login redirect | Assume Better Auth preserves pre-auth URL | Explicitly encode `?callbackUrl=` before redirecting to login |
| Better Auth org creation hook | Add second org creation path in onboarding | Use existing `seedOrgDb` hook; only write storefront metadata post-creation |
| Hono MeshContext middleware | Add public route, forget to update `shouldSkipMeshContext` | Update `paths.ts` in the same commit as adding the route |
| outbound `fetch()` | No timeout | Always wrap with `AbortController`, 5-second limit |
| LLM context generation | Pass full HTML including scripts/nav/ads | Sanitize to `<main>`, `<h1>`, `<meta>`, OG tags only |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No crawl result cache | Every diagnostic re-crawls the same URL | Cache by normalized URL, 24h TTL | 10+ concurrent users testing the same site |
| Synchronous PageSpeed + crawl in one request | 5–15 second response times | Return crawl data immediately; load PageSpeed score async/separately | First demo with a real slow site |
| Full HTML passed to LLM | High token costs, slow generation, hallucination from noise | Strip to signal-only elements before prompt | Every request with a content-heavy site |
| Sequential crawl → AI → store | Entire pipeline in one long transaction | Treat as pipeline stages; return partial results as each stage completes | User with a 10-second loading spinner |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| No SSRF validation on crawl URL | Attacker reads internal metadata services or internal APIs | Validate IP against private ranges after DNS resolution; block non-HTTP schemes |
| Public crawl endpoint with no rate limiting | Attacker uses your server as a free proxy/scanner | IP-based rate limit on crawl endpoint even before auth; 5 req/min per IP |
| Report IDs are sequential or short | Report enumeration — anyone can read all diagnostic reports | Use UUIDs for all report IDs |
| Crawled content stored without sanitization | Stored XSS if crawled HTML is ever rendered | Sanitize all crawled content; never render raw HTML from third-party sites |
| CORS config returns any origin (`return origin`) | Cross-site requests from attacker-controlled pages | Tighten CORS for onboarding endpoints to known origins; the current app.ts CORS config has a TODO flagging this |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Blocking spinner during crawl | User has no feedback for 5–15 seconds, thinks it's broken | Show progressive states: "Fetching site..." → "Analyzing..." → "Generating report..." |
| Gating all report content behind login | User doesn't know if the tool has anything useful before signing up | Show at least 3 concrete data points pre-login; gate advanced data + agent recommendations |
| Generic AI context users can't edit | Users see wrong data about their own business and lose trust | Show generated context with edit affordances before persisting |
| Too many steps before value | 50%+ drop-off at each additional step | Maximum 2 clicks from URL entry to seeing real data; login is step 3 |
| Loading spinner with no time estimate | Users abandon after ~8 seconds of unknown wait | Show "This usually takes 10 seconds" or use a deterministic progress bar |
| Error states that say "Something went wrong" | User doesn't know if it's their URL or the system | Specific errors: "This site blocked our crawler", "Couldn't reach this URL", "Site uses JavaScript-only rendering" |

---

## "Looks Done But Isn't" Checklist

- [ ] **Crawl endpoint:** Has SSRF validation — verify by submitting `http://169.254.169.254/` and confirming it's blocked
- [ ] **Crawl endpoint:** Has per-IP rate limiting — verify by submitting 10 requests in 10 seconds from same IP
- [ ] **Crawl timeout:** Has AbortController with ≤5s timeout — verify by submitting a URL that doesn't respond
- [ ] **PageSpeed cache:** Results cached by URL — verify same URL submitted twice only calls Google API once
- [ ] **Pre-auth state:** Storefront URL survives login redirect — verify end-to-end: enter URL → click login → complete signup → confirm URL still present
- [ ] **SPA detection:** Empty HTML handled gracefully — verify with `https://shopify.com` (JS-rendered, sparse server HTML)
- [ ] **WAF detection:** Cloudflare challenge HTML not passed to AI — verify response body check catches "Just a moment" HTML
- [ ] **Report pages:** Have `noindex` meta tag — verify with `curl -s /report/test-id | grep noindex`
- [ ] **Report IDs:** Are UUIDs, not sequential — verify by creating 2 reports and checking ID format
- [ ] **AI context:** Shows edit affordance to user — verify UI includes correction mechanism before context is persisted
- [ ] **MeshContext skip:** Public routes added to `shouldSkipMeshContext()` — verify no DB queries in server logs for unauthenticated requests

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SSRF exploit discovered post-launch | HIGH | Take endpoint offline, audit logs for exploit attempts, add IP validation, re-deploy |
| PageSpeed rate limit hit mid-demo | LOW | Return cached or degraded data, add cache layer, continue without score |
| Pre-auth state lost on login | MEDIUM | Add URL re-entry step post-login with pre-fill from URL params; implement proper handoff |
| AI hallucination caught by user | LOW | Add edit affordance immediately; add "report inaccuracy" button |
| Race condition on org creation | MEDIUM | Add idempotency check; query for existing org before creating; fix hook ordering |
| Report page indexed by Google | LOW | Add noindex + canonical; submit removal request to Search Console |

---

## Pitfall-to-Phase Mapping

| Pitfall | Severity | Prevention Phase | Verification |
|---------|----------|------------------|--------------|
| SSRF via crawl endpoint | BLOCKER | Phase 19 | Submit `http://169.254.169.254/` — must get 400 |
| PageSpeed undocumented rate limit | BLOCKER/defer | Phase 19 | Same URL submitted twice — only 1 API call in logs |
| Pre-auth state lost on login redirect | BLOCKER | Phase 19/20 boundary | Full funnel test: URL → login → confirm URL present |
| SPA empty HTML | HIGH/defer | Phase 19 | Test with Shopify URL — graceful "limited data" state |
| WAF blocking crawl | MODERATE | Phase 19 | Test with Cloudflare-protected site |
| AI hallucination | HIGH | Phase 20 | Verify edit affordances; test with sparse HTML |
| Org creation race condition | MODERATE | Phase 20 | Review hook vs. onboarding flow — no double writes |
| MeshContext skip missing | LOW-MODERATE | Phase 19 | Audit server logs for public endpoint DB queries |
| Crawl timeout | BLOCKER | Phase 19 | Test with non-responsive host — must timeout in ≤5s |
| Public report abuse | MODERATE | Phase 21 | Verify noindex, UUID IDs, rate limit on report generation |

---

## Sources

- Codebase: `apps/mesh/src/api/app.ts` — CORS config, middleware ordering, MeshContext injection pattern
- Codebase: `apps/mesh/src/api/utils/paths.ts` — `shouldSkipMeshContext()` allowlist
- Codebase: `apps/mesh/src/auth/index.ts` — `databaseHooks.user.create.after` org creation hook
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — IP allowlist/blocklist strategy
- [PageSpeed Insights API — Undocumented Rate Limit (bjb.dev)](https://bjb.dev/log/20221009-pagespeed-api/) — per-origin 450–500 request ceiling, 1 req/sec sustainable
- [PageSpeed Insights API Overview (DebugBear)](https://www.debugbear.com/blog/pagespeed-insights-api) — 25k/day, 240/4min published limits; CrUX data deprecation
- [Web Scraping Challenges 2025 (ScrapingBee)](https://www.scrapingbee.com/blog/web-scraping-challenges/) — WAF fingerprinting, SPA rendering issues
- [LLM Hallucinations 2025 (Lakera)](https://www.lakera.ai/blog/guide-to-hallucinations-in-large-language-models) — extrinsic hallucination, grounding strategies
- [Securing Public APIs 2025 (CyberSierra)](https://cybersierra.co/blog/secure-public-apis-2025/) — rate limiting pre-auth endpoints
- [Auth0: User Onboarding Strategies B2B SaaS](https://auth0.com/blog/user-onboarding-strategies-b2b-saas/) — pre-to-post-auth state handoff patterns
- [Onboarding Funnel Optimization (RevenueCat)](https://www.revenuecat.com/blog/growth/fix-onboarding-funnels/) — conversion killers, drop-off points

---
*Pitfalls research for: Storefront onboarding on MCP Mesh (v1.4 milestone)*
*Researched: 2026-02-25*
