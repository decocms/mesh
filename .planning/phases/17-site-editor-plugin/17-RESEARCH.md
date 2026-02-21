# Phase 17: site-editor plugin - Research

**Researched:** 2026-02-21
**Domain:** Visual CMS plugin, React 19, drag-and-drop, RJSF, iframe postMessage, git UX
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Plugin shell & navigation**
- Site editor appears as a **dedicated tab** in the project nav (alongside Connections, Settings, etc.)
- Tab is **hidden entirely** for projects that don't implement DECO_BLOCKS_BINDING — no greyed-out state, no noise
- Inside the tab: **left sidebar for the page list, right area for the composer**
- Creating or renaming a page uses a **modal dialog** (not inline rename)

**Composer layout**
- **Two-panel split:** left panel (sections + props), right panel (preview iframe)
- Left panel uses **slide/replace navigation:** section list → click section → panel slides to props form with a back button to return to list
- No permanent three-column layout — sections and props share the same left panel
- Loader binding (EDT-08) uses a **separate binding drawer/panel** triggered from a "Bind loader" button in the props form, not a dropdown inline in the field
- Undo/redo (EDT-10) operates at **per-action granularity** — each discrete action (add section, reorder, change a prop field value) is one undo step, not per-keystroke

**Preview integration**
- Right panel is an **iframe pointed at the local-dev server port** — the full dev server is navigable, not locked to a single page
- The preview URL comes from the connection/agent context (the port local-dev registered with) — the site editor reads it, does not manage it
- **Edit mode:** pointer events blocked on the iframe; the left sections panel is the active editing surface
- **Interact mode:** pointer events pass through to the iframe; user can click links, scroll, interact with the live site
- The "chat to edit" experience is the **global Mesh chat**, aware of the current connection/agent context — not a separate panel owned by the site editor

**Git UX placement**
- Pending changes and git history surface in a **bottom bar / footer** in the composer
- Footer shows pending change count; clicking expands the footer panel with diff details, commit button, and history list
- **Commit flow:** click commit → Claude auto-generates message → user reviews/edits in a confirmation dialog before committing
- **Git history:** clicking a commit in the footer list **expands a diff panel inline** below the commit list (not replacing the preview)
- **Revert:** runs via `git checkout <hash> -- <file>` (file-level, scoped to the current page's file) via bash; composer refreshes sections after revert

### Claude's Discretion
- Exact drag-and-drop library for section reordering
- RJSF configuration and widget overrides for props forms
- Loading states and skeleton design
- Footer panel animation and collapse behavior
- Error state handling (e.g., local-dev offline, git command failure)
- Specific icon choices and spacing

### Deferred Ideas (OUT OF SCOPE)
- **Dev server auto-discovery** — Agent reads package.json, runs `bun dev` via bash, discovers the port automatically. Phase 15 (local-dev) + Phase 18 (deco link) concern. Phase 17 just consumes the URL.
- **Chat-alongside-preview panel** — User mentioned "chat to edit" as a side panel next to the preview. Deferred: the global Mesh chat is sufficient for Phase 17.
- **Agent auto-creation on local-dev registration** — When `deco link` registers local-dev as a connection, Mesh auto-creates an Agent for it. This is Phase 18 scope.
- **Framework-agnostic preview** — Phase 17 preview iframe is already framework-agnostic (just an iframe). Agent-powered experience for non-deco sites is a broader capability for its own phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EDT-01 | User can view and navigate all pages in a deco site project | Page list component reading `.deco/pages/*.json` via filesystem tools on the connection |
| EDT-02 | User can create, rename, and delete pages | Modal dialog → write/update/tombstone-delete `.deco/pages/{id}.json` via `write` tool |
| EDT-03 | User can view all available blocks and their prop schemas | `toolCaller("BLOCKS_LIST", {})` returns `blocks[]` with `propsSchema` JSON Schema |
| EDT-04 | User can view all available loaders and their prop schemas | `toolCaller("LOADERS_LIST", {})` returns `loaders[]` with `propsSchema` + `returnType` |
| EDT-05 | User can open the visual composer for any page | Route `/pages/$pageId` renders the composer with blocks + props + iframe |
| EDT-06 | User can add, remove, and reorder sections on a page via drag-and-drop | `@dnd-kit/sortable` for reordering; add via block picker modal; remove from section list |
| EDT-07 | User can edit section props via auto-generated form (RJSF) | `@rjsf/core` with `@rjsf/validator-ajv8`; form generated from `propsSchema` |
| EDT-08 | User can bind a loader to a section prop | Loader picker drawer triggered from "Bind loader" button in props form |
| EDT-09 | User can preview the page live in an iframe with edit/interact mode toggle | iframe at `connection.metadata.previewUrl`; postMessage bridge for live updates |
| EDT-10 | User can undo and redo changes in the composer | Snapshot-based `useUndoRedo` hook with `useReducer`; Cmd+Z / Cmd+Shift+Z shortcuts |
| EDT-11 | User sees pending changes (sections added/modified/deleted vs git HEAD) with diff badges | `bash("git status --porcelain .deco/pages/{id}.json")` + parse to show per-section badges |
| EDT-12 | User can commit pending changes from Mesh UI with a Claude-generated commit message | Server route POST /api/plugins/site-editor/commit-message → Haiku; then `bash("git add -A && git commit -m '...'")` |
| EDT-13 | User can view git history for the current page with commit list and diff preview | `bash("git log --format=... -- .deco/pages/{id}.json")` + `bash("git show {hash}:.deco/pages/{id}.json")` |
| EDT-14 | User can revert to a previous commit with a confirmation dialog | Confirmation dialog → `bash("git checkout {hash} -- .deco/pages/{id}.json")` + refresh composer |
| EDT-15 | Site editor activates automatically when the project connection implements DECO_BLOCKS_BINDING | Plugin's `binding: DECO_BLOCKS_BINDING` field → `PluginLayout` filters connections; sidebar tab shows when plugin is in project's `enabledPlugins` |
</phase_requirements>

---

## Summary

Phase 17 builds `packages/mesh-plugin-site-editor/` — a full visual CMS plugin for the Mesh admin UI. It is a **clean re-implementation** from the `gui/site-builder` reference branch (not a copy; the reference has git-specific MCP tools and a SITE_BINDING that no longer apply). Phase 17's architecture is shaped by two key decisions made after the reference was built: (1) git operations go through the **bash tool** on the local-dev connection (not server-side `execFile`), and (2) the binding trigger is **DECO_BLOCKS_BINDING** (blocks + loaders), not a custom SITE_BINDING.

The reference implementation (`gui/site-builder:packages/mesh-plugin-site-editor/`) is a gold mine of patterns: the `useUndoRedo` hook (snapshot-based `useReducer`), the `useIframeBridge` postMessage bridge (using `useSyncExternalStore` to avoid banned `useEffect`), the page JSON format (`.deco/pages/{id}.json`), the RJSF widget overrides, the block picker modal, and the commit message flow (Haiku via `/api/plugins/site-editor/commit-message`). These patterns are HIGH confidence and should be transplanted with minimal changes.

The primary architectural difference: page read/write and git commands all flow through **tool calls on the connection** (filesystem tools and bash), not through server-side HTTP routes that run `execFile` with a hardcoded `projectPath`. The plugin is largely a **client-side plugin** with only one server route (commit message generation). This keeps the plugin portable and avoids coupling to local-dev's internal file path.

**Primary recommendation:** Transplant the reference implementation patterns (useUndoRedo, useIframeBridge, page-api, RJSF widgets, block picker) and replace SITE_BINDING tool calls with DECO_BLOCKS_BINDING + generic filesystem/bash tool calls.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/core` | `^6.1.0` | Drag-and-drop primitives | Used in reference; battle-tested for sortable lists; React 19 compatible |
| `@dnd-kit/sortable` | `^8.0.0` | Sortable list abstraction | Used in reference; `arrayMove` utility; works with DndContext |
| `@dnd-kit/modifiers` | `^7.0.0` | Constrain drag axis | Used in reference; `restrictToVerticalAxis` for section list |
| `@rjsf/core` | `^6.1.2` | Auto-generated props form from JSON Schema | Already in apps/mesh/package.json; generates form from `propsSchema` |
| `@rjsf/validator-ajv8` | `^6.1.2` | Schema validation for RJSF | Already in apps/mesh/package.json; required peer dep |
| `@rjsf/utils` | `^6.1.2` | RJSF type definitions | Already in apps/mesh/package.json |
| `nanoid` | `>=5.0.0` | Unique IDs for block instances | Already used in reference; peer dep; `nanoid(8)` for block IDs |
| `sonner` | `>=2.0.0` | Toast notifications | Already in monorepo; used throughout plugins |
| `lucide-react` | `^0.468.0` | Git-specific icons (GitCommit) | Used in reference for icons not in @untitledui/icons |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@dnd-kit/utilities` | `^3.2.2` | CSS variable transforms for DnD | Used by @dnd-kit/sortable internally |
| `@untitledui/icons` | `^0.0.19` | Standard icon set | Primary icon source; lucide-react only for icons not available here |
| `@decocms/mesh-sdk` | `workspace:*` | `usePluginContext`, `useConnections`, project hooks | Required for all plugin route components |
| `@decocms/bindings` | `workspace:*` | `DECO_BLOCKS_BINDING`, plugin types, `connectionImplementsBinding` | Required for plugin definition |
| `@decocms/mesh-plugin-deco-blocks` | `workspace:*` | `isDecoSite`, block/loader types | Phase 16 output; provides `BlockDefinition`, `LoaderDefinition` |
| `@deco/ui` | `workspace:*` | Button, Dialog, Input components | Shared design system |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@dnd-kit/sortable` | `react-beautiful-dnd` | dnd-kit is actively maintained, React 19 compatible; rbd is deprecated |
| `@dnd-kit/sortable` | `@hello-pangea/dnd` | dnd-kit is simpler API, better performance with large lists |
| `@rjsf/core` | Hand-rolled form | RJSF handles nested schemas, arrays, enums, validation — too complex to hand-roll |
| Bash tool for file I/O | Separate FILE binding | Bash tool is already on the local-dev connection; no new binding needed |

**Installation:**
```bash
bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @dnd-kit/utilities lucide-react nanoid sonner
# @rjsf/* and @decocms/* are already in the monorepo
```

---

## Architecture Patterns

### Recommended Project Structure
```
packages/mesh-plugin-site-editor/
├── package.json                    # Client + server exports
├── tsconfig.json
├── shared.ts                       # PLUGIN_ID, PLUGIN_DESCRIPTION constants
├── client/
│   ├── index.tsx                   # ClientPlugin<typeof DECO_BLOCKS_BINDING>
│   ├── components/
│   │   ├── pages-list.tsx          # EDT-01/EDT-02: page navigation + create/rename/delete
│   │   ├── page-composer.tsx       # EDT-05/EDT-06/EDT-07/EDT-09/EDT-10: two-panel composer
│   │   ├── section-list-sidebar.tsx # Left panel: DnD sortable sections list
│   │   ├── prop-editor.tsx         # RJSF form for editing section props
│   │   ├── preview-panel.tsx       # iframe with edit/interact toggle
│   │   ├── block-picker.tsx        # Modal for selecting a block to add
│   │   ├── loader-drawer.tsx       # Drawer for binding a loader to a prop
│   │   ├── footer-bar.tsx          # EDT-11/EDT-12/EDT-13: pending changes + git history
│   │   ├── commit-dialog.tsx       # EDT-12: review/edit generated commit message
│   │   ├── revert-dialog.tsx       # EDT-14: confirmation dialog before revert
│   │   └── rjsf/
│   │       ├── widgets.tsx         # Custom RJSF widgets (text, number, checkbox, url)
│   │       └── templates.tsx       # Custom RJSF templates (field label, description)
│   └── lib/
│       ├── router.ts               # createPluginRouter (pages list + composer routes)
│       ├── page-api.ts             # listPages, getPage, createPage, updatePage, deletePage
│       ├── block-api.ts            # listBlocks, listLoaders (via BLOCKS_LIST, LOADERS_LIST)
│       ├── git-api.ts              # gitStatus, gitLog, gitShow, gitCheckout, gitCommit
│       ├── use-undo-redo.ts        # Snapshot-based undo/redo with useReducer
│       ├── use-iframe-bridge.ts    # postMessage bridge with useSyncExternalStore
│       ├── use-pending-changes.ts  # Pending changes badge data (git status)
│       └── query-keys.ts           # TanStack Query key constants
└── server/
    └── index.ts                    # ServerPlugin with commit-message route only
```

### Pattern 1: Plugin Activation via DECO_BLOCKS_BINDING
**What:** The plugin's `binding` field is set to `DECO_BLOCKS_BINDING`. Mesh's `PluginLayout` uses `connectionImplementsBinding()` to filter connections. Only connections with `BLOCKS_LIST` and `LOADERS_LIST` tools appear.
**When to use:** Always — this is the EDT-15 requirement.

```typescript
// Source: packages/bindings/src/core/plugins.ts + packages/bindings/src/well-known/deco-blocks.ts
import { DECO_BLOCKS_BINDING } from "@decocms/bindings";
import type { ClientPlugin } from "@decocms/bindings/plugins";

export const clientPlugin: ClientPlugin<typeof DECO_BLOCKS_BINDING> = {
  id: "site-editor",
  description: "Visual composer for Deco sites",
  binding: DECO_BLOCKS_BINDING,
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  setup: (ctx) => {
    ctx.registerRootSidebarItem({
      icon: <LayoutAlt03 size={16} />,
      label: "Site Editor",
    });
    const routes = siteEditorRouter.createRoutes(ctx);
    ctx.registerPluginRoutes(routes);
  },
};
```

### Pattern 2: Calling Non-Binding Tools (Filesystem + Bash)
**What:** The `TypedToolCaller` is typed to `DECO_BLOCKS_BINDING` tools only. To call filesystem tools (`read`, `write`, `list`) and bash (`bash`) on the local-dev connection, use a type-cast escape hatch.
**When to use:** Page read/write (filesystem tools) and all git operations (bash tool).

```typescript
// Source: apps/mesh/src/web/layouts/plugin-layout.tsx + packages/bindings/src/core/plugin-context.ts
type GenericToolCaller = (
  toolName: string,
  args: Record<string, unknown>
) => Promise<unknown>;

// In page-api.ts
export async function listPages(toolCaller: GenericToolCaller) {
  const result = await toolCaller("list", { path: ".deco/pages/" }) as {
    entries?: Array<{ name: string; path: string }>
  };
  // ... parse .json files
}

export async function readPage(toolCaller: GenericToolCaller, id: string) {
  const result = await toolCaller("read", {
    path: `.deco/pages/${id}.json`
  }) as { content: string };
  return JSON.parse(result.content) as Page;
}

// In git-api.ts
export async function getGitLog(toolCaller: GenericToolCaller, pageId: string) {
  const result = await toolCaller("bash", {
    command: `git log --format="%H|%an|%aI|%s" -- .deco/pages/${pageId}.json`
  }) as { stdout: string; stderr: string; exitCode: number };
  return parseGitLog(result.stdout);
}
```

### Pattern 3: Snapshot-Based Undo/Redo
**What:** `useUndoRedo<T>` manages past/present/future stacks using `useReducer`. Each action (`push(next)`) records the full state snapshot. Max 100 history entries.
**When to use:** EDT-10 — undo/redo at per-action granularity.

```typescript
// Source: gui/site-builder:packages/mesh-plugin-site-editor/client/lib/use-undo-redo.ts
// Transplant verbatim — the implementation is correct and React 19 compatible
const { value: blocks, push: pushBlocks, undo, redo, canUndo, canRedo, reset } =
  useUndoRedo<BlockInstance[]>(page?.blocks ?? []);

// Push on any block change
pushBlocks(updatedBlocks);

// Keyboard shortcuts via useSyncExternalStore (not useEffect — ban-use-effect applies)
useSyncExternalStore(
  (notify) => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); notify(); }
      if (mod && e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); notify(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  },
  () => null,
  () => null,
);
```

### Pattern 4: postMessage iframe Bridge
**What:** `useIframeBridge` manages the handshake, heartbeat, and message protocol between the composer and the deco site iframe. Uses `useSyncExternalStore` to subscribe to window message events without `useEffect`.
**When to use:** EDT-09 — live preview with block highlighting and mode switching.

```typescript
// Source: gui/site-builder:packages/mesh-plugin-site-editor/client/lib/use-iframe-bridge.ts
// Transplant with minimal changes — only difference is previewUrl source
const { send, setIframeRef, ready, disconnected, reconnect, hoverRect, clearHover } =
  useIframeBridge({
    page: localPage,
    selectedBlockId,
    mode,
    onBlockClicked: (id) => setSelectedBlockId(prev => prev === id ? null : id),
    onClickAway: () => setSelectedBlockId(null),
  });

// The iframe src comes from connection metadata, not a hardcoded port
const previewUrl = connection.metadata?.previewUrl as string | null;
```

### Pattern 5: Page File Format
**What:** Pages are stored as JSON in `.deco/pages/{id}.json`. Block instances reference block types by name (e.g., `"sections--ProductShelf"`).
**When to use:** All page CRUD operations (EDT-01 through EDT-05, EDT-11 through EDT-14).

```typescript
// Source: gui/site-builder:packages/mesh-plugin-site-editor/client/lib/page-api.ts
interface BlockInstance {
  id: string;          // nanoid(8)
  blockType: string;   // e.g., "ProductShelf" (from block.name in BLOCKS_LIST)
  props: Record<string, unknown>;
}

interface Page {
  id: string;          // e.g., "page_abc12345"
  path: string;        // URL path e.g., "/products"
  title: string;
  blocks: BlockInstance[];
  metadata: { description: string; createdAt: string; updatedAt: string };
}

// Pages stored at: .deco/pages/{id}.json
// Deletion uses tombstone: { deleted: true, deletedAt: string }
```

### Pattern 6: Commit Message Generation (Server Route)
**What:** Server-side route at `POST /api/plugins/site-editor/commit-message` calls Claude Haiku with the git diff. ANTHROPIC_API_KEY must be set server-side.
**When to use:** EDT-12 — auto-generate commit message before user reviews.

```typescript
// Source: gui/site-builder:packages/mesh-plugin-site-editor/server/tools/commit-message.ts
// Transplant verbatim — calls Anthropic API directly via fetch (no SDK dep)
// Model: claude-haiku-4-5-20251001 (current Haiku model as of 2026)
// Max tokens: 200 (commit messages are short)
// Falls back to empty string if ANTHROPIC_API_KEY not set
```

### Pattern 7: Git Operations via Bash Tool
**What:** All git operations go through the connection's `bash` tool. This replaces the reference's server-side `execFile` approach.
**When to use:** EDT-11, EDT-12, EDT-13, EDT-14.

```typescript
// Git status for a specific page file
const status = await toolCaller("bash", {
  command: `git status --porcelain .deco/pages/${pageId}.json`
}) as { stdout: string; exitCode: number };

// Git log for a specific page file
const log = await toolCaller("bash", {
  command: `git log --format="%H|%an|%aI|%s" -- .deco/pages/${pageId}.json`
}) as { stdout: string };

// Git show (file at specific commit)
const content = await toolCaller("bash", {
  command: `git show ${hash}:.deco/pages/${pageId}.json`
}) as { stdout: string };

// Git checkout (revert file)
await toolCaller("bash", {
  command: `git checkout ${hash} -- .deco/pages/${pageId}.json`
});

// Git commit (stage all + commit)
await toolCaller("bash", {
  command: `git add -A && git commit -m "${message.replace(/"/g, '\\"')}"`
});
```

### Pattern 8: Slide Navigation for Left Panel
**What:** Left panel transitions between "section list" and "props form" views using CSS translate transitions. A `view` state variable controls which panel is visible. No routing — in-component state.
**When to use:** EDT-06/EDT-07 — selecting a section shows its props; back button returns to list.

```typescript
// No library needed — CSS transforms + state
const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
const isEditing = selectedBlockId !== null;

// Panel container: transform: translateX for slide effect
<div className="relative overflow-hidden h-full">
  <div className={cn(
    "absolute inset-0 transition-transform duration-200",
    isEditing ? "-translate-x-full" : "translate-x-0"
  )}>
    <SectionList ... />
  </div>
  <div className={cn(
    "absolute inset-0 transition-transform duration-200",
    isEditing ? "translate-x-0" : "translate-x-full"
  )}>
    <PropEditor ... />
  </div>
</div>
```

### Anti-Patterns to Avoid
- **useEffect for event listeners:** Project bans `useEffect`. Use `useSyncExternalStore` for keyboard shortcuts and iframe message events (reference implementation shows correct pattern).
- **useMemo/useCallback:** Banned by project lint rules. React Compiler handles optimization.
- **Server-side git execFile:** Reference used server-side `execFile` reading `projectPath` from connection metadata. Phase 17 uses bash tool on the connection — more portable, no server path dependency.
- **Calling git routes from the client:** No server-side git routes needed. All git via bash tool through the MCP connection.
- **Direct import of @decocms/local-dev:** Phase 17 does NOT import local-dev package. Capability-checked at runtime via tool availability.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop reordering | Custom mouse event handlers | `@dnd-kit/sortable` with `SortableContext` + `useSortable` | Handles touch, keyboard, screen reader accessibility; pointer sensor setup |
| Props form from JSON Schema | Custom schema-to-form renderer | `@rjsf/core` 6.x with `@rjsf/validator-ajv8` | Handles nested objects, arrays, enums, required fields, error messages |
| Undo/redo state | Custom history array management | `useUndoRedo` hook (transplant from reference) | Tested, handles edge cases (capping at 100, reset, clearFuture) |
| Query key management | Ad-hoc string literals | `queryKeys` constants object | Prevents cache invalidation mismatches; reference pattern |
| Toast notifications | Custom toast component | `sonner` | Already in monorepo; consistent with other plugins |
| Commit message | Prompt in UI + empty default | Server route → Claude Haiku | ANTHROPIC_API_KEY server-side; generates conventional commit format |

**Key insight:** The reference implementation in `gui/site-builder` has already solved the hard problems. The research confirms those patterns are correct — transplant, adapt to new binding/tool strategy, don't reinvent.

---

## Common Pitfalls

### Pitfall 1: useEffect Ban
**What goes wrong:** Reaching for `useEffect` for window event listeners (keyboard shortcuts, postMessage) — banned by `plugins/ban-use-effect.ts`.
**Why it happens:** Natural React pattern; author unaware of ban.
**How to avoid:** Use `useSyncExternalStore` for external subscriptions. The reference `use-undo-redo.ts` and `use-iframe-bridge.ts` show the exact pattern.
**Warning signs:** `useEffect` import in any component.

### Pitfall 2: RJSF v6 vs v5 Breaking Changes
**What goes wrong:** Using v5 API patterns (e.g., `additionalMetaSchemas`) that don't exist in v6.
**Why it happens:** Training data may reference older RJSF docs.
**How to avoid:** The monorepo already pins `@rjsf/core@^6.1.2`. Use `@rjsf/validator-ajv8` (not ajv6). Transplant widget patterns from reference directly.
**Warning signs:** TypeScript errors on RJSF types; runtime "validator" errors.

### Pitfall 3: TypedToolCaller Type Mismatch for Non-Binding Tools
**What goes wrong:** Calling `toolCaller("read", ...)` (filesystem tool) or `toolCaller("bash", ...)` — TypeScript rejects because they're not in DECO_BLOCKS_BINDING.
**Why it happens:** `TypedToolCaller<typeof DECO_BLOCKS_BINDING>` only types `BLOCKS_LIST` and `LOADERS_LIST`.
**How to avoid:** Define `GenericToolCaller = (name: string, args: Record<string, unknown>) => Promise<unknown>` and cast: `(toolCaller as unknown as GenericToolCaller)`. Do this in `page-api.ts` and `git-api.ts` at the module level.
**Warning signs:** TS error "Argument of type 'string' is not assignable to type 'BLOCKS_LIST' | 'LOADERS_LIST'".

### Pitfall 4: Preview URL Not Available on All Connections
**What goes wrong:** `connection.metadata?.previewUrl` is undefined because the connection was not registered by `deco link` (Phase 18).
**Why it happens:** Phase 17 ships before Phase 18 completes; or non-deco connections also pass the DECO_BLOCKS_BINDING check.
**How to avoid:** Gracefully handle missing preview URL — show a placeholder with instructions ("Run `deco link` to start the dev server and connect preview").
**Warning signs:** iframe src is `undefined`; blank preview panel.

### Pitfall 5: Page File Writes Must Be Atomic
**What goes wrong:** Writing partial JSON to `.deco/pages/{id}.json` (e.g., crash during write) corrupts the page.
**Why it happens:** The `write` tool on local-dev is a direct file write — no transaction support.
**How to avoid:** Always serialize the full `Page` object via `JSON.stringify(page, null, 2)` before writing. Never patch individual fields. The debounce-save pattern from reference (2s debounce) is sufficient — no write in-progress during most crashes.
**Warning signs:** JSON parse errors when reading pages after a failed save.

### Pitfall 6: Git Commands Without bash Tool
**What goes wrong:** Git UX (EDT-11 to EDT-14) silently fails if the connection doesn't expose a `bash` tool (non-local-dev connections).
**Why it happens:** DECO_BLOCKS_BINDING doesn't include bash; other connections implementing BLOCKS_LIST + LOADERS_LIST won't have bash.
**How to avoid:** Check for bash tool availability at runtime: inspect `connection.tools` array for a tool named `bash`. If absent, hide git UX (EDT-11 to EDT-14 are gated on bash availability per REQUIREMENTS.md note).
**Warning signs:** "Tool not found" errors; git footer bar showing when bash is unavailable.

---

## Code Examples

### Block List Call (typed)
```typescript
// Source: packages/bindings/src/well-known/deco-blocks.ts
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { DECO_BLOCKS_BINDING } from "@decocms/bindings";

const { toolCaller } = usePluginContext<typeof DECO_BLOCKS_BINDING>();
const { blocks } = await toolCaller("BLOCKS_LIST", {});
// blocks: Array<{ name, filePath, kind, propsSchema }>
```

### Page List Call (untyped filesystem tool)
```typescript
// Source: analysis of local-dev Phase 15 + reference page-api.ts
type GenericToolCaller = (name: string, args: Record<string, unknown>) => Promise<unknown>;

const genericCaller = toolCaller as unknown as GenericToolCaller;

// List page files
const listResult = await genericCaller("list", { path: ".deco/pages/" }) as {
  entries?: Array<{ name: string; isDirectory: boolean }>
};

// Read a page
const readResult = await genericCaller("read", {
  path: `.deco/pages/${pageId}.json`
}) as { content: string };
const page = JSON.parse(readResult.content) as Page;

// Write a page
await genericCaller("write", {
  path: `.deco/pages/${pageId}.json`,
  content: JSON.stringify(page, null, 2)
});
```

### DnD Sortable Section List
```typescript
// Source: gui/site-builder (reference pattern) + @dnd-kit/sortable docs
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

function SectionList({ blocks, onReorder }) {
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    onReorder(arrayMove(blocks, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.map(block => <SortableSection key={block.id} block={block} />)}
      </SortableContext>
    </DndContext>
  );
}

function SortableSection({ block }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  // ...
}
```

### RJSF Props Form
```typescript
// Source: gui/site-builder reference + apps/mesh/package.json (already has @rjsf/*)
import Form from "@rjsf/core";
import { type RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { customWidgets } from "./rjsf/widgets";
import { customTemplates } from "./rjsf/templates";

<Form
  schema={block.propsSchema as RJSFSchema}
  validator={validator}
  formData={block.props}
  onChange={({ formData }) => onPropsChange(formData)}
  widgets={customWidgets}
  templates={customTemplates}
  uiSchema={{ "ui:submitButtonOptions": { norender: true } }}
/>
```

### ServerPlugin with Commit Message Route
```typescript
// Source: gui/site-builder:packages/mesh-plugin-site-editor/server/index.ts
import type { ServerPlugin } from "@decocms/bindings/server-plugin";
import { PLUGIN_ID } from "../shared";

export const serverPlugin: ServerPlugin = {
  id: PLUGIN_ID,
  routes: (app, _ctx) => {
    app.post("/commit-message", async (c) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return c.json({ message: "" });
      const { diff } = await c.req.json();
      // Call claude-haiku-4-5-20251001 via fetch — no SDK needed
      // Return { message: string }
    });
  },
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SITE_BINDING (READ_FILE, PUT_FILE, etc.) | DECO_BLOCKS_BINDING + generic bash/fs calls | Phase 17 design decision | Plugin activates on any deco-aware connection; file ops via local-dev tools |
| Server-side execFile for git | Bash tool on connection | Phase 15/17 decision | No server path dependency; git ops go through MCP proxy |
| Three-column composer layout | Two-panel (left slides between sections/props) | CONTEXT.md decision | Simpler, more focused UX; no wasted space for permanent prop panel |
| SITE_BINDING git tools (GIT_COMMIT, GIT_STATUS, etc.) | bash tool commands | Phase 15 amendment | Fewer tool registrations; unrestricted git access via bash |
| Server-side git routes | None (all via bash tool) | Phase 17 decision | Minimal server; no connection path coupling |

**Deprecated/outdated (from reference, do NOT carry over):**
- `SITE_BINDING`: defines READ_FILE, PUT_FILE, LIST_FILES, GIT_* tools — replaced by DECO_BLOCKS_BINDING + local-dev tools
- Server-side git routes (`/api/plugins/site-editor/git/*`): replaced by bash tool calls
- `site-store.ts` (Zustand multi-site store): Phase 17 has one connection per plugin view — no multi-site management
- Branch switcher component: branches deferred to v1.4

---

## Open Questions

1. **Preview URL field name in connection metadata**
   - What we know: `connection.metadata` is `Record<string, unknown>`; Phase 18 (`deco link`) stores the local server URL
   - What's unclear: Exact key name Phase 18 will use (`previewUrl`? `devServerUrl`? `localUrl`?)
   - Recommendation: Default to `previewUrl`; make it configurable or discoverable from connection metadata shape when Phase 18 lands

2. **`list` tool output format for local-dev**
   - What we know: Phase 15 Plan 02 confirms filesystem tools include `list`; returns entries
   - What's unclear: Exact response shape (`{ entries: [...] }` vs `{ files: [...] }` vs plain array)
   - Recommendation: Write page-api.ts to handle both shapes; add defensive null checks

3. **bash tool command format for git operations**
   - What we know: bash tool takes `{ command: string }`, returns `{ stdout, stderr, exitCode }`
   - What's unclear: Whether shell escaping is handled by local-dev or must be done by caller
   - Recommendation: Use shell-safe commit message formatting; avoid special characters in dynamic content

4. **Sidebar tab visibility (binding vs enabledPlugins)**
   - What we know: `use-project-sidebar-items.tsx` filters by `enabledPlugins`; `PluginLayout` filters by binding
   - What's unclear: Phase 17 relies on Phase 18 to add the plugin to `enabledPlugins`. For manual testing, the developer must enable it in project settings.
   - Recommendation: Add the site-editor to the plugin registry so it appears in project settings. Also handle the case where enabledPlugins includes the plugin but no connection implements DECO_BLOCKS_BINDING (show empty state with instructions).

---

## Sources

### Primary (HIGH confidence)
- `gui/site-builder:packages/mesh-plugin-site-editor/` — Full reference implementation; patterns transplanted directly
- `packages/bindings/src/well-known/deco-blocks.ts` — DECO_BLOCKS_BINDING definition (current state)
- `packages/bindings/src/core/plugins.ts` — ClientPlugin, PluginSetupContext types
- `packages/bindings/src/core/server-plugin.ts` — ServerPlugin types, ServerPluginContext
- `apps/mesh/src/web/index.tsx` — Plugin registration, sidebar item setup
- `apps/mesh/src/web/hooks/use-project-sidebar-items.tsx` — How enabledPlugins gates tab visibility
- `apps/mesh/src/web/layouts/plugin-layout.tsx` — How binding filters connections
- `apps/mesh/src/web/layouts/dynamic-plugin-layout.tsx` — Plugin layout routing
- `.planning/phases/15-local-dev-daemon/15-RESEARCH.md` — local-dev tool names (read, write, list, bash)
- `.planning/phases/15-local-dev-daemon/15-02-PLAN.md` — Confirms filesystem tool names
- `.planning/phases/15-local-dev-daemon/15-03-PLAN.md` — Confirms bash tool name
- `.planning/phases/16-plugin-deco-blocks/16-VERIFICATION.md` — DECO_BLOCKS_BINDING confirmed working
- `apps/mesh/package.json` — Confirms @rjsf/core@^6.1.2 already in monorepo

### Secondary (MEDIUM confidence)
- `gui/site-builder:packages/mesh-plugin-site-editor/package.json` — Library versions (@dnd-kit/*, @rjsf/*, nanoid); verified against current npm
- `gui/site-builder:packages/bindings/src/well-known/site.ts` — SITE_BINDING (NOT used, documented to show what NOT to transplant)

### Tertiary (LOW confidence)
- Phase 17 preview URL field name in connection metadata — not yet implemented in Phase 18

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — reference implementation + monorepo validation
- Architecture: HIGH — direct codebase analysis; patterns verified in live code
- Pitfalls: HIGH — based on direct code inspection (ban-use-effect lint rule, TypedToolCaller typing, RJSF version)
- Git-via-bash pattern: HIGH — Phase 15 research confirms bash tool interface
- Preview URL field: LOW — Phase 18 not yet implemented

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (30 days; stable stack, no fast-moving dependencies)
