# Technology Stack

**Project:** Stack-Agnostic CMS (Mesh Plugin)
**Researched:** 2026-02-14
**Updated for v1.1 Polish:** 2026-02-15

## Recommended Stack

The CMS plugin lives inside the existing Mesh monorepo. Every choice below prioritizes compatibility with the Mesh platform stack (Bun + Hono + Vite 7 + React 19 + Kysely + Zod 4) and reuses existing patterns where possible. Content configuration lives in git (`.deco/` directory) accessed via deconfig MCP tools; synced loader data lives in immutable storage (local FS for dev, S3-compatible for prod).

### 1. Codebase Analysis (TS-to-Schema Pipeline)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **ts-json-schema-generator** | ^2.5.0 | Extract TS types to JSON Schema | Already used in Mesh (`@decocms/runtime/scripts/generate-json-schema.ts`). Uses AST (not type hierarchy) so it handles aliases, generics, mapped types better than alternatives. Directly produces JSON Schema from arbitrary TS types without requiring Zod wrappers. | HIGH |
| **ts-morph** | ^27.0.2 | Navigate/query TS AST to find React component exports and their prop types | The standard TS Compiler API wrapper. Needed to walk a codebase, find exported components, resolve their prop type names, then feed those type paths to `ts-json-schema-generator`. | HIGH |
| **@rjsf/core + @rjsf/shadcn** | ^6.1.2 | Render JSON Schema as editable forms | Already used in Mesh for MCP tool configuration forms (`rjsf-templates.tsx`, `rjsf-widgets.tsx`). Provides a direct path from JSON Schema to editable UI with zero custom form code per component. | HIGH |
| **zod-from-json-schema** | ^0.5.2 | Convert JSON Schema to Zod for runtime validation | Already in Mesh. Validates user-edited prop data before persisting to `.deco/`. | HIGH |

**Pipeline:** `ts-morph` (find components + prop types) -> `ts-json-schema-generator` (type -> JSON Schema) -> store in `.deco/blocks/*.json` -> `@rjsf` (schema -> editable form) -> `zod-from-json-schema` (schema -> runtime validator)

**Why NOT `extract-react-types`:** Last updated 3+ years ago (v0.30.3), Atlassian project, not actively maintained. `ts-morph` + `ts-json-schema-generator` is the same approach but with current, maintained libraries already in the codebase.

**Why NOT a Zod-first approach (require devs to write Zod schemas):** Defeats "stack-agnostic" goal. Users have plain TS types -- we analyze what exists, not prescribe what they must write.

### 2. Push-Based Data Sync

The sync layer is NOT a full database replication system. It is simpler: loaders execute on a schedule (via Mesh event bus cron), fetch from upstream APIs, and write results to immutable versioned storage. Sites read from storage, never from upstream APIs at render time.

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Mesh Event Bus** | (built-in) | Schedule and trigger loader sync | Already in Mesh. Supports cron expressions, at-least-once delivery, exponential backoff. The workflows plugin already demonstrates this pattern. Zero new dependencies. | HIGH |
| **Deconfig MCP tools** | (built-in) | Read/write synced data in dev mode | Already in Mesh. `READ_FILE`/`PUT_FILE` for `.deco/data/` directory. Git-backed, branch-aware, SSE file watching for live updates. | HIGH |
| **S3-compatible storage (R2)** | - | Immutable content storage in production | Zero egress fees, S3-compatible API, native Workers integration. Store published loader results as immutable JSON blobs: `{site}/data/{loader}/{version}.json` with a `latest` pointer. | MEDIUM |
| **Hono SSE streaming** | (built-in to hono ^4.10.7) | Real-time sync status updates to editor | Already in Mesh stack. `streamSSE` helper sets correct headers, supports Bun natively. Use for loader sync progress and editor preview updates. | HIGH |

**Sync Architecture:**

```
Cron event fires -> Event bus triggers loader sync
  -> CMS Server Plugin calls site MCP tool to execute loader function
  -> Loader fetches from upstream API (VTEX, Shopify, etc.)
  -> Result written to immutable storage:
     Dev:  .deco/data/{loader-hash}/{version}.json (via deconfig PUT_FILE)
     Prod: s3://bucket/.deco/data/{loader-hash}/{version}.json
  -> Pointer updated: .deco/data/{loader-hash}/latest -> {version}
  -> Site reads from latest pointer (always fast, always available)
```

**Why event-bus-driven sync over Electric SQL:** The initial sync model is simpler than database replication -- it is cron-triggered ETL (extract from API, transform, load to storage). This aligns with the architecture decision to use git-based `.deco/` storage for content config. Electric SQL (v1.5.4) is excellent for Postgres-to-client sync but adds infrastructure complexity (requires a running Electric sync service alongside Postgres). Consider Electric for Phase 4+ if real-time collaborative editing or multi-device sync becomes a requirement.

**Why NOT Durable Streams:** v0.1.0 (Dec 2025) is too early. It is the lower-level primitive that Electric is built on. Monitor for future use.

**Why NOT LiveStore/CRDT:** Overkill for CMS content that has single-writer semantics. The sync layer is a scheduled job, not a distributed state machine.

**Why immutable versioned storage:** Each sync produces a new version file. Pointer updated atomically. No data corruption from partial writes. Rollback is trivial (point to previous version). Storage cost managed by retention policies (keep last N versions).

### 3. Content Configuration Storage

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Deconfig (git-backed)** | (built-in) | Store page compositions, block definitions, loader configs | Git = version history, branching, PR review, no vendor lock-in. Deconfig MCP tools (READ_FILE, PUT_FILE, LIST_FILES) abstract git operations. Already used by deco runtime and CLI. | HIGH |
| **Kysely + Postgres** | ^0.28.8 | Store operational metadata (sync state, scan progress, site connections) | Already in Mesh. Use for data that does NOT belong in git: sync timestamps, error logs, scan status, site-level settings. | HIGH |

**What goes in git (`.deco/`):** Page compositions, block definitions (JSON Schema), loader configurations, synced data (dev mode), site config.

**What goes in Postgres:** Sync state (last run, status, errors), scan progress, site connection metadata (repo URL, branch), ephemeral editor state.

**Why NOT all-Postgres:** Content must be version-controlled, branch-aware, and diffable. Git provides this natively. Postgres does not.

**Why NOT all-git:** Operational state (sync status, scan progress) changes frequently and does not need version history or branch isolation. Git is not a good fit for high-frequency writes.

### 4. Site Rendering (Default Template)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **React** | ^19.2.0 | UI framework for default template | Same as Mesh. React Compiler support, Suspense for async data. | HIGH |
| **Vite** | ^7.2.1 | Build tool | Same as Mesh. Fast HMR, native TS support, plugin ecosystem. | HIGH |
| **React Router** | ^7.x (framework mode) | Routing + SSG prerender | Built-in `prerender` config in `react-router.config.ts`. Supports boolean (all static), array (specific paths), or async function (dynamic paths from CMS). `ssr: false` for pure SSG. | HIGH |
| **TailwindCSS** | ^4.1.x | Styling for default template | Same as Mesh. v4 with Vite plugin (`@tailwindcss/vite`). | HIGH |

**React Router 7 SSG Configuration:**

```typescript
// react-router.config.ts
export default {
  ssr: false, // SPA/SSG only, no runtime server
  prerender: async ({ getStaticPaths }) => {
    // Fetch page routes from CMS .deco/pages/ at build time
    const pages = await loadDecoPages();
    return [...getStaticPaths(), ...pages.map(p => p.path)];
  },
};
```

**Why React Router 7 over Vike:** React Router 7's framework mode has native prerender/SSG support, is the official React routing solution. Vike (v0.4.x) adds another abstraction layer. React Router is more likely to stay maintained long-term.

**Why NOT Next.js as default template:** The CMS is stack-agnostic -- it works WITH Next.js sites, but the default template should not BE Next.js. Next.js brings Vercel opinions about deployment, server components as default, and complex build infrastructure. React + Vite + React Router is lighter, deploys anywhere, and matches Mesh's stack.

**Why NOT vite-react-ssg:** v0.9.0 works but is a community plugin for React Router v6. React Router 7 has first-party SSG, making the plugin redundant.

### 5. Visual Editor (Iframe + PostMessage)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Custom postMessage protocol** | - | Editor <-> preview communication | No library needed. Define a typed message protocol using discriminated unions. Sanity, DatoCMS, Payload, dotCMS all use this pattern -- it is the industry standard. | HIGH |
| **Zod runtime validation** | ^4.0.0 | Validate postMessage protocol at runtime | Already in Mesh. Add `safeParse()` validation to discriminated union message types for production robustness. Catches malformed messages from HMR, third-party scripts, or browser extensions. | HIGH |
| **Data attributes** (`data-block-id`, `data-block-type`) | - | Mark editable regions in preview | Inject `data-block-id` attributes on rendered components. Editor overlay scans for these to render click targets. Same approach as Sanity's `@sanity/visual-editing` and DatoCMS overlays. | HIGH |
| **@floating-ui/react** | ^0.27.16 | Position editor overlay tooltips/menus | Already in Mesh. Use for block selection UI, inline toolbars. | HIGH |
| **MutationObserver** | (Web API) | Detect DOM changes in preview iframe | Rendering-mode agnostic detection of when components mount/unmount. Works with SPA, SSG, and SSR without framework-specific lifecycle hooks. | HIGH |

**PostMessage Protocol Types:**

```typescript
type EditorToSite =
  | { type: "deco:page-config"; page: PageConfig }
  | { type: "deco:update-block"; blockId: string; props: Record<string, unknown> }
  | { type: "deco:select-block"; blockId: string }
  | { type: "deco:set-viewport"; width: number }

type SiteToEditor =
  | { type: "deco:ready"; version: string }
  | { type: "deco:block-selected"; blockId: string; rect: DOMRect }
  | { type: "deco:page-rendered"; blockRects: Record<string, DOMRect> }
```

**Why NOT GrapeJS/Craft.js:** These impose their own component model. We need to work with ANY React component tree, not a builder-specific one. The data-attribute + postMessage approach is framework-agnostic and proven by Sanity/DatoCMS/Payload.

**Why data attributes over Stega encoding:** Stega (invisible characters in strings) only works for text content and breaks string equality comparisons. Data attributes work for any component including images, layouts, and non-text blocks. More predictable, easier to debug.

**Why NOT penpal/iframe-message-bridge:** Current `useIframeBridge` hook with `useSyncExternalStore` + discriminated unions is type-safe, React-idiomatic, and proven. Adding penpal (^7.0.0) wraps postMessage in Promise-based RPC, adding abstraction overhead for no gain. Penpal useful for method proxying; not needed for unidirectional message protocol.

### 6. Supporting Infrastructure (Already in Mesh)

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| **Bun** | runtime | Server runtime | Already in Mesh. Fast startup, native TS. |
| **Hono** | ^4.10.7 | API framework | Already in Mesh. Plugin routes mount on Hono. |
| **Kysely** | ^0.28.8 | SQL query builder | Already in Mesh. Type-safe Postgres queries for operational state. |
| **Better Auth** | 1.4.5 | Authentication | Already in Mesh. Handles CMS user auth. |
| **Zod** | ^4.0.0 | Validation | Already in Mesh. v4 with native `z.toJSONSchema()` support. |
| **TanStack Router** | ^1.139.7 | Client routing | Already in Mesh. CMS client plugin registers routes here. |
| **TanStack Query** | 5.90.11 | Client data fetching/caching | Already in Mesh. Use for editor API calls (tool calls). |
| **OpenTelemetry** | ^1.9.0 | Observability | Already in Mesh. Instrument sync latency, scan times, editor events. |
| **@modelcontextprotocol/sdk** | 1.26.0 | MCP communication | Already in Mesh. CMS plugin communicates with sites via MCP proxy. |
| **Mesh Event Bus** | (built-in) | Cron scheduling + async events | Already in Mesh. Drives loader sync scheduling. |
| **mesh-plugin-object-storage** | workspace:* | S3-compatible storage abstraction | Already in Mesh. Use for production synced data and media uploads. |

---

## v1.1 Polish: Stack Additions & Patterns

### Connection Setup Wizard

**Stack needed:** NONE (use existing)

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| **mesh-sdk hooks** | workspace:* | `useConnectionActions()`, `useConnections()` | Already provides create/list/update mutations. Zero new deps. |
| **TanStack Query** | 5.90.11 | Mutation state management | Already in Mesh. Handles loading/error states for wizard steps. |
| **sonner** | >=2.0.0 | Toast notifications | Already peer dep. Use for success/error feedback. |

**Pattern:**
- Multi-step wizard: Select Type → Configure → Test Connection
- Progressive disclosure (not all-at-once forms)
- Contextual validation (per-step, not final submit)
- Visual progress indicators
- Allow back navigation + state preservation

**Modern wizard patterns (2026):**
- Progressive onboarding over static wizards
- Interactive validation, not just submit-time checks
- Visual progress (dots/bar), not just "Step 1 of 3" text

**Why NO wizard library:** 2-3 step flow with React state is simpler than adding react-hook-form or similar. mesh-sdk hooks already handle data layer.

**Sources:**
- [Wizard UI Pattern Best Practices](https://www.eleken.co/blog-posts/wizard-ui-pattern-explained) - 2026 patterns
- [Modern vs Traditional Wizards](https://userpilot.com/blog/onboarding-wizard/) - Progressive over static

### PostMessage Bridge Enhancements

**Stack needed:** NONE (enhance existing)

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| **Zod validation** | ^4.0.0 | Runtime protocol validation | Already in Mesh. Add `safeParse()` to message handlers. |
| **useSyncExternalStore** | (React 19) | External event subscription | Already in use. Proven pattern for postMessage. |

**Security enhancements:**

```typescript
// Add Zod validation for runtime safety
import { z } from "zod";

const EditorMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("deco:page-config"), page: PageSchema }),
  z.object({ type: z.literal("deco:update-block"), blockId: z.string(), props: z.record(z.unknown()) }),
  z.object({ type: z.literal("deco:select-block"), blockId: z.string() }),
  z.object({ type: z.literal("deco:set-viewport"), width: z.number() }),
]);

// In useIframeBridge subscribe:
const handleMessage = (e: MessageEvent) => {
  if (e.source !== iframeRef.current?.contentWindow) return;
  if (!e.data?.type?.startsWith(DECO_MSG_PREFIX)) return;

  const msg = EditorMessageSchema.safeParse(e.data);
  if (!msg.success) {
    console.warn("Invalid message", msg.error);
    return;
  }
  // Handle msg.data (typed and validated)
};
```

**Critical fix: targetOrigin**
- Current: `send("*")` ← UNSAFE for production
- Change to: `send(window.location.origin)` or env var

**Security best practices:**
- ✅ Origin validation: `e.source` check
- ✅ Message prefix filtering: `DECO_MSG_PREFIX`
- ✅ Type-safe protocol: discriminated unions
- ✅ Runtime validation: Zod safeParse
- ⚠️ Fix: Specific targetOrigin (not "*")

**Reconnection logic:**
- Detect iframe reload (onLoad event)
- Reset ready state
- Re-handshake with `deco:ready`
- Re-send page config if needed

**Why NOT penpal:** Promise-based RPC wrapper adds abstraction. Current pattern is simpler, proven, and type-safe. Penpal useful for bidirectional method calls; not needed for unidirectional message protocol.

**Sources:**
- [MDN postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) - targetOrigin security
- [Securing Cross-Window Communication](https://www.bindbee.dev/blog/secure-cross-window-communication) - origin validation
- [TypeScript Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) - type-safe protocols
- [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) - event subscription pattern
- [Zod Official Docs](https://zod.dev/) - safeParse validation

### I18n Variant System

**Stack needed:** NONE (file convention only)

**Recommended file structure:**

```
pages/
  home.json              # Default/base (en-US assumed)
  home.pt-BR.json        # Portuguese Brazil variant
  home.es-AR.json        # Spanish Argentina variant
  about.json
  about.pt-BR.json
```

**NOT recommended:**
- ❌ `pages/en-US/home.json` - folder structure overkill for CMS
- ❌ `home.locale.json` - doesn't sort well, harder to glob

**Rationale:**
- File-per-locale scales better than folder-per-locale for <100 pages
- Locale suffix matches ISO 639 + ISO 3166 standard (language_COUNTRY)
- Easy glob pattern: `*.{locale}.json`
- Default file has no suffix (simpler)
- Mirrors admin-cx pattern: `en-US.ts`, `pt-BR.ts`, `es-AR.ts`

**Admin UI strings (plugin chrome) use admin-cx i18n:**
```typescript
import { t } from "deco-sites/admin/i18n/runtime.ts";
t("admin.myKey") // From en-US.ts, pt-BR.ts, es-AR.ts
```

**Page content variants (JSON files) loaded by site-editor:**
```typescript
// pages/home.pt-BR.json - different section titles, image URLs, etc.
// NO i18n library needed, just JSON.parse(fs.readFile("home.{locale}.json"))
```

**Loading logic:**
```typescript
// In page-api.ts
export async function loadPage(path: string, locale?: string): Promise<Page> {
  const suffix = locale ? `.${locale}` : "";
  const filename = `${path}${suffix}.json`;
  // Try locale variant first, fallback to base
  try {
    return JSON.parse(await fs.readFile(filename));
  } catch {
    // Fallback to base if variant doesn't exist
    return JSON.parse(await fs.readFile(`${path}.json`));
  }
}
```

**Why NO i18n library (react-i18next, react-intl):**
- CMS page variants are DATA files (different content per locale)
- UI string translation libraries are for CHROME (buttons, labels, tooltips)
- admin-cx already has i18n for UI strings
- Adding react-i18next for page content is wrong tool for wrong job

**Sources:**
- [i18n File Naming Conventions](https://coderanch.com/t/54745/frameworks/File-naming-convention-Internationalization) - ISO 639/3166 standard
- [CMS i18n File Structures](https://decapcms.org/docs/i18n/) - multiple_files pattern
- [Resource File Best Practices](https://lingoport.com/blog/resource-files-best-practices-for-i18n-localization/) - consistency

### Agent-Readable Blocks Spec

**Stack needed:** EXISTING (ts-json-schema-generator)

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| **ts-json-schema-generator** | ^2.5.0 | Generate JSON Schema from TS types | Already in Mesh runtime. Industry standard format. |
| **ts-morph** | ^27.0.2 | Scan codebase for block definitions | Already in Mesh. Used for block discovery. |

**Generation pattern:**

```typescript
// In server/lib/generate-blocks-schema.ts
import { createGenerator } from "ts-json-schema-generator";
import { writeFile } from "fs/promises";

export async function generateBlocksSchema(projectPath: string) {
  const generator = createGenerator({
    path: `${projectPath}/blocks/**/*.tsx`,
    tsconfig: `${projectPath}/tsconfig.json`,
    type: "*", // All exported types
  });

  const schema = generator.createSchema();
  await writeFile(
    `${projectPath}/.deco/blocks-schema.json`,
    JSON.stringify(schema, null, 2)
  );
}
```

**Why JSON Schema:**
- Industry standard for structured data
- Agent tools (Claude, GPT) trained on JSON Schema
- Validates block props at runtime with Zod (schema → Zod via libraries)
- @rjsf already uses JSON Schema for property editor
- No custom DSL = no agent fine-tuning needed

**Agent consumption:**
```typescript
// Agent reads .deco/blocks-schema.json
// Gets all block types, required props, types, descriptions from JSDoc
// Can suggest valid block compositions based on schema constraints
```

**Why NOT custom DSL:** Requires documentation, agent training, no validation tooling. JSON Schema is universal.

**Sources:**
- [ts-json-schema-generator](https://github.com/vega/ts-json-schema-generator) - official docs
- [JSON Schema for AI](https://json-schema.org/) - agent-readable standard

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| TS Analysis | ts-morph + ts-json-schema-generator | extract-react-types | Unmaintained (3+ yrs), Atlassian-specific |
| TS Analysis | ts-json-schema-generator | typescript-json-schema | ts-json-schema-generator uses AST (better alias/generic support), more actively maintained |
| Data Sync | Event bus + immutable storage | Electric SQL | Adds infrastructure complexity (sync service), overkill for cron-triggered ETL. Consider for Phase 4+ |
| Data Sync | Event bus + immutable storage | Durable Streams | v0.1.0, too early for production. Monitor for future |
| Data Sync | Event bus + immutable storage | LiveStore / CRDT | Overkill for single-writer CMS content |
| Content Storage | Git (deconfig) + Postgres (operational) | All-Postgres | Content needs version history, branching, PR review |
| Content Storage | Git (deconfig) + Postgres (operational) | All-Git | Operational state needs fast writes, no versioning needs |
| SSG | React Router 7 prerender | Vike | Extra abstraction, less ecosystem alignment |
| SSG | React Router 7 prerender | vite-react-ssg | Community plugin for RR6, redundant with RR7 built-in |
| SSG | React Router 7 prerender | Next.js | Too opinionated, not stack-agnostic, Vercel lock-in |
| Visual Editor | postMessage + data attributes | GrapeJS / Craft.js | Impose own component model, not framework-agnostic |
| Visual Editor | Data attributes | Stega encoding | Only works for text, breaks equality checks, harder to debug |
| Visual Editor | Custom useIframeBridge | penpal / iframe-message-bridge | Adds Promise/RPC abstraction, current pattern is simpler |
| Prod Storage | Cloudflare R2 | AWS S3 | R2 has zero egress, same API, better for edge reads |
| Forms | @rjsf (JSON Schema forms) | Custom form renderer | Already proven in Mesh, huge time savings |
| Connection Wizard | React state + mesh-sdk hooks | react-hook-form / wizard library | 2-3 steps doesn't justify library overhead |
| I18n Content Variants | Locale-suffixed JSON files | react-i18next / react-intl | Wrong tool - for UI strings, not content data |
| Blocks Spec | JSON Schema | Custom DSL | No agent training, no validation tooling |

## New Dependencies to Add

```bash
# v1.1 Polish: NO NEW DEPENDENCIES NEEDED ✅

# All required functionality provided by:
# - Existing Mesh stack (Zod, TanStack Query, mesh-sdk)
# - React 19 built-ins (useSyncExternalStore)
# - Web platform APIs (postMessage, MutationObserver)
# - File conventions (locale-suffixed JSON)
```

**Validated:** All v1.1 features use existing dependencies. Current stack is sufficient.

## Version Verification

| Package | Claimed Version | Verification Source | Verified |
|---------|----------------|-------------------|----------|
| ts-morph | ^27.0.2 | [npm registry](https://www.npmjs.com/package/ts-morph) (WebSearch) | YES |
| ts-json-schema-generator | ^2.5.0 | [npm registry](https://www.npmjs.com/package/ts-json-schema-generator) (WebSearch) | YES |
| @rjsf/core | ^6.1.2 | Mesh `apps/mesh/package.json` (direct read) | YES |
| React Router 7 | ^7.x | [reactrouter.com](https://reactrouter.com/start/framework/rendering) (WebSearch) | YES |
| Vite | ^7.2.1 | Mesh `apps/mesh/package.json` (direct read) | YES |
| React | ^19.2.0 | Mesh `apps/mesh/package.json` (direct read) | YES |
| Zod | ^4.0.0 | Mesh `apps/mesh/package.json` (direct read) | YES |
| Hono | ^4.10.7 | Mesh `apps/mesh/package.json` (direct read) | YES |
| Kysely | ^0.28.8 | Mesh `apps/mesh/package.json` (direct read) | YES |

## Sources

### v1.0 Core Stack

- [ts-morph npm](https://www.npmjs.com/package/ts-morph) - v27.0.2, TypeScript AST wrapper
- [ts-morph GitHub](https://github.com/dsherret/ts-morph) - Active maintenance
- [ts-json-schema-generator npm](https://www.npmjs.com/package/ts-json-schema-generator) - v2.5.0
- [ts-json-schema-generator GitHub](https://github.com/vega/ts-json-schema-generator) - AST-based TS to JSON Schema
- [Electric SQL v1.1 release](https://electric-sql.com/blog/2025/08/13/electricsql-v1.1-released) - Context for future sync options
- [Electric SQL Durable Streams](https://electric-sql.com/blog/2025/12/09/announcing-durable-streams) - Protocol context
- [Durable Streams 0.1.0](https://electric-sql.com/blog/2025/12/23/durable-streams-0.1.0) - State Protocol, too early
- [React Router prerender docs](https://reactrouter.com/how-to/pre-rendering) - SSG configuration
- [React Router rendering strategies](https://reactrouter.com/start/framework/rendering) - SSR/SSG/SPA modes
- [Sanity visual-editing overlays](https://www.sanity.io/docs/visual-editing-overlays) - Industry pattern for iframe editing
- [DatoCMS visual editing](https://www.datocms.com/blog/introducing-visual-editing) - Data attribute overlay approach
- [Payload CMS visual editor](https://github.com/pemedia/payload-visual-editor) - postMessage protocol patterns
- [dotCMS Universal Visual Editor](https://docs.dotcms.com/blog/post/mastering-the-new-universal-visual-editor-in-dotcms) - iframe + postMessage security
- [Builder.io visual editing approaches](https://www.builder.io/blog/visual-editing-cms) - 4 approaches compared
- [Hono streaming helper](https://hono.dev/docs/helpers/streaming) - SSE support
- [Hono WebSocket helper](https://hono.dev/docs/helpers/websocket) - Bun WebSocket support
- [Cloudflare R2](https://www.cloudflare.com/developer-platform/products/r2/) - S3-compatible, zero egress
- [Vite SSR guide](https://vite.dev/guide/ssr) - Vite 7 SSR/SSG patterns
- [Standard JSON Schema](https://standardschema.dev/json-schema) - Zod/Valibot/ArkType interop spec

### v1.1 Polish Features

- [MDN Window.postMessage()](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) - Browser API reference, targetOrigin security
- [TypeScript: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) - Discriminated unions for type-safe protocols
- [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) - React 19 API for external event subscription
- [Zod Official Docs](https://zod.dev/) - Schema validation, safeParse pattern
- [Securing Cross-Window Communication](https://www.bindbee.dev/blog/secure-cross-window-communication) - postMessage security checklist
- [TypeScript Discriminated Unions Guide](https://www.ceos3c.com/typescript/typescript-discriminated-unions-master-type-safe/) - Type-safe message protocols
- [Wizard UI Pattern Best Practices](https://www.eleken.co/blog-posts/wizard-ui-pattern-explained) - 2026 progressive patterns
- [Modern Onboarding vs Wizards](https://userpilot.com/blog/onboarding-wizard/) - Progressive over static wizards
- [i18n File Naming Conventions](https://coderanch.com/t/54745/frameworks/File-naming-convention-Internationalization) - ISO 639/3166 locale suffixes
- [CMS i18n File Structures](https://decapcms.org/docs/i18n/) - multiple_files pattern for CMSs
- [Resource Files Best Practices](https://lingoport.com/blog/resource-files-best-practices-for-i18n-localization/) - Consistency across file types
- [Penpal GitHub](https://github.com/Aaronius/penpal) - Promise-based iframe RPC (not needed for this use case)
- [WebApiBridge](https://precor.github.io/web-api-bridge/) - React Native + iframe bridge (wrong use case)
- [react-i18next](https://react.i18next.com/) - UI string translation (not for content variants)
