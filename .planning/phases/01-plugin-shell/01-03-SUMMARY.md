---
phase: 01-plugin-shell
plan: 03
subsystem: ui
tags: [mesh-plugin, site-editor, page-crud, mcp-proxy, react-query, tanstack-router]

# Dependency graph
requires:
  - phase: 01-plugin-shell-01
    provides: "SITE_BINDING definition and plugin package skeleton with router"
provides:
  - "Five server-side CMS_PAGE_* tools for page CRUD via MCP proxy"
  - "Client-side page-api helpers using SITE_BINDING tools directly"
  - "Pages list UI with create/delete actions"
  - "Page editor UI with title/path editing and metadata display"
  - "React Query cache keys for page data"
affects: [02-page-crud, 03-section-editor, phase-3-visual-editing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Page JSON schema: { id, path, title, blocks, metadata } in .deco/pages/{id}.json"
    - "Client page-api: CRUD helpers wrapping SITE_BINDING tools (READ_FILE, PUT_FILE, LIST_FILES)"
    - "Delete via tombstone: PUT_FILE with { deleted: true } when DELETE_FILE unavailable"
    - "Server tools take connectionId and create MCP proxy internally"

key-files:
  created:
    - packages/mesh-plugin-site-editor/server/tools/page-list.ts
    - packages/mesh-plugin-site-editor/server/tools/page-get.ts
    - packages/mesh-plugin-site-editor/server/tools/page-create.ts
    - packages/mesh-plugin-site-editor/server/tools/page-update.ts
    - packages/mesh-plugin-site-editor/server/tools/page-delete.ts
    - packages/mesh-plugin-site-editor/client/lib/page-api.ts
    - packages/mesh-plugin-site-editor/client/lib/query-keys.ts
    - packages/mesh-plugin-site-editor/client/components/page-editor.tsx
  modified:
    - packages/mesh-plugin-site-editor/server/tools/index.ts
    - packages/mesh-plugin-site-editor/client/components/pages-list.tsx
    - packages/mesh-plugin-site-editor/client/lib/router.ts

key-decisions:
  - "Client uses SITE_BINDING tools directly via page-api helpers instead of calling CMS_PAGE_* server tools"
  - "Delete uses tombstone pattern (PUT_FILE with deleted:true) since SITE_BINDING lacks DELETE_FILE"
  - "Page IDs generated with nanoid(8) prefixed by page_ (e.g., page_V1StGXR8)"
  - "Used ref-based sync instead of useEffect for form state initialization (useEffect banned by lint)"

patterns-established:
  - "Page file convention: .deco/pages/{page_id}.json with pretty-printed JSON"
  - "Tombstone deletion: { deleted: true, deletedAt } -- list/get operations skip tombstoned files"
  - "Dual CRUD layer: server tools for AI/MCP access, client page-api for UI"

# Metrics
duration: 8min
completed: 2026-02-14
---

# Phase 1 Plan 3: Page CRUD Summary

**Five page CRUD server tools via MCP proxy plus Pages list and editor UI using SITE_BINDING tools with React Query caching**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-14T12:27:25Z
- **Completed:** 2026-02-14T12:35:24Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Five server-side MCP tools (CMS_PAGE_LIST, CMS_PAGE_GET, CMS_PAGE_CREATE, CMS_PAGE_UPDATE, CMS_PAGE_DELETE) proxying file operations through MCP connections
- Client-side page-api module providing typed CRUD helpers using SITE_BINDING tools directly
- Pages list view with create dialog, delete confirmation, navigation to editor
- Page editor with title/path form, save action, breadcrumb navigation, and read-only metadata display

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement five page CRUD server tools** - `94ec844c8` (feat)
2. **Task 2: Implement Pages list and page editor UI components** - `4dae337c4` (feat)

## Files Created/Modified
- `packages/mesh-plugin-site-editor/server/tools/page-list.ts` - CMS_PAGE_LIST: lists pages from .deco/pages/ via LIST_FILES + READ_FILE
- `packages/mesh-plugin-site-editor/server/tools/page-get.ts` - CMS_PAGE_GET: reads single page by ID
- `packages/mesh-plugin-site-editor/server/tools/page-create.ts` - CMS_PAGE_CREATE: creates page with nanoid ID
- `packages/mesh-plugin-site-editor/server/tools/page-update.ts` - CMS_PAGE_UPDATE: read-merge-write with timestamp update
- `packages/mesh-plugin-site-editor/server/tools/page-delete.ts` - CMS_PAGE_DELETE: tries DELETE_FILE, falls back to tombstone
- `packages/mesh-plugin-site-editor/server/tools/index.ts` - Exports array of 5 tools
- `packages/mesh-plugin-site-editor/client/lib/page-api.ts` - Client CRUD helpers using SITE_BINDING tools
- `packages/mesh-plugin-site-editor/client/lib/query-keys.ts` - React Query keys for pages
- `packages/mesh-plugin-site-editor/client/components/pages-list.tsx` - Pages list with create/delete/navigate
- `packages/mesh-plugin-site-editor/client/components/page-editor.tsx` - Page metadata editor form
- `packages/mesh-plugin-site-editor/client/lib/router.ts` - Updated /pages/$pageId to use page-editor

## Decisions Made
- **Client uses SITE_BINDING tools directly:** The plugin's `toolCaller` is connected to the site's MCP (not the SELF MCP where server plugin tools live). Client-side page-api helpers call READ_FILE/PUT_FILE/LIST_FILES through the binding's toolCaller. Server tools remain for AI agent access via SELF MCP.
- **Tombstone deletion:** SITE_BINDING lacks DELETE_FILE. Server tools try DELETE_FILE first (may exist on the MCP server), fall back to tombstone. Client always uses tombstone since it only has binding tools.
- **Ref-based form sync:** Replaced useEffect with ref-based sync pattern for initializing form state from query data, because useEffect is banned by project lint rules.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Client cannot call CMS_PAGE_* server tools through toolCaller**
- **Found during:** Task 2 (Pages list UI)
- **Issue:** The plan specified calling CMS_PAGE_LIST/CREATE/DELETE/GET/UPDATE through `toolCaller` from `usePluginContext`. However, the plugin's `toolCaller` is connected to the site's MCP connection (which only has READ_FILE, PUT_FILE, LIST_FILES). Server plugin tools live on the SELF MCP, not the site connection.
- **Fix:** Created `client/lib/page-api.ts` with CRUD helpers that call SITE_BINDING tools directly. Server tools retained for AI/MCP agent access.
- **Files modified:** page-api.ts (new), pages-list.tsx, page-editor.tsx
- **Verification:** Client components use page-api helpers with typed SITE_BINDING toolCaller
- **Committed in:** 4dae337c4 (Task 2 commit)

**2. [Rule 1 - Bug] useEffect banned by project lint rules**
- **Found during:** Task 2 (Page editor)
- **Issue:** `useEffect` is not allowed per project ESLint rules (ban-use-effect). Page editor used useEffect to sync form state from query data.
- **Fix:** Replaced with ref-based sync pattern: track lastSyncedPageId via useRef and sync in render when data changes.
- **Files modified:** page-editor.tsx
- **Verification:** Lint passes, form state syncs correctly on data load
- **Committed in:** 4dae337c4 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes essential. The client-side page-api adds a thin layer but preserves the same CRUD semantics. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Page CRUD is complete for both server (AI agents) and client (UI) paths
- Pages stored as JSON in .deco/pages/ following the schema: { id, path, title, blocks, metadata }
- Ready for Phase 2 to add section CRUD (same pattern, different .deco/ subdirectory)
- Ready for Phase 3 to add visual block editing within the page editor

## Self-Check: PASSED

All 11 files verified. Both task commits (94ec844c8, 4dae337c4) found in git log.

---
*Phase: 01-plugin-shell*
*Completed: 2026-02-14*
