---
phase: 17-site-editor-plugin
plan: 02
subsystem: ui
tags: [plugin, deco, site-editor, typescript, tanstack-query, git, filesystem]

# Dependency graph
requires:
  - phase: 17-site-editor-plugin
    plan: 01
    provides: packages/mesh-plugin-site-editor scaffold with ClientPlugin<DECO_BLOCKS_BINDING>
  - phase: 16-plugin-deco-blocks
    provides: DECO_BLOCKS_BINDING, BlockDefinition, LoaderDefinition in @decocms/bindings
provides:
  - packages/mesh-plugin-site-editor/client/lib/page-api.ts (Page CRUD via filesystem tools)
  - packages/mesh-plugin-site-editor/client/lib/block-api.ts (typed DECO_BLOCKS_BINDING calls)
  - packages/mesh-plugin-site-editor/client/lib/git-api.ts (git operations via bash tool)
  - packages/mesh-plugin-site-editor/client/lib/query-keys.ts (TanStack Query key constants)
affects: [17-03, 17-04, 17-05]

# Tech tracking
tech-stack:
  added:
    - nanoid (already dep — used for page ID generation)
  patterns:
    - GenericToolCaller for filesystem/bash tool calls (toolName + args → Promise<unknown>)
    - TypedToolCaller<DecoBlocksBinding> for binding-specific typed calls
    - Tombstone pattern for soft-deletes (deleted: true, deletedAt)
    - hasBashTool gates git UX at runtime (checks connection.tools array)

key-files:
  created:
    - packages/mesh-plugin-site-editor/client/lib/page-api.ts
    - packages/mesh-plugin-site-editor/client/lib/block-api.ts
    - packages/mesh-plugin-site-editor/client/lib/git-api.ts
    - packages/mesh-plugin-site-editor/client/lib/query-keys.ts
  modified: []

key-decisions:
  - "GenericToolCaller typed as (toolName, args) => Promise<unknown> — separate from TypedToolCaller since filesystem/bash tools are not in DECO_BLOCKS_BINDING"
  - "listPages handles both { entries: [...] } and direct array response shapes defensively — different MCP servers may return either format"
  - "hasBashTool gates git UI availability at runtime — git section hidden for non-local-dev connections without bash tool"
  - "deletePage uses tombstone pattern (written JSON with deleted: true) rather than physical delete — preserves git history"

patterns-established:
  - "Data access layer pattern: pure TypeScript functions, no React deps, called from TanStack Query hooks"
  - "Tombstone soft-delete: { deleted: true, deletedAt: ISO, id, title } written to same .json path"
  - "Git operations: all via bash tool with gitStatus/gitLog/gitShow/gitCheckout/gitCommit"

requirements-completed: [EDT-01, EDT-02, EDT-03, EDT-04, EDT-11, EDT-12, EDT-13, EDT-14]

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 17 Plan 02: Data Access Layer Summary

**Page CRUD via filesystem tools, block/loader listing via TypedToolCaller<DecoBlocksBinding>, and git history via bash tool — complete data contract for site editor TanStack Query hooks**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T19:14:12Z
- **Completed:** 2026-02-21T19:17:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created page-api.ts with full Page CRUD: listPages (defensive list handling + tombstone filtering), getPage, createPage, updatePage, deletePage
- Created block-api.ts with typed DECO_BLOCKS_BINDING calls: listBlocks and listLoaders via TypedToolCaller<DecoBlocksBinding>
- Created git-api.ts with all git operations (gitStatus, gitLog, gitShow, gitCheckout, gitCommit) + hasBashTool capability gate
- Created query-keys.ts with QUERY_KEYS constants for all 6 query families (pages, page, blocks, loaders, gitStatus, gitLog)
- TypeScript check passes with 0 errors across all 4 files

## Task Commits

Each task was committed atomically:

1. **Task 1: Create page-api.ts and query-keys.ts** - `e084a5754` (feat)
2. **Task 2: Create block-api.ts and git-api.ts** - `0045beccb` (feat)

**Plan metadata:** _(to be committed with SUMMARY.md and STATE.md)_

## Files Created/Modified
- `packages/mesh-plugin-site-editor/client/lib/page-api.ts` - GenericToolCaller type, Page/BlockInstance/PageMetadata interfaces, listPages/getPage/createPage/updatePage/deletePage
- `packages/mesh-plugin-site-editor/client/lib/query-keys.ts` - QUERY_KEYS constants for all TanStack Query keys
- `packages/mesh-plugin-site-editor/client/lib/block-api.ts` - TypedToolCaller<DecoBlocksBinding>, listBlocks and listLoaders
- `packages/mesh-plugin-site-editor/client/lib/git-api.ts` - GitCommit/GitFileStatus/GitStatusResult types, hasBashTool, gitStatus/gitLog/gitShow/gitCheckout/gitCommit

## Decisions Made
- GenericToolCaller is a separate type from TypedToolCaller since filesystem/bash tools (list, read, write, bash) are not part of DECO_BLOCKS_BINDING
- listPages uses defensive list response handling — both `result.entries` array and bare array response supported
- hasBashTool checks connection.tools array at runtime rather than at build time — git UI hides automatically for connections without bash
- Tombstone soft-delete preserves git history while hiding deleted pages from the editor list view

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data access layer complete — plans 17-03 through 17-05 can import from client/lib/ for TanStack Query hooks, drag-and-drop canvas, and property editor
- All 4 lib files TypeScript-clean with 0 errors
- No blockers

---
*Phase: 17-site-editor-plugin*
*Completed: 2026-02-21*
