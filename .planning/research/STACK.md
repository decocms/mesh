# Stack Research

**Domain:** Storefront onboarding diagnostic — public URL crawl, tech detection, performance audit, AI summarization
**Researched:** 2026-02-25
**Confidence:** MEDIUM (APIs verified via official docs; some library version specifics from npm search results)

---

## Context: What Already Exists (Do Not Re-add)

The following are present in `apps/mesh/package.json` and must NOT be duplicated:

| Existing | Covers |
|----------|--------|
| `hono ^4.10.7` | HTTP server, middleware, routing |
| `ai ^6.0.1` + `@ai-sdk/react ^3.0.1` | AI SDK — `generateText`, `streamText`, provider abstraction |
| `zod ^4.0.0` | Schema validation |
| `kysely ^0.28.8` | DB access |
| `better-auth` | Auth + session |
| `@decocms/bindings` | LLM binding via `createLLMProvider` / `LLM_DO_GENERATE` |

The onboarding diagnostic needs **zero overlap** with these. All additions below are net-new.

---

## Recommended Stack (New Additions Only)

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Native `fetch` (Bun built-in) | — | HTTP crawling of public storefront URLs | Bun's `fetch` is W3C-compliant and fast; no library needed for basic GET with headers/redirect-follow |
| `node-html-parser` | `^7.0.2` | Parse HTML response into a queryable DOM | Zero native-module dependencies; pure TS; 3-5x faster than cheerio for read-only traversal; Bun-compatible via `bun add` |
| Google PageSpeed Insights API v5 | REST (no npm pkg) | Lighthouse scores + CrUX field data per URL | Free tier: 25,000 req/day with key; returns LCP, CLS, INP, FCP, TTFB, Performance/SEO/Accessibility scores |
| Google CrUX API | REST (no npm pkg) | Real-user Core Web Vitals at origin-level | 150 req/min free; 28-day rolling window; more reliable than PSI for field data; returns p75 for LCP, CLS, INP, TTFB, FCP |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `p-limit` | `^6.2.0` | Concurrency control for outbound fetch calls | PSI API has an undocumented per-origin throttle; limit to 1 concurrent PSI call per analysis job to avoid 500 errors |
| `p-retry` | `^6.2.1` | Retry with exponential backoff | PSI returns 500 for ~5 min after sustained querying; retry up to 3 times with 2s base delay |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Google Cloud Console | API key provisioning | One key covers both PSI and CrUX APIs; restrict to these two APIs in Cloud Console for security |

---

## Integration Patterns

### 1. PageSpeed Insights API

No npm package needed. Call directly with `fetch`:

```typescript
// apps/mesh/src/api/routes/onboarding/psi.ts
const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export async function runPageSpeed(url: string, strategy: "mobile" | "desktop" = "mobile") {
  const params = new URLSearchParams({
    url,
    strategy,
    key: process.env.GOOGLE_PSI_API_KEY ?? "",
    category: ["performance", "seo", "accessibility"].join("&category="),
  });

  const res = await fetch(`${PSI_ENDPOINT}?${params}`);
  if (!res.ok) throw new Error(`PSI error ${res.status}`);
  return res.json();
}
```

**Response shape (relevant fields):**
```typescript
interface PSIResult {
  lighthouseResult: {
    categories: {
      performance: { score: number };    // 0–1
      seo: { score: number };
      accessibility: { score: number };
    };
    audits: {
      "largest-contentful-paint": { numericValue: number; displayValue: string };
      "cumulative-layout-shift": { numericValue: number };
      "total-blocking-time": { numericValue: number };
      "first-contentful-paint": { numericValue: number };
    };
  };
  loadingExperience: {
    // CrUX field data bundled into PSI (origin-level)
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: number; category: "FAST"|"AVERAGE"|"SLOW" };
      INTERACTION_TO_NEXT_PAINT: { percentile: number; category: string };
    };
    overall_category: "FAST" | "AVERAGE" | "SLOW" | "NONE";
  };
}
```

**Rate limits (verified):**
- Published: 25,000/day, 240/4-min window per key
- Undocumented: per-origin throttle kicks in after ~450–500 rapid requests to the same origin, causing 500 errors for ~5 min
- For onboarding (1 URL per user): not a concern. Use `p-retry` as a safety net.
- Without a key: severely throttled (undocumented, very low); always use a key

### 2. CrUX API

Provides cleaner real-user data than PSI's `loadingExperience`. Use CrUX when you want pure field data without running Lighthouse:

```typescript
const CRUX_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";

export async function queryCrux(url: string) {
  const res = await fetch(`${CRUX_ENDPOINT}?key=${process.env.GOOGLE_PSI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: new URL(url).origin,   // query at origin level for better data coverage
      formFactor: "PHONE",           // matches majority of e-commerce traffic
      metrics: ["largest_contentful_paint", "cumulative_layout_shift",
                 "interaction_to_next_paint", "first_contentful_paint",
                 "time_to_first_byte"],
    }),
  });
  if (res.status === 404) return null; // origin has no CrUX data (low traffic)
  if (!res.ok) throw new Error(`CrUX error ${res.status}`);
  return res.json();
}
```

**Rate:** 150 req/min free, cannot be increased. Data updates daily at 04:00 UTC (28-day rolling window).

**Same API key** as PSI — one Google Cloud project key covers both.

### 3. HTML Crawling and Tech Detection

Use `node-html-parser` over cheerio because:
- No native bindings (cheerio v1 uses `parse5` which is fine, but `node-html-parser` is lighter)
- Read-only traversal (all we need for detection) is 3-5x faster
- Zero WASM, zero native modules — essential for Bun bundling compatibility

```typescript
import { parse } from "node-html-parser";

export async function crawlStorefront(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MeshBot/1.0)" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),   // 15s max
  });
  const html = await res.text();
  const root = parse(html);
  return { html, root, finalUrl: res.url, headers: res.headers };
}
```

**Do NOT** use a headless browser (Playwright/Puppeteer). The public storefront HTML source is sufficient for platform detection. Headless adds 200+ MB of binary dependencies and is overkill for static fingerprinting.

### 4. Tech Stack Detection (Custom, No Library)

Do NOT use `wappalyzer-core` — it is **unmaintained** (last publish 2+ years ago, officially deprecated in favor of paid API). Build a small detection module instead. The patterns are stable and the platform list is narrow (VTEX, Shopify, Magento, LGPD/analytics tooling):

```typescript
// apps/mesh/src/api/routes/onboarding/tech-detector.ts
import type { HTMLElement } from "node-html-parser";

export interface DetectionResult {
  platform: "vtex" | "shopify" | "magento" | "woocommerce" | "lgcomerce" | "nuvemshop" | "unknown";
  gtm: boolean;
  ga4: boolean;
  fbPixel: boolean;
  confidence: "high" | "medium" | "low";
  signals: string[];
}

const SIGNALS = {
  vtex: {
    html: [/__RUNTIME__/, /vtex\.com/, /vteximg\.com\.br/, /io\.vtex\.com/],
    scripts: [/vtex\.js/, /checkout\.vtex\.com/],
  },
  shopify: {
    html: [/cdn\.shopify\.com/, /Shopify\.theme/, /shopify-section/],
    scripts: [/shopify\.com\/s\/files/],
  },
  magento: {
    html: [/Mage\.Cookies/, /mage\/cookies/, /FORM_KEY/, /requirejs\/require\.js/],
    meta: [/generator.*Magento/i],
  },
  woocommerce: {
    html: [/woocommerce/, /wp-content\/plugins\/woocommerce/],
    scripts: [/wc-block/],
  },
  nuvemshop: {
    html: [/d26lpennugtm8s\.cloudfront\.net/, /nuvemshop\.com\.br/],
  },
};

export function detectPlatform(html: string, root: HTMLElement): DetectionResult {
  const signals: string[] = [];
  // ... iterate SIGNALS, check html/root.querySelectorAll("script"), collect signals
  // return highest-confidence match
}
```

**Patterns are HIGH confidence** — they target unique CDN domains and global variable names that don't change without major platform rewrites.

GTM/GA4 detection pattern:
```typescript
const gtm = /GTM-[A-Z0-9]+/.test(html);
const ga4 = /G-[A-Z0-9]+/.test(html) || /gtag\('config'/.test(html);
const fbPixel = /fbq\('init'/.test(html);
```

### 5. AI-Powered Company Context Summarization

The codebase already has `ai ^6.0.1` and `createLLMProvider` that wraps the AI SDK over LLM bindings. Use `generateText` from the AI SDK directly — it works with any provider registered in the mesh.

The onboarding route is pre-auth, so it cannot use `MeshContext` (which requires a session). Use a **server-side singleton provider** configured from env vars:

```typescript
// apps/mesh/src/api/routes/onboarding/summarizer.ts
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";   // already pulled in via ai package

const provider = createOpenAI({ apiKey: process.env.ONBOARDING_LLM_API_KEY });

export async function buildCompanyContext(crawledData: {
  url: string;
  title: string;
  description: string;
  detectedPlatform: string;
  psiScore: number;
}) {
  const { text } = await generateText({
    model: provider("gpt-4o-mini"),
    system: "You are an e-commerce analyst. Summarize a storefront's context concisely for an onboarding report.",
    prompt: `URL: ${crawledData.url}\nTitle: ${crawledData.title}\nPlatform: ${crawledData.detectedPlatform}\nPerformance: ${crawledData.psiScore}/100\nMeta: ${crawledData.description}`,
    maxTokens: 300,
  });
  return text;
}
```

`@ai-sdk/openai` is not explicitly listed in package.json but is pulled in transitively via `ai`. Confirm with `bun pm ls | grep @ai-sdk/openai` — if absent, add it explicitly.

**Alternative:** Use the mesh's own LLM binding via `MeshContext` by making the summarization call from a post-auth step instead. This is cleaner architecturally because it routes through the user's configured LLM connection rather than a hardcoded key.

### 6. Public Pre-Auth Routes in Hono

The existing `app.ts` already has the pattern (see `/api/config` and health check). Follow the same approach: mount the onboarding route **before** the `MeshContext` injection middleware, which itself calls `shouldSkipMeshContext()`:

```typescript
// apps/mesh/src/api/utils/paths.ts — add to SYSTEM_PATHS or shouldSkipMeshContext
export const shouldSkipMeshContext = (path: string): boolean => {
  return (
    path.startsWith("/api/auth") ||
    path.startsWith("/api/config") ||
    path.startsWith("/api/onboarding") ||  // ADD THIS
    path === SYSTEM_PATHS.HEALTH ||
    path === SYSTEM_PATHS.METRICS
  );
};
```

Then in `app.ts`, mount before the MeshContext middleware block:

```typescript
// In createApp(), before the MeshContext injection section
import onboardingRoutes from "./routes/onboarding";
app.route("/api/onboarding", onboardingRoutes);
```

The `except()` combinator from `hono/combine` is an option but is not needed here — the project already uses the `shouldSkipMeshContext` path-check pattern which is more explicit and consistent with the existing codebase.

**Auth wall placement:** The `/api/onboarding/analyze` endpoint (URL + crawl + PSI + AI summary) is public. The result is stored server-side with a session token returned in the response. After login, `/api/onboarding/result/:sessionToken` retrieves the cached result and gates further steps. This avoids re-running expensive external API calls post-login.

---

## Installation

```bash
# New dependencies only — add to apps/mesh/
bun add --cwd apps/mesh node-html-parser p-limit p-retry

# If @ai-sdk/openai is not already transitively available:
bun add --cwd apps/mesh @ai-sdk/openai
```

**No new dev dependencies needed.** All tooling (TypeScript, Biome, Bun test) is already present.

---

## Alternatives Considered

| Recommended | Alternative | Why Alternative Loses |
|-------------|-------------|----------------------|
| `node-html-parser ^7.0.2` | `cheerio ^1.2.0` | Cheerio is fine but heavier; uses parse5 internally; jQuery-like API is more feature-rich than needed for read-only detection scraping |
| `node-html-parser` | `linkedom` | linkedom is faster for mutations but overkill; has occasional compatibility edge cases on malformed HTML common in production storefronts |
| Native `fetch` | `got`, `axios`, `ky` | Bun's built-in fetch handles redirects, timeouts via AbortSignal, and custom headers; no extra dependency justified |
| Custom detection | `wappalyzer-core` | Unmaintained (2+ years since last publish), officially deprecated by vendor; tech list is stale and doesn't cover VTEX/Nuvemshop well |
| PSI API REST | `lighthouse` npm | Running Lighthouse locally in Bun is unsupported (requires Chrome); PSI is the correct server-side approach |
| `generateText` (AI SDK) | custom LLM fetch | AI SDK is already present; using it maintains provider abstraction and retains compatibility with the mesh's LLM binding system |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `wappalyzer-core` | Unmaintained, no VTEX/Nuvemshop fingerprints, vendor deprecated in favor of paid API | Custom detector with 50-line regex map |
| `lighthouse` npm package | Requires Chrome binary; not supported in Bun server context; 200+ MB | PageSpeed Insights API (REST) |
| `puppeteer` / `playwright` | Binary deps incompatible with Bun server bundle; unnecessary since storefront HTML detection works on raw HTML source | `fetch` + `node-html-parser` |
| `jsdom` | Slow (15s for large DOMs vs 230ms linkedom); pulls in C++ bindings incompatible with Bun worker threads | `node-html-parser` |
| `cheerio` (as the primary choice) | Fine library but heavier than needed; `node-html-parser` suffices for read-only detection | `node-html-parser` |
| Anonymous PSI requests (no API key) | Undocumented, very low rate limit — will throttle immediately at production load | Always use a Google API key |

---

## Stack Patterns by Variant

**If the org has an LLM connection configured in mesh:**
- Route summarization through `MeshContext` via the LLM binding post-login
- Avoids a hardcoded `ONBOARDING_LLM_API_KEY` env var
- Use this path for the post-auth "AI interview" phase

**If the org has no configured LLM (pre-auth diagnostic only):**
- Use a shared `ONBOARDING_LLM_API_KEY` (OpenAI) for the public summarization step
- Gate behind a feature flag or simply omit the AI summary if key is absent (degrade gracefully)

**If CrUX has no data for the URL (low-traffic store):**
- `CrUX API returns 404` — this is normal for small storefronts
- Fall back to PSI's bundled `loadingExperience.overall_category` field
- Display "Limited real-user data available" in the diagnostic UI

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `node-html-parser ^7.0.2` | Bun 1.x, TypeScript 5.9+ | Pure TypeScript, no native bindings; confirmed installable via `bun add` |
| `p-limit ^6.2.0` | ESM-only; requires `"type": "module"` | apps/mesh is already `"type": "module"` — compatible |
| `p-retry ^6.2.1` | ESM-only | Same — compatible with existing module setup |
| `@ai-sdk/openai` | `ai ^6.0.1` (already in package.json) | Must match major version of `ai` package; both at v6 |

---

## Environment Variables Required

```bash
# Google Cloud API key — covers both PSI and CrUX APIs
GOOGLE_PSI_API_KEY=AIza...

# Optional: dedicated LLM key for pre-auth summarization
# If absent, skip AI summary gracefully
ONBOARDING_LLM_API_KEY=sk-...
```

---

## Sources

- [PageSpeed Insights API v5 — Get Started](https://developers.google.com/speed/docs/insights/v5/get-started) — rate limits, auth, response schema (MEDIUM confidence — official docs but rate limit specifics partially undocumented)
- [PSI Secret Rate Limit](https://bjb.dev/log/20221009-pagespeed-api/) — undocumented per-origin throttle behavior (LOW confidence — single author post from 2022, but matches community reports)
- [CrUX API — Chrome for Developers](https://developer.chrome.com/docs/crux/api) — endpoint, metrics, 150 req/min free (HIGH confidence — official Google documentation)
- [Cheerio GitHub](https://github.com/cheeriojs/cheerio) — v1.2.0 current stable, Bun compatible (MEDIUM confidence — GitHub releases page)
- [node-html-parser npm](https://www.npmjs.com/package/node-html-parser) — v7.0.2 current, Bun installable (MEDIUM confidence — npm search result)
- [wappalyzer-core npm](https://www.npmjs.com/package/wappalyzer-core) — deprecated, last published 2+ years ago (HIGH confidence — npm page + vendor announcement)
- [AI SDK generateText](https://ai-sdk.dev/docs/ai-sdk-core/generating-text) — non-streaming server-side usage (HIGH confidence — official Vercel AI SDK docs)
- [Hono Combine Middleware — except()](https://hono.dev/docs/middleware/builtin/combine) — route exclusion pattern (HIGH confidence — official Hono docs)
- [Better Auth + Hono integration](https://www.better-auth.com/docs/integrations/hono) — auth handler mounting pattern (HIGH confidence — official Better Auth docs)
- `apps/mesh/src/api/app.ts` — existing `shouldSkipMeshContext` pattern for public routes (HIGH confidence — source code)
- `apps/mesh/package.json` — existing dependencies inventory (HIGH confidence — source code)

---
*Stack research for: Storefront onboarding diagnostic (MCP Mesh milestone)*
*Researched: 2026-02-25*
