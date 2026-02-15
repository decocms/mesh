# Architecture Patterns

**Domain:** Stack-Agnostic CMS Plugin (Mesh Plugin)
**Researched:** 2026-02-14

## Recommended Architecture

The system is five major components connected through two communication channels: MCP tool calls (server-side) and postMessage (client-side iframe). All state lives in git (`.deco/` directory) and immutable storage (local FS or S3+CDN).

```
+------------------+     MCP Tools      +------------------+
|   Mesh Plugin    |<==================>|   Site Runtime   |
|  (ServerPlugin)  |                    |  (MCP Server)    |
+------------------+                    +------------------+
        |                                       |
        | React UI (ClientPlugin)               | Renders pages from
        v                                       | config + synced data
+------------------+    postMessage     +------------------+
|  Visual Editor   |<================>  |  Site in iframe  |
|  (Page Composer) |                    |  (local/tunnel)  |
+------------------+                    +------------------+
        |                                       |
        v                                       v
+------------------+                    +------------------+
|  Block Scanner   |                    |  Synced Data     |
|  (AI + ts-morph) |                    |  (FS / S3+CDN)   |
+------------------+                    +------------------+
        |
        v
+------------------+
|  .deco/ in git   |
|  (config store)  |
+------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **CMS Server Plugin** | MCP tools for page CRUD, block registry, loader management, data sync orchestration. Implements `ServerPlugin` interface. | Site Runtime (via MCP proxy), Block Scanner (invokes), Git (.deco/ read/write via deconfig) |
| **CMS Client Plugin** | React UI for visual editing, page composition, block library, loader configuration. Implements `ClientPlugin` interface with `setup()` for route/sidebar registration. | CMS Server Plugin (via `usePluginContext().toolCaller`), Site iframe (via postMessage) |
| **Block Scanner** | Analyzes TypeScript codebases to extract component exports + typed props. Generates block definitions as JSON. Runs as server-side tool (not real-time). | CMS Server Plugin (invoked as tool), Site git repo (reads source files) |
| **Data Sync Engine** | Executes loader functions, writes results to immutable storage. Manages sync schedules, staleness, incremental updates. | CMS Server Plugin (orchestrated via tools/events), Immutable Storage (writes), Site Runtime (reads via SITE_BINDING) |
| **Site Runtime** | MCP server running in the site process. Implements SITE_BINDING (GET_PAGE_CONTENT_FOR_PATH, LIST_CONTENT_TYPES, etc.). Renders pages from config + synced data. | CMS Server Plugin (responds to MCP calls), Visual Editor (responds to postMessage), .deco/ config (reads), Synced Data (reads) |

### Data Flow

**1. Onboarding Flow (Block Scanner)**

```
User connects repo
  -> CMS Plugin receives GitHub repo URL
  -> Block Scanner tool invoked (server-side)
  -> Clones/accesses repo via GitHub MCP or deconfig
  -> ts-morph parses TypeScript, extracts exported components
  -> For each component: extract props interface, infer JSON Schema
  -> AI agent enriches: labels, categories, default props, descriptions
  -> Writes block definitions to .deco/blocks/*.json in repo
  -> Commits via deconfig PUT_FILE
```

**2. Page Editing Flow (Visual Editor)**

```
User opens page in editor
  -> Client Plugin loads page config from .deco/pages/{path}.json via tool call
  -> Renders iframe pointing to site URL (tunnel for local, CDN for prod)
  -> Site loads, sends "ready" postMessage to parent
  -> Editor sends current page config via postMessage
  -> Site re-renders with provided config

User edits a section's props:
  -> Editor UI updates prop value
  -> Sends updated props via postMessage to iframe
  -> Site re-renders instantly (optimistic)
  -> On "save": tool call to write .deco/pages/{path}.json
  -> Deconfig commits to git branch
```

**3. Data Sync Flow (Loaders)**

```
Loader defined in .deco/loaders/{name}.json:
  { "function": "loaders/products.ts", "schedule": "*/5 * * * *", "shape": {...} }

Sync Engine (event-bus driven):
  -> Cron event fires for loader
  -> Engine executes loader function (via MCP tool call to site runtime)
  -> Loader fetches from upstream API (VTEX, Shopify, etc.)
  -> Engine writes result to immutable storage:
     - Dev: .deco/data/{loader-hash}/{version}.json (local FS)
     - Prod: s3://bucket/.deco/data/{loader-hash}/{version}.json
  -> Updates pointer: .deco/data/{loader-hash}/latest -> {version}
  -> Site reads from latest pointer (always fast, always available)
```

**4. Production Rendering Flow**

```
Request arrives at site:
  -> Site reads page config from .deco/pages/{path}.json (bundled or fetched)
  -> For each section on page:
     -> Resolve block definition from .deco/blocks/{type}.json
     -> If section has loader data: read from synced storage (S3+CDN, cached)
     -> If section has static props: use directly from config
     -> Render component with resolved props
  -> Return HTML (SSG) or hydrate (SPA)
```

## Component Deep Dive

### CMS Server Plugin

Follows the exact `ServerPlugin` interface from `@decocms/bindings/server-plugin`. This is the central orchestrator.

**Tools (MCP):**

| Tool | Purpose |
|------|---------|
| `SCAN_BLOCKS` | Trigger block scanner on connected repo |
| `LIST_BLOCKS` | List registered block definitions |
| `GET_BLOCK` | Get single block definition with schema |
| `LIST_PAGES` | List pages from .deco/pages/ |
| `GET_PAGE` | Get page config |
| `SAVE_PAGE` | Write page config to .deco/pages/ |
| `DELETE_PAGE` | Remove page |
| `LIST_LOADERS` | List loader definitions |
| `GET_LOADER` | Get loader config |
| `SAVE_LOADER` | Write loader config |
| `TRIGGER_SYNC` | Manually trigger a loader sync |
| `GET_SYNC_STATUS` | Check sync status for loaders |

**Migrations:**
- `001-cms-sites.ts` -- Site metadata (connected repo, branch, sync settings)
- `002-cms-sync-state.ts` -- Loader sync state (last run, version, status)

**Events:**
- `cms.loader.sync.scheduled` -- Cron-triggered loader sync
- `cms.loader.sync.completed` -- Sync finished, update pointers
- `cms.block.scan.requested` -- Trigger block scanning
- `cms.block.scan.completed` -- Scanning finished, blocks available

**Storage:**
- Site metadata in Mesh DB (Kysely)
- All content config in git via deconfig (`.deco/` directory)
- Synced data in immutable storage (FS or S3)

### CMS Client Plugin

Implements `ClientPlugin` with full `setup()` for route and sidebar registration.

**Routes (via TanStack Router):**

| Route | Purpose |
|-------|---------|
| `/cms` | Dashboard -- site overview, sync status |
| `/cms/pages` | Page list |
| `/cms/pages/:path` | Visual editor for specific page |
| `/cms/blocks` | Block library browser |
| `/cms/loaders` | Loader list with sync status |
| `/cms/loaders/:id` | Loader config editor |
| `/cms/settings` | CMS settings (repo, branch, sync config) |

**Sidebar:**
- Root item: "CMS" with site icon
- Group: Pages, Blocks, Loaders, Settings

**Key UI Components:**
- `PageEditor` -- iframe preview + section sidebar + prop editor
- `BlockPicker` -- searchable block library for adding sections to pages
- `PropEditor` -- JSON Schema-driven form for editing section props
- `LoaderEditor` -- loader function config + schedule + sync status
- `SyncDashboard` -- overview of all loader sync states

### Block Scanner

Not a standalone service -- it is a set of server-side tools that run within the CMS Server Plugin. Uses ts-morph for TypeScript AST analysis.

**Scanning strategy:**

1. **Discovery**: Find all files matching patterns (`sections/**/*.tsx`, `components/**/*.tsx`, or configurable)
2. **Extraction**: For each file, find default exports that are React components
3. **Type Analysis**: Extract the props interface using TypeScript type checker (not just AST -- need resolved types for imported/extended interfaces)
4. **Schema Generation**: Convert TypeScript types to JSON Schema (handles primitives, objects, arrays, unions, enums, optional)
5. **AI Enrichment** (optional): Use LLM to generate human-friendly labels, descriptions, categories, and suggest default values
6. **Output**: Write `.deco/blocks/{component-path}.json` with:

```json
{
  "id": "sections/Hero",
  "component": "sections/Hero.tsx",
  "label": "Hero Banner",
  "category": "Marketing",
  "description": "Full-width hero section with image, title, and CTA",
  "schema": { /* JSON Schema from props */ },
  "defaults": { "title": "Welcome", "ctaText": "Get Started" }
}
```

**Why ts-morph over TypeScript Compiler API directly**: ts-morph wraps the compiler API with a simpler navigation/query interface. For prop extraction, you need `Type.getProperties()`, `Type.getText()`, and recursive type resolution -- ts-morph makes this ergonomic. HIGH confidence based on ts-morph documentation and react-scanner patterns.

### Data Sync Engine

Inspired by ElectricSQL's Shapes concept but adapted for CMS loaders. Not a full CRDT/local-first system -- simpler: loaders produce data, engine writes it to immutable storage, sites read from storage.

**Architecture decisions:**

- **Push, not pull**: Loaders run on schedule (cron via event bus) or on-demand (manual trigger). They push results to storage. Sites never call upstream APIs at render time.
- **Immutable versions**: Each sync produces a new version file. Pointer updated atomically. No data corruption from partial writes.
- **Shape-like subscriptions**: A loader definition is essentially a "shape" -- it defines what data to fetch and how to transform it. The sync engine manages the lifecycle.
- **Two storage backends**:
  - Dev: deconfig (git-backed file storage, accessed via MCP tools READ_FILE/PUT_FILE)
  - Prod: S3-compatible object storage (via mesh-plugin-object-storage or direct S3 SDK)

**Sync lifecycle:**

```
IDLE -> SCHEDULED (cron event) -> RUNNING (executing loader)
  -> SUCCESS (write to storage, update pointer)
  -> FAILED (log error, schedule retry with backoff)
```

Uses Mesh event bus for scheduling:
- `EVENT_PUBLISH` with `cron` for recurring syncs
- `EVENT_PUBLISH` with `deliverAt` for retry after failure
- Plugin `onEvents` handler processes sync events

### Visual Editor (iframe + postMessage)

Follows the Payload CMS Live Preview pattern -- proven, framework-agnostic, secure.

**Protocol (postMessage messages):**

| Direction | Message Type | Payload | Purpose |
|-----------|-------------|---------|---------|
| Site -> Editor | `deco:ready` | `{ version }` | Site loaded, ready to receive config |
| Editor -> Site | `deco:page-config` | `{ page: Page }` | Send full page config for rendering |
| Editor -> Site | `deco:update-block` | `{ blockId, props }` | Update single block's props (optimistic) |
| Editor -> Site | `deco:select-block` | `{ blockId }` | Highlight/scroll to block |
| Site -> Editor | `deco:block-selected` | `{ blockId, rect }` | User clicked a block in preview |
| Site -> Editor | `deco:page-rendered` | `{ blockRects }` | Block positions for overlay drawing |
| Editor -> Site | `deco:set-viewport` | `{ width }` | Change preview viewport width |

**Site-side integration:**

The site needs a thin client library (`@decocms/editor-client`) that:
1. Listens for postMessage events from parent window
2. On `deco:page-config`: replaces page config and triggers re-render
3. On `deco:update-block`: patches specific block props and re-renders
4. Reports block bounding rects back to editor for overlay positioning
5. Intercepts clicks to report `deco:block-selected` instead of navigation

This library is framework-agnostic -- it manipulates a config object and calls a render callback. For React, it is a hook (`useDecoEditor`). For other frameworks, a vanilla JS API.

**Editor-side:**

The Page Composer (React, runs in Mesh UI) renders:
1. Left sidebar: section list (drag to reorder)
2. Center: iframe with site preview
3. Right sidebar: prop editor for selected section (JSON Schema form)

## Patterns to Follow

### Pattern 1: Deconfig as Git Abstraction

**What:** All `.deco/` file operations go through deconfig MCP tools (READ_FILE, PUT_FILE, LIST_FILES), never direct git operations.
**When:** Any time the CMS needs to read or write configuration.
**Why:** Deconfig handles branch isolation, file watching (SSE), and atomic operations. The CLI already uses this pattern (push, pull, sync commands). The deco runtime already consumes deconfig as a filesystem abstraction.

```typescript
// Reading page config via MCP tool call
const page = await toolCaller("READ_FILE", {
  path: ".deco/pages/home.json",
  branch: currentBranch,
  format: "json"
});

// Writing page config
await toolCaller("PUT_FILE", {
  path: ".deco/pages/home.json",
  branch: currentBranch,
  content: JSON.stringify(pageConfig)
});
```

### Pattern 2: SITE_BINDING as Site Contract

**What:** The site-binding-renderer package already defines the contract between CMS and sites: `GET_PAGE_CONTENT_FOR_PATH`, `LIST_CONTENT_TYPES`, `GET_CONTENT`, `SEARCH_CONTENT`, `LIST_VIEWS`.
**When:** CMS needs to query what the site can render.
**Why:** This binding already exists in the codebase. Sites that implement SITE_BINDING can be managed by the CMS. The binding includes caching metadata for each tool.

```typescript
// Site implements SITE_BINDING
const siteConnection = await ctx.createMCPProxy(siteConnectionId);
const { page } = await siteConnection.callTool({
  name: "GET_PAGE_CONTENT_FOR_PATH",
  arguments: { path: "/products" }
});
```

### Pattern 3: Event-Driven Sync via Mesh Event Bus

**What:** Loader sync schedules use the Mesh event bus cron feature, not custom scheduling infrastructure.
**When:** Any recurring data sync operation.
**Why:** The event bus already supports cron expressions, at-least-once delivery, exponential backoff retries, and per-org isolation. The workflows plugin already demonstrates this pattern.

```typescript
// In ServerPlugin.onEvents handler
onEvents: {
  types: ["cms.loader.sync.scheduled"],
  handler: async (events, ctx) => {
    for (const event of events) {
      const loaderConfig = event.data as LoaderConfig;
      // Execute loader, write to storage, publish completion
      await executeSync(loaderConfig, ctx);
      await ctx.publish("cms.loader.sync.completed", loaderConfig.id, {
        version: newVersion,
        timestamp: Date.now()
      });
    }
  }
}
```

### Pattern 4: Plugin Architecture (Client + Server Split)

**What:** Separate client entry point (`clientPlugin`) and server entry point (`serverPlugin`), connected through Mesh's plugin system.
**When:** Always -- this is how Mesh plugins work.
**Why:** Prevents server code from being bundled into client. Client uses `usePluginContext()` for typed tool calls. Server uses `ServerPlugin` interface for tools, migrations, events, routes.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Direct Database Access for Content

**What:** Storing page configs or block definitions in the Mesh database instead of git.
**Why bad:** Breaks the git-based workflow. Content must be version-controlled, branch-aware, and diffable. The Mesh DB is for plugin metadata (sync state, site connections), not content.
**Instead:** Use deconfig for all content operations. Use Mesh DB only for operational state (sync status, scan progress, site metadata).

### Anti-Pattern 2: Live API Calls at Render Time

**What:** Sites calling upstream APIs (VTEX, Shopify) during page rendering.
**Why bad:** Slow, fragile, expensive. If the API is down, the site is down. Defeats the entire push-based sync architecture.
**Instead:** Sites read from synced immutable storage. Loaders handle upstream API calls asynchronously.

### Anti-Pattern 3: Tight Framework Coupling in Block Scanner

**What:** Building the block scanner specifically for Next.js or FastStore with framework-specific assumptions.
**Why bad:** Every new framework requires scanner rewrite. The scanner should work with any TypeScript codebase.
**Instead:** Scan for exported React components with typed props -- this pattern is universal across React-based frameworks. Framework-specific conventions (like Next.js page routes vs components) are handled by configurable scan patterns, not hard-coded logic.

### Anti-Pattern 4: Monolithic Editor Component

**What:** Building the visual editor as one giant component that handles iframe, prop editing, page composition, and block picking all in one file.
**Why bad:** Unmaintainable, untestable, impossible to extend.
**Instead:** Compose from independent pieces: `<IframePreview />`, `<SectionList />`, `<PropEditor />`, `<BlockPicker />`. Each communicates through shared state (signals or context), not props drilling.

## .deco/ Directory Structure

The canonical configuration format stored in the site's git repo:

```
.deco/
  blocks/                    # Block definitions (generated by scanner)
    sections--Hero.json      # One file per component
    sections--ProductShelf.json
  pages/                     # Page compositions
    home.json                # { path: "/", blocks: [...] }
    products--[slug].json    # Dynamic route pages
  loaders/                   # Loader configurations
    products.json            # { function: "loaders/products.ts", schedule: "*/5 * * * *" }
    categories.json
  data/                      # Synced data (dev only -- prod uses S3)
    products/
      latest.json            # Pointer to latest version
      v001.json              # Immutable version
  config.json                # Site-level CMS config (scan patterns, sync settings)
```

## Suggested Build Order

Based on dependency analysis, components should be built in this order:

### Phase 1: Foundation (no dependencies)

**Build first:** CMS Server Plugin skeleton + deconfig integration + basic Client Plugin with routes

- Register `ServerPlugin` with ID, tools shell, migrations
- Register `ClientPlugin` with `setup()`, sidebar, routes
- Implement READ_FILE/PUT_FILE/LIST_FILES wrappers as server tools
- Wire up basic page CRUD (list pages, get page, save page) -- JSON files in `.deco/pages/`
- This is the "hello world" -- a Mesh plugin that reads/writes JSON files in a git repo

**Why first:** Everything else depends on the plugin skeleton and git integration. This validates the entire plugin infrastructure works.

### Phase 2: Block Scanner (depends on Phase 1)

**Build second:** TypeScript codebase analysis + block definition generation

- Implement ts-morph-based scanner as server-side tools
- Extract component exports with typed props
- Generate JSON Schema from TypeScript types
- Write block definitions to `.deco/blocks/`
- Optional AI enrichment pass (labels, descriptions)

**Why second:** The visual editor needs block definitions to work. Pages reference blocks. Without the scanner, you would need to hand-write block definitions.

### Phase 3: Visual Editor (depends on Phase 1 + 2)

**Build third:** iframe preview + postMessage protocol + prop editor

- Implement postMessage protocol (editor-side)
- Build thin site-side client library (`@decocms/editor-client`)
- Build PropEditor component (JSON Schema-driven form)
- Build PageComposer (section list + iframe + prop editor)
- Build BlockPicker (add sections from block library)

**Why third:** This is the core user-facing feature. Needs blocks (Phase 2) and page CRUD (Phase 1). Does not need data sync -- static props editing works without it.

### Phase 4: Data Sync Engine (depends on Phase 1)

**Build fourth:** Loader execution + immutable storage + sync scheduling

- Define loader configuration format
- Implement sync execution (call loader via site MCP, write result)
- Integrate with event bus for cron scheduling
- Implement sync status tracking (Mesh DB)
- Wire up immutable storage (local FS first, S3 later)

**Why fourth:** This is the most complex component but the visual editor works without it (static props). Building it last means the editor can ship earlier. However, Phase 4 only depends on Phase 1, so it could be parallelized with Phase 3 if team capacity allows.

### Phase 5: Production Polish (depends on all above)

- S3 + CDN storage backend for production
- Branch-based preview (different branches = different site previews)
- Merge workflow (branch merge triggers deployment)
- Site template (React 19 + Vite + Tailwind default project)
- Monitoring/observability for sync status

## Scalability Considerations

| Concern | At 10 sites | At 1K sites | At 100K sites |
|---------|-------------|-------------|---------------|
| Block scanning | Inline tool execution, seconds per site | Queue via event bus, parallel workers | Dedicated scan workers, incremental scanning (only changed files) |
| Data sync | Cron per loader, inline execution | Event bus handles scheduling, batch by org | Dedicated sync workers, S3 multipart uploads, CDN invalidation |
| Config storage | Git via deconfig, reads on demand | Cache frequently accessed configs in Mesh DB | Read-through cache layer, denormalize hot paths |
| Visual editor | Direct iframe to local/tunnel | Iframe to CDN-hosted preview | Preview farm with pre-warmed containers |
| Git operations | Direct deconfig MCP calls | Batch writes, debounce commits | Git operation queue, conflict resolution |

## Sources

- Mesh `ServerPlugin` interface: `/Users/guilherme/Projects/mesh/packages/bindings/src/core/server-plugin.ts` (HIGH confidence)
- Mesh `ClientPlugin` interface: `/Users/guilherme/Projects/mesh/packages/bindings/src/core/plugins.ts` (HIGH confidence)
- Mesh plugin example (workflows): `/Users/guilherme/Projects/mesh/packages/mesh-plugin-workflows/` (HIGH confidence)
- Deconfig CLI and MCP integration: `/Users/guilherme/Projects/mesh/packages/cli/src/commands/deconfig/` (HIGH confidence)
- SITE_BINDING schema: `/Users/guilherme/Projects/mesh/packages/site-binding-renderer/dist/src/bindings/site.d.ts` (HIGH confidence)
- Deco runtime decofile system: `/Users/guilherme/Projects/deco/engine/decofile/` (HIGH confidence)
- [Payload CMS Live Preview](https://payloadcms.com/docs/live-preview/overview) -- iframe + postMessage pattern (MEDIUM confidence)
- [ts-morph](https://ts-morph.com/) -- TypeScript AST manipulation (MEDIUM confidence)
- [ElectricSQL Shapes](https://electric-sql.com/docs/guides/shapes) -- Push-based sync inspiration (MEDIUM confidence)
- [react-scanner](https://github.com/moroshko/react-scanner) -- Component extraction patterns (LOW confidence, reference only)

---

*Architecture analysis: 2026-02-14*
