---
phase: 17-site-editor-plugin
verified: 2026-02-21T19:45:00Z
status: passed
score: 15/15 must-haves verified
re_verification: false
---

# Phase 17: Site Editor Plugin Verification Report

**Phase Goal:** Users with a deco site project can navigate pages, compose sections visually, edit props, preview live, and manage git history — all from the Mesh UI; the plugin activates automatically when DECO_BLOCKS_BINDING is detected
**Verified:** 2026-02-21T19:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Plugin activates automatically when DECO_BLOCKS_BINDING is detected | VERIFIED | `clientPlugin.binding = DECO_BLOCKS_BINDING` in `client/index.tsx:25`; `ClientPlugin<typeof DECO_BLOCKS_BINDING>` type |
| 2 | User can view and navigate all pages from `.deco/pages/*.json` | VERIFIED | `pages-list.tsx` uses `listPages(genericCaller)` via `useQuery`; `page-api.ts` reads from `.deco/pages/` |
| 3 | User can create, rename, and delete pages | VERIFIED | `pages-list.tsx` wires `createMutation`, `renameMutation`, `deleteMutation` via `createPage/updatePage/deletePage`; `PageModal` for create/rename |
| 4 | User can open visual composer by clicking a page | VERIFIED | `handlePageClick` navigates to `/$org/$project/$pluginId/pages/$pageId`; router has `/pages/$pageId` route pointing to `page-composer.tsx` |
| 5 | Left panel shows sections; clicking a section slides to prop editor | VERIFIED | `page-composer.tsx` CSS `translate-x` slide between `SectionListSidebar` and `PropEditor` panels |
| 6 | Sections can be reordered via drag-and-drop | VERIFIED | `section-list-sidebar.tsx` uses `DndContext + SortableContext + useSortable` from `@dnd-kit`; `arrayMove` on drag end |
| 7 | Prop editor shows RJSF form from section's propsSchema | VERIFIED | `prop-editor.tsx` uses `Form` from `@rjsf/core` with `validator` from `@rjsf/validator-ajv8`; `blockDef.propsSchema` as schema |
| 8 | Loader binding drawer opens from prop editor | VERIFIED | `LoaderDrawer` wired in `page-composer.tsx`; `onBindLoader` prop triggers open; `listLoaders` via `block-api.ts` |
| 9 | Right panel is iframe with previewUrl; graceful empty state | VERIFIED | `preview-panel.tsx:21` checks `!previewUrl` and shows empty state; iframe `src={previewUrl}` |
| 10 | Edit/interact mode toggle controls pointer events on iframe | VERIFIED | `preview-panel.tsx:70`: `pointerEvents: mode === "interact" ? "auto" : "none"` |
| 11 | Undo (Cmd+Z) / redo (Cmd+Shift+Z) via keyboard using useSyncExternalStore | VERIFIED | `page-composer.tsx:127` uses `useSyncExternalStore` for keyboard handler; no `useEffect` anywhere in client code |
| 12 | Footer bar shows pending changes; hidden when no bash tool | VERIFIED | `footer-bar.tsx:51`: `if (!hasBashTool(connectionTools)) return null`; `gitStatus` polled every 5s |
| 13 | User can commit with Claude-generated commit message | VERIFIED | `footer-bar.tsx:80`: `fetch("/api/plugins/site-editor/commit-message")`; `server/index.ts` has POST route calling Claude Haiku |
| 14 | User can view git history and inline diff for a page | VERIFIED | `footer-bar.tsx` uses `gitLog` (history list) and `gitShow` (inline diff on commit click) |
| 15 | User can revert to a previous commit | VERIFIED | `footer-bar.tsx` wires `RevertDialog`; confirms via `AlertDialog`; runs `gitCheckout` |

**Score:** 15/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mesh-plugin-site-editor/package.json` | Package manifest with client/server exports | VERIFIED | Exports `./client` and `./server`; all workspace deps present |
| `packages/mesh-plugin-site-editor/shared.ts` | PLUGIN_ID and PLUGIN_DESCRIPTION constants | VERIFIED | `PLUGIN_ID="site-editor"`, `PLUGIN_DESCRIPTION="Visual composer for Deco sites"` |
| `packages/mesh-plugin-site-editor/client/index.tsx` | clientPlugin with DECO_BLOCKS_BINDING, setup, renderHeader, renderEmptyState | VERIFIED | 37 lines; binding set, siteEditorRouter wired in setup |
| `packages/mesh-plugin-site-editor/server/index.ts` | ServerPlugin with POST /commit-message route | VERIFIED | 65 lines; full Claude Haiku call with graceful fallback |
| `packages/mesh-plugin-site-editor/client/lib/page-api.ts` | listPages, getPage, createPage, updatePage, deletePage | VERIFIED | 190 lines; all 5 functions with defensive response handling |
| `packages/mesh-plugin-site-editor/client/lib/block-api.ts` | listBlocks, listLoaders via TypedToolCaller | VERIFIED | 24 lines; typed calls to BLOCKS_LIST and LOADERS_LIST |
| `packages/mesh-plugin-site-editor/client/lib/git-api.ts` | gitStatus, gitLog, gitShow, gitCheckout, gitCommit, hasBashTool | VERIFIED | 126 lines; all git operations via bash tool |
| `packages/mesh-plugin-site-editor/client/lib/query-keys.ts` | TanStack Query key constants | VERIFIED | 12 lines; all keys as const arrow functions |
| `packages/mesh-plugin-site-editor/client/lib/use-undo-redo.ts` | useUndoRedo with useReducer; undoRedoReducer exported | VERIFIED | 86 lines; PUSH/UNDO/REDO/RESET actions; MAX_HISTORY=100 |
| `packages/mesh-plugin-site-editor/client/lib/use-undo-redo.test.ts` | 9 passing tests for undoRedoReducer | VERIFIED | 9/9 tests pass (confirmed with bun test) |
| `packages/mesh-plugin-site-editor/client/lib/use-iframe-bridge.ts` | useIframeBridge with useSyncExternalStore | VERIFIED | 161 lines; no useEffect; module-level singleton store |
| `packages/mesh-plugin-site-editor/client/lib/router.ts` | siteEditorRouter with / and /pages/$pageId routes | VERIFIED | 28 lines; both routes lazy-loaded |
| `packages/mesh-plugin-site-editor/client/components/pages-list.tsx` | Page list with CRUD actions, TanStack Query | VERIFIED | 193 lines; useQuery + useMutation; QUERY_KEYS constants |
| `packages/mesh-plugin-site-editor/client/components/page-modal.tsx` | Modal for create/rename | VERIFIED | 100 lines; Dialog with title + path fields |
| `packages/mesh-plugin-site-editor/client/components/page-composer.tsx` | Two-panel composer with all hooks wired | VERIFIED | 366 lines; useUndoRedo, useIframeBridge, useSyncExternalStore for keyboard |
| `packages/mesh-plugin-site-editor/client/components/section-list-sidebar.tsx` | DnD sortable section list | VERIFIED | 161 lines; DndContext + SortableContext + useSortable |
| `packages/mesh-plugin-site-editor/client/components/prop-editor.tsx` | RJSF form with custom widgets | VERIFIED | 96 lines; @rjsf/core Form with customWidgets and customTemplates |
| `packages/mesh-plugin-site-editor/client/components/preview-panel.tsx` | iframe with mode toggle, graceful empty state | VERIFIED | 77 lines; pointerEvents controlled by mode; empty state when no previewUrl |
| `packages/mesh-plugin-site-editor/client/components/block-picker.tsx` | Modal showing BLOCKS_LIST blocks | VERIFIED | 89 lines; listBlocks via useQuery; search filter |
| `packages/mesh-plugin-site-editor/client/components/loader-drawer.tsx` | Drawer for loader binding | VERIFIED | 78 lines; listLoaders via useQuery |
| `packages/mesh-plugin-site-editor/client/components/rjsf/widgets.tsx` | Custom RJSF widgets | VERIFIED | TextWidget, NumberWidget, CheckboxWidget, URLWidget; customWidgets export |
| `packages/mesh-plugin-site-editor/client/components/rjsf/templates.tsx` | Custom RJSF templates | VERIFIED | FieldTemplate, DescriptionField; customTemplates export |
| `packages/mesh-plugin-site-editor/client/components/footer-bar.tsx` | Footer with git UX | VERIFIED | 248 lines; hasBashTool gate; gitStatus/gitLog/gitShow/gitCheckout/gitCommit all wired |
| `packages/mesh-plugin-site-editor/client/components/commit-dialog.tsx` | Commit message review dialog | VERIFIED | 85 lines; Dialog with editable Textarea; generating/loading state |
| `packages/mesh-plugin-site-editor/client/components/revert-dialog.tsx` | Revert confirmation dialog | VERIFIED | 53 lines; AlertDialog with commit hash/message display |
| `apps/mesh/src/web/plugins.ts` | siteEditorPlugin registered | VERIFIED | `import { clientPlugin as siteEditorPlugin } from "mesh-plugin-site-editor/client"` at line 7; in sourcePlugins array at line 16 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `client/index.tsx` | `bindings/deco-blocks.ts` | `import { DECO_BLOCKS_BINDING }` | WIRED | `DECO_BLOCKS_BINDING` imported and set as `binding:` on clientPlugin |
| `client/index.tsx` | `client/lib/router.ts` | `siteEditorRouter.createRoutes(context)` | WIRED | Import present; `createRoutes` called in `setup()` |
| `client/lib/page-api.ts` | `list` filesystem tool | `toolCaller("list", { path: ".deco/pages/" })` | WIRED | Line 51 calls `toolCaller("list", ...)` |
| `client/lib/git-api.ts` | `bash` tool | `toolCaller("bash", { command: "git ..." })` | WIRED | gitStatus, gitLog, gitShow, gitCheckout, gitCommit all use bash tool |
| `client/lib/block-api.ts` | `DECO_BLOCKS_BINDING` | `toolCaller("BLOCKS_LIST", {})` | WIRED | Line 14 calls `BLOCKS_LIST`; line 19 calls `LOADERS_LIST` |
| `client/components/pages-list.tsx` | `client/lib/page-api.ts` | `useQuery(() => listPages(genericCaller))` | WIRED | `listPages` imported and called in queryFn |
| `client/components/page-composer.tsx` | `use-undo-redo.ts` | `useUndoRedo<BlockInstance[]>(page.blocks)` | WIRED | Line 112: `useUndoRedo<BlockInstance[]>` |
| `client/components/page-composer.tsx` | `use-iframe-bridge.ts` | `useIframeBridge({ page, selectedBlockId, mode })` | WIRED | Line 141: `useIframeBridge({ page:..., selectedBlockId, mode, ...})` |
| `client/components/section-list-sidebar.tsx` | `@dnd-kit/sortable` | `DndContext + SortableContext + useSortable` | WIRED | All three imported and used; `arrayMove` on dragEnd |
| `client/components/prop-editor.tsx` | `@rjsf/core` | `Form schema={block.propsSchema} validator={validator}` | WIRED | Line 48: `<Form schema={schema} validator={validator} ...>` |
| `client/components/footer-bar.tsx` | `client/lib/git-api.ts` | `gitStatus/gitLog/gitShow via bash tool` | WIRED | All git functions imported and called; hasBashTool gates render |
| `client/components/commit-dialog.tsx` (via footer-bar) | `server/index.ts` | `fetch('/api/plugins/site-editor/commit-message')` | WIRED | Line 80 in footer-bar.tsx fetches the route; server has the handler |
| `apps/mesh/src/web/plugins.ts` | `mesh-plugin-site-editor/client` | `import { clientPlugin as siteEditorPlugin }` | WIRED | Line 7 import; line 16 registered in sourcePlugins |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|-------------|-------------|--------|---------|
| EDT-01 | 17-02, 17-04 | User can view and navigate all pages | SATISFIED | `pages-list.tsx` queries `listPages`; navigation wired to `/pages/$pageId` |
| EDT-02 | 17-02, 17-04 | User can create, rename, and delete pages | SATISFIED | All three mutations in `pages-list.tsx`; `PageModal` for create/rename |
| EDT-03 | 17-02, 17-05 | User can view available blocks and their prop schemas | SATISFIED | `block-api.ts` calls `BLOCKS_LIST`; `BlockPicker` renders block list with kind |
| EDT-04 | 17-02, 17-05 | User can view available loaders and their prop schemas | SATISFIED | `block-api.ts` calls `LOADERS_LIST`; `LoaderDrawer` renders loader list |
| EDT-05 | 17-04, 17-05 | User can open the visual composer for any page | SATISFIED | Router `/pages/$pageId` route → `page-composer.tsx`; navigation from `handlePageClick` |
| EDT-06 | 17-05 | User can add, remove, reorder sections via DnD | SATISFIED | `SectionListSidebar` DnD; `handleAddBlock`, `handleRemove`, `handleReorder` in composer |
| EDT-07 | 17-05 | User can edit section props via RJSF form | SATISFIED | `PropEditor` renders `@rjsf/core Form` with `blockDef.propsSchema` |
| EDT-08 | 17-05 | User can bind a loader to a section prop | SATISFIED | `LoaderDrawer` wired; `handleLoaderBind` updates `block.loaderBinding` |
| EDT-09 | 17-03, 17-05 | User can preview page live with edit/interact toggle | SATISFIED | `PreviewPanel` iframe; `mode` controls `pointerEvents`; `useIframeBridge` bridge |
| EDT-10 | 17-03, 17-05 | User can undo and redo changes | SATISFIED | `useUndoRedo` with 9 passing tests; Cmd+Z/Cmd+Shift+Z via `useSyncExternalStore`; undo/redo buttons |
| EDT-11 | 17-02, 17-06 | User sees pending changes with diff badges | SATISFIED | `footer-bar.tsx` shows pending badge with M/A/D color coding; `gitStatus` polled every 5s |
| EDT-12 | 17-02, 17-06 | User can commit with Claude-generated message | SATISFIED | Commit button → `fetch /commit-message` → Claude Haiku → `CommitDialog` → `gitCommit` |
| EDT-13 | 17-02, 17-06 | User can view git history and diff preview | SATISFIED | `gitLog` history list in footer; `gitShow` inline diff on commit click |
| EDT-14 | 17-02, 17-06 | User can revert to previous commit with confirmation | SATISFIED | `RevertDialog` → `gitCheckout`; page query invalidated; `onPageReverted` callback |
| EDT-15 | 17-01, 17-06 | Plugin activates when DECO_BLOCKS_BINDING detected | SATISFIED | `ClientPlugin<typeof DECO_BLOCKS_BINDING>`; registered in `apps/mesh/src/web/plugins.ts` |

All 15 EDT requirements are SATISFIED. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `client/components/page-composer.tsx` | 115, 126 | Comments mentioning "useEffect" | Info | Comments clarifying why useEffect is NOT used — intentional documentation |
| `client/lib/use-iframe-bridge.ts` | 86, 136 | Comments mentioning "useEffect" | Info | Same — comments explaining the avoidance pattern |

No blocker anti-patterns found. No `useEffect` imports exist anywhere in the client code (confirmed with grep). The comment references are documentation of the intentional design choice.

### Human Verification Required

#### 1. Visual composer layout and slide navigation

**Test:** Open the site-editor plugin on a project with DECO_BLOCKS_BINDING. Click a page. Click a section in the left panel.
**Expected:** Left panel slides to reveal the prop editor (RJSF form) with a back button. Clicking back slides to the section list.
**Why human:** CSS `translate-x` transition and panel animation cannot be verified programmatically.

#### 2. Drag-and-drop section reordering

**Test:** In the composer, drag a section to a different position in the list.
**Expected:** Section moves to the new position; the change persists (auto-saved via `updatePage`).
**Why human:** DnD interaction requires pointer events in a real browser.

#### 3. Iframe preview and postMessage bridge

**Test:** Open a page composer when `connection.metadata.previewUrl` is set to a running deco dev server.
**Expected:** Iframe loads the preview URL; clicking blocks in the iframe highlights them in the section list; mode toggle controls pointer events.
**Why human:** Requires a live deco dev server running behind the connection.

#### 4. Commit message generation via Claude Haiku

**Test:** With `ANTHROPIC_API_KEY` set and a page with pending git changes, click Commit in the footer.
**Expected:** Dialog appears with a generated commit message (not empty). User can edit and confirm. `git log` shows the new commit.
**Why human:** Requires a live Anthropic API key and a running bash-capable deco connection.

#### 5. Plugin tab auto-activation

**Test:** Open Mesh UI. Navigate to a project without DECO_BLOCKS_BINDING — confirm Site Editor tab is absent. Navigate to a project with DECO_BLOCKS_BINDING — confirm Site Editor tab appears.
**Expected:** Tab visibility is controlled by the binding — no manual toggle required.
**Why human:** Requires two real project connections with different binding configurations.

### Gaps Summary

No gaps. All 15 requirements are satisfied, all 26 artifacts are substantive and wired, all 13 key links are verified, and TypeScript compiles with zero errors (`bun run check` exits 0).

The only items requiring human attention are behavioral/visual verifications that cannot be confirmed via static analysis.

---

_Verified: 2026-02-21T19:45:00Z_
_Verifier: Claude (gsd-verifier)_
