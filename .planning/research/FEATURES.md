# Feature Landscape

**Domain:** Storefront onboarding diagnostic and guided setup — e-commerce vertical
**Researched:** 2026-02-25
**Milestone:** v1.4 — Storefront Onboarding (subsequent milestone on MCP Mesh)

---

## Context: What We Are Building

User flow: enter storefront URL (pre-auth) → instant diagnostic report → login gate → chat interview → agent recommendations → connection setup.

The "wow" moment is delivering diagnostic data that feels like an agency did their homework before the first meeting. The model reference is PageSpeed Insights (free, public, instant, share a link), not a sign-up-first SaaS.

**Existing Mesh infrastructure this builds on:**
- `REPORTS_BINDING` and `mesh-plugin-reports` — section-based report rendering (metrics, criteria, markdown, table, ranked-list, note sections). Diagnostic output maps directly into this schema.
- `defineTool()` + `MeshContext` — diagnostic agents run as MCP tools with built-in tracing, validation, error handling.
- Decopilot chat with AI streaming — post-login interview reuses the existing chat pipeline.
- `agent_search` tool + Virtual MCP system — agent recommendations surface existing agents, connection wiring is already supported.
- Better Auth (OAuth 2.1, org creation) — login gate and org-from-email-domain pattern is supported.

---

## Table Stakes

Features users expect. Missing = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Mesh Dependency |
|---------|--------------|------------|-----------------|
| URL input field with validation | Entry point — every comparable tool (PageSpeed, GTmetrix) accepts a raw URL | Low | None — new public Hono route |
| Platform detection (Shopify/VTEX/other) | Users expect "you know what I'm running" — Wappalyzer and BuiltWith set this expectation | Low | New MCP tool: HTML crawl + header inspection |
| Core Web Vitals (LCP, INP, CLS) | Google made these the industry standard. Every Shopify agency talks in LCP. Not showing them = incomplete | Medium | Google PageSpeed Insights API (free, 25K/day w/ key) |
| Performance score (0-100) | Single number users can compare. PageSpeed Insights pattern. | Low | Derived from PageSpeed API response |
| Mobile vs desktop performance split | 60%+ of ecommerce traffic is mobile. Stores often only check desktop. This split is always surprising. | Low | PageSpeed API returns both in one call |
| SEO basics: title tag, meta description, Open Graph | Missing = users with any SEO awareness spot it immediately | Low | HTML crawl of homepage |
| HTTPS check | Security baseline. Any modern audit tool checks this. | Low | HTTP response header inspection |
| robots.txt / sitemap.xml presence | Basic crawlability signals. Agency audits always check this. | Low | Public URL fetch: `/robots.txt`, `/sitemap.xml` |
| Tech stack summary | Wappalyzer and BuiltWith have made "what is this site built with?" a commodity expectation | Low-Med | HTML source + HTTP headers (fingerprinting patterns) |
| Public shareable report URL | PageSpeed Insights, GTmetrix, Lighthouse all produce shareable links. Users want to forward to their developer. | Medium | New route: `/storefront-report/<domain>` — report stored, no auth required to view |
| Login gate after value delivery | Show value first, ask for credentials after. PageSpeed Insights doesn't require login. The gate triggers after the "wow". | Medium | Better Auth signup flow + org creation |

---

## Differentiators

Features that make this product feel different from a generic site audit tool.

| Feature | Value Proposition | Complexity | Mesh Dependency |
|---------|-------------------|------------|-----------------|
| AI company context extraction | LLM reads the About page, homepage copy, product categories, and writes a plain-English paragraph about what this store sells, who it targets, and what makes it special. The agency-did-their-homework moment. | Medium | New MCP tool: fetch + LLM summarization via decopilot |
| Schema markup detection (Product, Review, BreadcrumbList) | E-commerce specific SEO signal — whether the store uses structured data for rich results. Generic tools skip this. | Low-Med | HTML crawl + JSON-LD / microdata parser |
| Social proof signal detection | Detects presence of review widgets (Trustpilot, Judge.me, Yotpo script tags), star ratings in schema, and UGC signals. Trust = conversion. | Low-Med | HTML source fingerprinting (script tags, schema @type:AggregateRating) |
| Open Graph / social preview quality check | Shows how the store link preview looks on WhatsApp/Slack — most store owners don't know this is broken. Instant "I didn't know that" moment. | Low | og:image, og:title, og:description from HTML head |
| Checkout trust signals scan | Detects payment badge patterns (payment icons in footer HTML), SSL indicators, return policy mention. Ties to cart abandonment data. | Low-Med | HTML crawl of homepage footer patterns |
| Post-login goal interview (chat-based) | Guided conversational flow: "What's your biggest challenge right now? Traffic, conversions, retention?" Routes users to relevant agents. MyStoryBrand.com + Hotjar onboarding patterns. | Medium | Decopilot chat + streaming already exists. New system prompt for interview mode. |
| Agent recommendations from diagnostic + goals | After interview: "Based on your store's tech stack and your goal of improving conversions, here are 3 agents we recommend." Hiring metaphor — agents presented as specialists. | High | Extends `agent_search` with recommendation scoring; requires company context + goal data from interview |
| Connection setup driven by agent recommendations | Recommended agents list connections they need (VTEX, Google Analytics, etc.). User clicks "connect" from the recommendation card. | High | Virtual MCP system + connection wizard already exists; needs linking from recommendation flow |
| Diagnostic report stored as REPORTS_BINDING artifact | Report is not a one-time page render — it lives in the platform, viewable from Reports plugin after login. History over time. | Medium | REPORTS_BINDING schema fits perfectly: metrics (CWV scores), criteria (SEO checks), markdown (company context), note (recommendations) |

---

## Anti-Features

Features to explicitly NOT build in v1.4. These would bloat scope, require paid APIs, or solve problems users haven't expressed yet.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Competitor analysis | Requires SimilarWeb / Semrush API ($$$). Out of scope per PROJECT.md. Adds no "wow" for the login conversion goal. | Note it as a future premium feature; reference it in agent recommendations ("Competitor Intelligence agent coming soon") |
| Email nurture sequences | Out of scope per PROJECT.md. Adds marketing complexity not relevant to the diagnostic flow. | Focus on in-product funnel — get user to login, not into an email list |
| WhatsApp report sharing | Out of scope per PROJECT.md. Adds integration complexity. | Shareable URL handles sharing. User can paste link anywhere. |
| Full SEO keyword analysis | Requires Ahrefs/SEMrush/DataForSEO. No free public API exists for keyword data. | Surface what's detectable from HTML: title, meta, headings structure. Flag keyword analysis as a future agent. |
| Page-by-page audit (product pages, collection pages) | Homepage scan is sufficient for the "wow." Full crawl is slow, complex, and overkill for pre-auth. | Scan homepage only. Post-login agents can do deeper audits. |
| Real conversion rate / analytics data | Requires GA/VTEX access — zero-auth context can't get this. | Infer from structural signals (checkout link presence, cart URL pattern). Real data comes after connections are set up. |
| Multi-step wizard with 10+ questions | Research shows every extra minute lowers conversion 3%. Interview must feel like a conversation, not a form. | Max 5 questions in the interview. Open-ended chat, not a checkbox form. |
| WCAG accessibility audit | Complex, slow, requires headless browser rendering. Not what an e-commerce onboarding diagnostic is about. | Flag it as a separate audit type; the diagnostic plugin system can support it later |
| Paid API integrations (ReclameAqui, DataForSEO) | Explicitly out of scope per PROJECT.md. Cost and complexity. | Free/public data only for v1.4. Document which paid APIs unlock what. |

---

## Feature Dependencies

```
URL Input
  └─ Backend Diagnostic (runs all agents in parallel)
       ├─ HTML Crawl Agent
       │    ├─ Platform Detection
       │    ├─ Tech Stack Detection
       │    ├─ SEO Signals (title, meta, OG, schema)
       │    ├─ Social Proof Signals
       │    ├─ Checkout Trust Signals
       │    ├─ robots.txt / sitemap.xml check
       │    └─ Company Context Input (for LLM)
       ├─ PageSpeed Agent (calls Google PSI API)
       │    ├─ Core Web Vitals (LCP, INP, CLS)
       │    ├─ Performance Score
       │    └─ Mobile vs Desktop split
       └─ AI Context Agent (LLM call)
            └─ Company Context Paragraph (requires HTML crawl output)

Report Rendering (uses REPORTS_BINDING schema)
  └─ Public Shareable URL (/storefront-report/<domain>)
       └─ Login Gate (after initial report view)
            └─ Org Creation (from email domain — Better Auth)
                 └─ Report stored to REPORTS_BINDING artifact
                      └─ Post-Login Chat Interview (decopilot, interview system prompt)
                           └─ Company Context + Goals → Agent Recommendation Engine
                                └─ Agent Cards with Connection Setup CTAs
                                     └─ Connection Wizard (existing Mesh flow)
```

Critical sequential dependencies:
- HTML crawl must complete before AI context agent runs (context agent needs homepage text)
- All diagnostic agents should run in parallel; report renders when all resolve (or timeout with partial results)
- Login must precede report storage, interview, and agent recommendations
- Agent recommendations require both diagnostic context AND interview goals — neither alone is sufficient

---

## What Can Be Extracted from a URL with Zero Authentication

This is the foundation of the "wow moment." Everything here is legal and ethical — these are signals sent to any visitor.

| Signal Category | Specific Data Points | Detection Method | Confidence |
|-----------------|---------------------|------------------|------------|
| Platform / CMS | Shopify (myshopify.com variable in `<head>`, CDN patterns, `/checkout` URL), VTEX (vtex.com scripts), WooCommerce (wp-content paths), Magento (mage.js), BigCommerce | HTML source + HTTP headers | HIGH — well-documented fingerprints |
| Performance | LCP, INP, CLS, FCP, Speed Index, Total Blocking Time, Performance Score (0-100), mobile/desktop split | Google PageSpeed Insights API (free, 25K requests/day with key) | HIGH — same data as Lighthouse |
| SEO fundamentals | title tag content and length, meta description presence and length, canonical tag, Open Graph tags (og:title, og:image, og:description, og:url), Twitter card presence | HTML `<head>` parse | HIGH |
| Structured data | Product schema, AggregateRating (star ratings in SERPs), BreadcrumbList, Organization schema, JSON-LD blocks | HTML `<script type="application/ld+json">` parse | HIGH |
| Security | HTTPS enforcement, HSTS header, X-Frame-Options, Content-Security-Policy presence | HTTP response headers | HIGH |
| Crawlability | robots.txt exists and doesn't block Googlebot, sitemap.xml exists and is valid XML, noindex meta tag on homepage | Fetch /robots.txt, /sitemap.xml, HTML meta robots | HIGH |
| Social proof signals | Trustpilot script tag, Judge.me script, Yotpo script, AggregateRating schema present, review count in schema | HTML source script tag fingerprints + JSON-LD | MEDIUM — depends on how widgets load |
| Tech stack | Analytics (GA4, GTM, Hotjar, Klaviyo, Meta Pixel), CDN (Cloudflare headers, Fastly), payment (Stripe.js, PayPal), chat (Intercom, Zendesk, Gorgias), email (Klaviyo, Mailchimp forms) | HTML source + HTTP headers | HIGH for common tools |
| Open Graph / social preview | og:image URL and whether it exists (HTTP check), og:title quality, og:description quality | HTML `<head>` + HEAD request to og:image URL | HIGH |
| Company context | Store name, product categories from nav links, about page summary, brand voice (inferred from homepage copy) | HTML scrape of nav, hero, about link; LLM summarization | MEDIUM — LLM inference, not hard data |
| Checkout trust signals | Payment method icons in footer HTML (Visa/MC SVGs, PayPal badge), return policy link presence, security badge images | HTML source pattern matching | LOW-MEDIUM — many stores use CSS/external images |

**Key limitation:** Dynamic content rendered by JavaScript may not be visible to a simple HTML fetch. Tools like GTmetrix solve this with headless Chrome. For v1.4, use a lightweight fetch with basic JS execution (Bun supports this via `fetch`). Flag JS-rendered stores as "some signals may be incomplete."

---

## MVP Recommendation

The minimum that creates the "wow moment" for the login conversion goal:

**Must have for launch:**
1. URL input + validation (public landing page)
2. PageSpeed Agent — Core Web Vitals, Performance Score, mobile/desktop (single API call)
3. HTML Crawl Agent — platform detection, SEO basics (title, meta, OG), tech stack fingerprinting, schema detection
4. AI Context Agent — LLM summary of what the store sells and who it serves (one paragraph, uses homepage text)
5. Public shareable report page — rendered with REPORTS_BINDING section types: metrics (CWV), criteria (SEO checklist), markdown (company context), note (summary insight)
6. Login gate — shown after report, org creation from email domain
7. Post-login: report saved and visible in Reports plugin

**Minimum interview for agent recommendations:**
8. Chat interview with system prompt focused on 3 questions: biggest challenge, primary goal (traffic/conversions/retention), current toolset
9. Agent recommendation cards — 2-3 recommended agents with reason and "connect" CTA

**Defer to subsequent phases:**
- Social proof signals and checkout trust signals (clever but adds scraping complexity)
- robots.txt / sitemap.xml checks (adds 2 more HTTP requests per scan; high value but not MVP-critical)
- Full connection setup wizard driven by recommendations (existing flow works, just needs surfacing)

---

## Onboarding UX Patterns (What Makes Them Convert)

Research-validated patterns from HubSpot, Hotjar, Figma, Slack onboarding:

| Pattern | Evidence | Application to This Flow |
|---------|----------|--------------------------|
| Value before credentials | PageSpeed Insights: full report, no login | Show complete diagnostic before any login prompt |
| Single-number score | GTmetrix Grade, PageSpeed score, NPS — users anchor to one number | Show a "Storefront Health Score" at the top of report |
| Personalization via 3 questions | Figma (3 questions), Hotjar (1 goal question), Slack (name + company) — diminishing returns after 3 | Interview: 3 open chat questions max, not a 10-field form |
| Conversational intake over forms | 70-90% completion vs 10-30% for equivalent forms | Chat-based interview (decopilot already exists) beats a wizard |
| Celebration on completion | Asana unicorn, Wellfound acknowledgement — positive momentum | After agent recommendations saved: "You're set up. Here's your plan." confirmation state |
| Speed to first value | Every extra minute costs 3% conversion; target < 2 min to report | Diagnostic must complete in < 10 seconds (parallelize agents) |
| Specific, not generic insight | "Your LCP is 4.8s — 92% of Shopify stores load faster" beats "Your page is slow" | Use percentile framing, not just raw scores |

---

## Phase-Specific Notes for Roadmap

| Phase Topic | Feature Group | Complexity Notes |
|-------------|---------------|------------------|
| Public landing + URL input | Entry point | Low — new Hono route + React page, no auth |
| Backend diagnostic agents | HTML crawl + PSI + LLM | Medium — 3 parallel MCP tools. PSI API needs a key stored in env. LLM call needs decopilot or direct AI SDK call. Rate limiting on PSI API must be handled. |
| Report rendering + public URL | REPORTS_BINDING integration | Medium — REPORTS_BINDING schema already exists. Need: report storage (Kysely migration), public read endpoint (no auth), `ReportSection` mapping from diagnostic output |
| Login gate + org creation | Auth flow | Medium — Better Auth handles org creation; need to wire "continue to setup" post-report CTA into auth flow; org-from-email-domain is a Better Auth plugin capability |
| Chat interview | Decopilot integration | Low-Medium — Chat UI exists. Needs: specialized system prompt for interview mode, data persistence (goals stored to org context), interview completion signal |
| Agent recommendations | New recommendation logic | High — most novel piece. Needs: scoring/matching logic from diagnostic + goals, agent catalog (what agents exist and what they solve), recommendation storage. Agent search tool exists but selects, doesn't rank/recommend. |
| Connection setup from recommendations | Existing connection flow | Medium — connection wizard exists. Needs: surfacing from recommendation cards, pre-populating connection type from agent requirement |

---

## Sources

- [GTmetrix Report Guide](https://gtmetrix.com/blog/everything-you-need-to-know-about-the-new-gtmetrix-report-powered-by-lighthouse/) — Section structure, Performance/Structure score breakdown (HIGH confidence, official source)
- [Google PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started) — Free tier, 25K/day with key, Lighthouse 13 as of Oct 2025 (HIGH confidence, official)
- [Core Web Vitals 2025 Thresholds](https://uxify.com/blog/post/core-web-vitals) — LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 — Google thresholds (HIGH confidence)
- [Core Web Vitals Conversion Impact](https://websitespeedy.com/blog/how-do-core-web-vitals-impact-your-conversion-rates/) — 25% conversion increase moving Poor → Good (MEDIUM confidence, multiple sources agree)
- [How to Tell If a Website Uses Shopify](https://ecomm.design/how-to-tell-if-a-website-uses-shopify/) — Fingerprinting methods (HIGH confidence)
- [BuiltWith vs Wappalyzer](https://www.crft.studio/blog/crft-lookup-vs-builtwith-vs-wappalyzer) — What technology detection tools expose (MEDIUM confidence)
- [Wappalyzer Technology Lookup](https://www.wappalyzer.com/lookup/) — 6000+ technologies detected from HTML/headers (HIGH confidence, official)
- [Open Graph Protocol](https://ogp.me/) — og:title, og:image, og:url, og:description minimum set (HIGH confidence, official spec)
- [Product Schema for Ecommerce SEO](https://www.seoclarity.net/blog/product-schema-seo) — AggregateRating, Offers schema impact (MEDIUM confidence)
- [SaaS Onboarding Best Practices 2025](https://productled.com/blog/5-best-practices-for-better-saas-user-onboarding) — Aha moment timing, form friction, personalization (MEDIUM confidence, aggregated industry data)
- [Ecommerce Checkout UX 2025](https://baymard.com/blog/current-state-of-checkout-ux) — 70% abandonment, trust signals inline (HIGH confidence — Baymard Institute is primary source for checkout UX research)
- [Common Thread Ecommerce Diagnostic](https://commonthreadco.com/products/ecommerce-diagnostic) — Growth Quotient score approach, 10 metric model (MEDIUM confidence — product inspection)
- [Klazify Technology Stack Detection APIs 2025](https://www.klazify.com/blog/best-technology-stack-detection-from-url-apis-in-2025) — What's detectable from public HTTP (HIGH confidence)
- [Shopify AI Agents 2025](https://www.shopify.com/blog/ai-agents) — Agent hiring metaphor, store onboarding patterns (MEDIUM confidence — official Shopify blog)
- `packages/bindings/src/well-known/reports.ts` — REPORTS_BINDING schema (HIGH confidence — source of truth, read directly)
- `apps/mesh/src/api/routes/decopilot/built-in-tools/agent-search.ts` — agent_search tool (HIGH confidence — source of truth)
