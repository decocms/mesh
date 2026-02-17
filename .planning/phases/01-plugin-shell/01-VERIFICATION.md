---
phase: 01-plugin-shell
verified: 2026-02-14T12:00:00Z
status: gaps_found
score: 8/10
gaps:
  - truth: "CMS plugin appears in Mesh admin with Pages, Sections, and Loaders in the sidebar navigation"
    status: partial
    reason: "Sidebar items registered but navigation links may not be wired correctly"
    artifacts:
      - path: "packages/mesh-plugin-site-editor/client/index.tsx"
        issue: "Sidebar items missing explicit route paths"
    missing:
      - "Verify sidebar item click handlers navigate to correct routes (/pages, /sections, /loaders)"
  - truth: "User starts their local dev server and the tunnel makes it accessible to Mesh admin, showing the running site in a preview panel"
    status: partial
    reason: "Preview panel exists but tunnel integration needs human verification"
    artifacts:
      - path: "packages/mesh-plugin-site-editor/client/components/preview-panel.tsx"
        issue: "Tunnel URL extraction from connection metadata requires testing with actual deco link"
      - path: "packages/mesh-plugin-site-editor/client/lib/use-tunnel-url.ts"
        issue: "Assumes connection.metadata.previewUrl is set by deco link - needs integration testing"
    missing:
      - "Test deco link command sets connection.metadata.previewUrl correctly"
      - "Verify preview panel iframe loads the tunnel URL"
      - "Test page path parameter appends correctly to tunnel URL"
human_verification:
  - test: "Create Site project, configure MCP connection"
    expected: "User can create a Site project in Mesh and add a connection using SITE_BINDING"
    why_human: "Requires UI interaction and MCP configuration"
  - test: "Create, list, edit, delete pages"
    expected: "Full page CRUD works end-to-end with persistence to .deco/pages/"
    why_human: "Requires UI interaction and file system verification"
  - test: "Start dev server and run deco link"
    expected: "Preview panel shows running site via tunnel URL"
    why_human: "Requires external process (dev server, deco link) and network connectivity"
  - test: "Navigate sidebar items"
    expected: "Clicking Pages/Sections/Loaders navigates to correct views"
    why_human: "Requires UI interaction to verify routing"
---

# Phase 01: Plugin Shell Verification Report

**Phase Goal:** Users can create a Site project in Mesh, connect it to their local codebase via MCP, manage CMS pages, and preview their running dev server -- all through the Mesh admin interface

**Verified:** 2026-02-14T12:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SITE_BINDING declares READ_FILE, PUT_FILE, LIST_FILES capabilities | ✓ VERIFIED | `packages/bindings/src/well-known/site.ts` defines all three tools with schemas |
| 2 | Site-editor plugin exists with client and server entry points | ✓ VERIFIED | `packages/mesh-plugin-site-editor/client/index.tsx` and `server/index.ts` exist |
| 3 | Plugin registers in Mesh admin with Pages, Sections, Loaders in sidebar | ⚠️ PARTIAL | Sidebar items registered but navigation links need verification |
| 4 | User can create a new page with title and path | ✓ VERIFIED | `page-api.ts` createPage() + pages-list.tsx create dialog |
| 5 | User can see page list with metadata | ✓ VERIFIED | `pages-list.tsx` renders table with title, path, updatedAt |
| 6 | User can edit page metadata (title, path) | ✓ VERIFIED | `page-editor.tsx` form with save mutation |
| 7 | User can delete a page | ✓ VERIFIED | `pages-list.tsx` delete button + deletePage() API |
| 8 | Page configs persist as JSON in .deco/pages/ via MCP | ✓ VERIFIED | All page operations use SITE_BINDING tools with `.deco/pages/` prefix |
| 9 | Preview panel exists and supports tunnel URL | ⚠️ PARTIAL | PreviewPanel component exists but tunnel integration needs testing |
| 10 | All file operations flow through SITE_BINDING | ✓ VERIFIED | Client uses TypedToolCaller, server uses proxy.callTool() |

**Score:** 8/10 truths verified (2 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/bindings/src/well-known/site.ts` | SITE_BINDING with READ_FILE, PUT_FILE, LIST_FILES | ✓ VERIFIED | 109 lines, defines all 3 tools with zod schemas |
| `packages/mesh-plugin-site-editor/client/index.tsx` | Client plugin entry point | ✓ VERIFIED | 56 lines, exports clientPlugin with SITE_BINDING |
| `packages/mesh-plugin-site-editor/server/index.ts` | Server plugin entry point | ✓ VERIFIED | 18 lines, exports serverPlugin with tools |
| `packages/mesh-plugin-site-editor/server/tools/` | Page CRUD tools | ✓ VERIFIED | 5 tools: LIST, GET, CREATE, UPDATE, DELETE |
| `packages/mesh-plugin-site-editor/client/components/pages-list.tsx` | Pages list UI | ✓ VERIFIED | 269 lines, full CRUD with dialog, mutations, table |
| `packages/mesh-plugin-site-editor/client/components/page-editor.tsx` | Page editor UI | ✓ VERIFIED | 233 lines, form with save, metadata display |
| `packages/mesh-plugin-site-editor/client/components/sections-list.tsx` | Sections list UI | ⚠️ STUB | 17 lines, placeholder "Sections will appear here..." |
| `packages/mesh-plugin-site-editor/client/components/loaders-list.tsx` | Loaders list UI | ⚠️ STUB | 16 lines, placeholder "Loaders will appear here..." |
| `packages/mesh-plugin-site-editor/client/components/preview-panel.tsx` | Preview iframe panel | ✓ VERIFIED | 62 lines, iframe with tunnel URL + empty state |
| `packages/mesh-plugin-site-editor/client/lib/page-api.ts` | Client-side page API | ✓ VERIFIED | 179 lines, 5 functions using TypedToolCaller |
| `packages/mesh-plugin-site-editor/client/lib/use-tunnel-url.ts` | Tunnel URL hook | ✓ VERIFIED | 44 lines, extracts previewUrl from connection metadata |
| `packages/mesh-plugin-site-editor/client/lib/router.ts` | Plugin router | ✓ VERIFIED | 42 lines, defines 4 routes: /, /pages/$pageId, /sections, /loaders |
| `apps/mesh/src/web/plugins.ts` | Client plugin registry | ✓ WIRED | Line 6: imports siteEditorPlugin, line 16: added to sourcePlugins array |
| `apps/mesh/src/server-plugins.ts` | Server plugin registry | ✓ WIRED | Line 14: imports siteEditorPlugin, line 25: added to serverPlugins array |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| Client plugin | SITE_BINDING | `binding: SITE_BINDING` | ✓ WIRED | client/index.tsx line 24 |
| Client plugin | sidebar registration | `registerSidebarGroup()` | ✓ WIRED | client/index.tsx lines 31-49 |
| Client plugin | route registration | `registerPluginRoutes()` | ✓ WIRED | client/index.tsx lines 52-53 |
| pages-list.tsx | page-api.ts | imports + useMutation | ✓ WIRED | Lines 35, 72-93 |
| page-api.ts | TypedToolCaller | toolCaller("READ_FILE", ...) | ✓ WIRED | Lines 42, 56, 121, 137 |
| Server tools | MCP proxy | proxy.callTool() | ✓ WIRED | page-list.ts line 35, page-create.ts line 62 |
| preview-panel.tsx | useTunnelUrl | import + hook call | ✓ WIRED | Lines 12, 20 |
| useTunnelUrl | connection.metadata | connection?.metadata?.previewUrl | ⚠️ PARTIAL | use-tunnel-url.ts lines 37-41 - requires deco link |
| Sidebar items | Routes | Auto-wiring via router | ? NEEDS HUMAN | Sidebar items don't have explicit route paths |
| apps/mesh | siteEditorPlugin | import + array inclusion | ✓ WIRED | plugins.ts line 6+16, server-plugins.ts line 14+25 |

### Requirements Coverage

No REQUIREMENTS.md file found in the mesh project. Verification based on phase goal success criteria:

| Criterion | Status | Blocking Issue |
|-----------|--------|----------------|
| 1. Create Site project with MCP connection | ? NEEDS HUMAN | Requires UI testing |
| 2. SITE_BINDING with READ_FILE, PUT_FILE, LIST_FILES | ✓ SATISFIED | Binding defined and wired |
| 3. Create, list, edit, delete pages persisted via MCP | ✓ SATISFIED | Full page CRUD implemented |
| 4. Start dev server + tunnel for preview | ⚠️ PARTIAL | Preview panel exists, tunnel integration untested |
| 5. CMS plugin with Pages/Sections/Loaders in sidebar | ⚠️ PARTIAL | Sidebar registered, navigation wiring needs verification |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| client/components/sections-list.tsx | 8-17 | Placeholder component | ℹ️ INFO | Expected - Phase 1 only implements Pages |
| client/components/loaders-list.tsx | 8-16 | Placeholder component | ℹ️ INFO | Expected - Phase 1 only implements Pages |
| client/lib/page-api.ts | 92-95 | Returns null on error | ℹ️ INFO | Legitimate error handling |

**No blocker anti-patterns found.** Placeholder components are documented as intentional for Phase 1.

### Human Verification Required

#### 1. Create Site Project and Configure MCP Connection

**Test:** In Mesh admin, create a new Site project and configure a connection using the SITE_BINDING (pointing to local-fs MCP for a deco project folder).

**Expected:** User can select SITE_BINDING-compatible MCP connections when setting up the project. The connection appears in the site-editor plugin's connection selector.

**Why human:** Requires UI interaction, MCP configuration, and understanding of connection creation flow in Mesh admin.

#### 2. Full Page CRUD Workflow

**Test:** 
1. Click "New Page" button
2. Enter title "Home" and path "/"
3. Save and verify page appears in list
4. Click on page to edit
5. Change title to "Home Page"
6. Save changes
7. Verify updated title in list
8. Delete page
9. Verify page removed from list
10. Check `.deco/pages/` folder in local filesystem for JSON files

**Expected:** All CRUD operations work smoothly. JSON files appear in `.deco/pages/` with correct content. Deleted pages write tombstone files.

**Why human:** Requires UI interaction across multiple views, form submission, and file system verification. Need to verify error handling, loading states, and optimistic updates.

#### 3. Dev Server Preview via Tunnel

**Test:**
1. Start local deco dev server (e.g., `deno task dev`)
2. Run `deco link` to create tunnel
3. Verify connection.metadata.previewUrl is set in Mesh
4. Open site-editor plugin in Mesh admin
5. Verify preview panel shows running site
6. Create page with path "/about"
7. Verify preview panel updates URL to show /about page

**Expected:** Preview panel loads iframe with tunnel URL. Changing pages in editor updates preview panel. Empty state shows instructions when tunnel not configured.

**Why human:** Requires external processes (dev server, deco link), network connectivity, tunnel service configuration. Need to verify iframe sandbox attributes, URL construction, and error states.

#### 4. Sidebar Navigation

**Test:**
1. Open site-editor plugin
2. Click "Pages" in sidebar
3. Verify shows pages list (/)
4. Click "Sections" in sidebar
5. Verify shows sections placeholder (/sections)
6. Click "Loaders" in sidebar
7. Verify shows loaders placeholder (/loaders)
8. Click "Pages" again
9. Verify returns to pages list

**Expected:** All sidebar items navigate to correct routes. Active item is highlighted. Route changes reflected in URL.

**Why human:** Requires UI interaction to verify routing, active states, and URL changes. Need to test navigation from different starting points.

### Gaps Summary

#### Gap 1: Sidebar Navigation Wiring

**Truth:** CMS plugin appears in Mesh admin with Pages, Sections, and Loaders in the sidebar navigation

**Status:** PARTIAL - sidebar items registered but navigation may not be wired

**Issue:** The sidebar items are registered with labels and icons but don't have explicit route paths in their definition. The navigation from sidebar items to routes relies on auto-wiring that needs verification.

**Evidence:**
- `client/index.tsx` lines 31-49 register sidebar group with 3 items (Pages, Sections, Loaders)
- Items only define `icon` and `label`, no `path` or `to` property
- Routes are registered separately via `registerPluginRoutes()` 
- Object-storage plugin uses same pattern (no explicit paths in sidebar items)

**Hypothesis:** The plugin system auto-wires sidebar items to routes based on registration order or route paths. Need to verify this works correctly and that clicking sidebar items navigates to the expected routes.

**To fix:** If navigation fails, sidebar items may need explicit route paths or click handlers. Check if `RegisterRootSidebarItemParams` type should include a `to` property.

#### Gap 2: Tunnel Integration

**Truth:** User starts their local dev server and the tunnel makes it accessible to Mesh admin, showing the running site in a preview panel

**Status:** PARTIAL - preview panel exists but tunnel integration untested

**Issue:** The tunnel URL extraction assumes `connection.metadata.previewUrl` is set by `deco link` command, but this integration has not been tested end-to-end.

**Evidence:**
- `use-tunnel-url.ts` lines 37-41: reads `connection.metadata.previewUrl`
- Comment states "set by deco link" but no code shows this actually happens
- Preview panel shows empty state when URL is null (line 33-44)
- No test data or mock for tunnel URL in plugin code

**Hypothesis:** The `deco link` CLI command (likely in mesh CLI package or separate deco CLI) should update the connection's metadata field with the tunnel URL. Need to verify this command exists and sets the metadata correctly.

**To fix:** 
1. Locate `deco link` command implementation
2. Verify it updates connection metadata with previewUrl
3. Test tunnel creation and metadata persistence
4. Document the expected metadata schema

---

_Verified: 2026-02-14T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
