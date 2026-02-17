---
phase: 05-publishing
plan: 01
subsystem: ui
tags: [branches, draft-publish, site-binding, mcp-tools, react-query, useSyncExternalStore]

requires:
  - phase: 01-plugin-shell
    provides: "SITE_BINDING with READ_FILE/PUT_FILE/LIST_FILES, plugin header, usePluginContext"
provides:
  - "SITE_BINDING extended with CREATE_BRANCH, LIST_BRANCHES, MERGE_BRANCH, DELETE_BRANCH (optional tools)"
  - "Server tools CMS_BRANCH_LIST/CREATE/MERGE/DELETE for AI access"
  - "Client branch-api.ts with graceful degradation for branch operations"
  - "BranchSwitcher component with draft creation UI"
  - "PublishBar component with merge and discard actions"
  - "Module-level branch store via useSyncExternalStore"
affects: [05-publishing, site-editor-plugin]

tech-stack:
  added: []
  patterns: ["useSyncExternalStore for cross-tree state sharing", "optional tool binders with opt: true"]

key-files:
  created:
    - packages/mesh-plugin-site-editor/server/tools/branch-list.ts
    - packages/mesh-plugin-site-editor/server/tools/branch-create.ts
    - packages/mesh-plugin-site-editor/server/tools/branch-merge.ts
    - packages/mesh-plugin-site-editor/server/tools/branch-delete.ts
    - packages/mesh-plugin-site-editor/client/lib/branch-api.ts
    - packages/mesh-plugin-site-editor/client/lib/branch-context.tsx
    - packages/mesh-plugin-site-editor/client/components/branch-switcher.tsx
    - packages/mesh-plugin-site-editor/client/components/publish-bar.tsx
  modified:
    - packages/bindings/src/well-known/site.ts
    - packages/mesh-plugin-site-editor/shared.ts
    - packages/mesh-plugin-site-editor/server/tools/index.ts
    - packages/mesh-plugin-site-editor/client/lib/query-keys.ts
    - packages/mesh-plugin-site-editor/client/components/plugin-header.tsx

key-decisions:
  - "Used useSyncExternalStore module-level store instead of React.createContext for branch state, since header and route components are siblings in the plugin layout tree and cannot share a common provider ancestor"
  - "Branch tools marked as optional (opt: true) in SITE_BINDING since not all MCPs support branching"
  - "Client branch-api returns null on error for graceful degradation when branch tools unsupported"

patterns-established:
  - "Optional binding tools: use opt: true in ToolBinder satisfies for tools not all MCPs implement"
  - "Module-level store with useSyncExternalStore for state shared across plugin header and route components"

duration: 4min
completed: 2026-02-14
---

# Phase 5 Plan 1: Branch Lifecycle & Draft/Publish UI Summary

**SITE_BINDING extended with 4 optional branch tools, branch switcher dropdown with draft creation, and publish bar with merge/discard actions using module-level store**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-14T14:24:35Z
- **Completed:** 2026-02-14T14:28:58Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Extended SITE_BINDING with CREATE_BRANCH, LIST_BRANCHES, MERGE_BRANCH, DELETE_BRANCH as optional tools
- Created 4 server tools and client API helpers with graceful degradation
- Built BranchSwitcher dropdown with inline draft creation and branch status indicators
- Built PublishBar with merge-to-main (publish) and discard actions with loading states
- Integrated both into plugin header with lazy loading

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend SITE_BINDING with branch tools and create server tools + client API** - `dc82ec150` (feat)
2. **Task 2: Build branch switcher and publish bar UI components** - `a9ef28d19` (feat)

## Files Created/Modified
- `packages/bindings/src/well-known/site.ts` - Added 4 optional branch tool binders to SITE_BINDING
- `packages/mesh-plugin-site-editor/shared.ts` - Added DRAFT_BRANCH_PREFIX constant
- `packages/mesh-plugin-site-editor/server/tools/branch-list.ts` - CMS_BRANCH_LIST server tool
- `packages/mesh-plugin-site-editor/server/tools/branch-create.ts` - CMS_BRANCH_CREATE server tool
- `packages/mesh-plugin-site-editor/server/tools/branch-merge.ts` - CMS_BRANCH_MERGE server tool
- `packages/mesh-plugin-site-editor/server/tools/branch-delete.ts` - CMS_BRANCH_DELETE server tool
- `packages/mesh-plugin-site-editor/server/tools/index.ts` - Registered 4 new branch tools
- `packages/mesh-plugin-site-editor/client/lib/branch-api.ts` - Client helpers for branch operations
- `packages/mesh-plugin-site-editor/client/lib/query-keys.ts` - Added branches query key group
- `packages/mesh-plugin-site-editor/client/lib/branch-context.tsx` - Module-level branch store with useSyncExternalStore
- `packages/mesh-plugin-site-editor/client/components/branch-switcher.tsx` - Branch dropdown with draft creation
- `packages/mesh-plugin-site-editor/client/components/publish-bar.tsx` - Draft publish/discard bar
- `packages/mesh-plugin-site-editor/client/components/plugin-header.tsx` - Integrated BranchSwitcher and PublishBar

## Decisions Made
- Used `useSyncExternalStore` module-level store instead of React.createContext for branch state. The plugin layout renders header and route content as siblings, so a shared context provider ancestor is not available without modifying the mesh-sdk layout. The module-level store pattern works across any component in the same bundle.
- Branch tools marked as `opt: true` in SITE_BINDING since not all MCP implementations support branching. The binding checker skips optional tools when matching connections.
- Client branch-api returns `null` on error for graceful degradation when branch tools are not supported by the underlying MCP server.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Changed from React Context to module-level store for branch state**
- **Found during:** Task 2 (Branch switcher and publish bar)
- **Issue:** Plan specified using React.createContext with BranchProvider wrapping plugin root. However, the plugin layout in mesh-sdk renders renderHeader and Outlet as siblings under PluginContextProvider -- the plugin cannot inject a provider that wraps both.
- **Fix:** Used useSyncExternalStore with module-level state, which works across any component in the bundle without needing a common provider ancestor.
- **Files modified:** client/lib/branch-context.tsx
- **Verification:** Both BranchSwitcher (in header) and future route components can call useBranch() to read/set the active branch.
- **Committed in:** a9ef28d19 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Architecture improvement. Module-level store is simpler and more robust than context for this use case.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Branch lifecycle tools available for Plans 02 (branch-scoped file operations) and 03 (preview integration)
- BranchSwitcher and PublishBar integrated and ready for end-to-end testing when MCP supports branch tools

## Self-Check: PASSED

All 13 files verified on disk. Both commit hashes (dc82ec150, a9ef28d19) found in git log. SUMMARY.md exists.

---
*Phase: 05-publishing*
*Completed: 2026-02-14*
